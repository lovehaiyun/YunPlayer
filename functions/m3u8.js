// 路由：GET /m3u8?url=xxx
// m3u8 跨域代理：将分片/多码率/加密密钥地址重写为本站地址，绕过防盗链与 CORS 限制。
// 播放列表(.m3u8/.m3u) → 文本重写；分片/密钥等二进制 → 原样透传（避免文本解码损坏数据）。
import { fetchText, fetchStream, jsonResponse } from "./_lib.js";

/** 屏蔽本机/内网地址，避免该代理被用于探测或访问内部服务 */
function isBlockedHost(host) {
  const h = String(host || "").toLowerCase().replace(/^\[|\]$/g, "");
  if (!h) return true;
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h.endsWith(".local")) {
    return true;
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
    const p = h.split(".").map(Number);
    if (p[0] === 0 || p[0] === 10 || p[0] === 127) return true;
    if (p[0] === 169 && p[1] === 254) return true;
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
    if (p[0] === 192 && p[1] === 168) return true;
  }
  // IPv6 需含冒号才判定，否则会把 fc2.com 之类的合法域名误封
  if (h.indexOf(":") >= 0) {
    if (h === "::1" || h.startsWith("fe80:") || h.startsWith("fc") || h.startsWith("fd")) return true;
  }
  return false;
}

export async function onRequest(context) {
  const reqUrl = new URL(context.request.url);
  const origin = reqUrl.origin;
  const proxyBase = "/m3u8?url=";
  const target = reqUrl.searchParams.get("url");
  if (!target) return jsonResponse({ success: 0, m: "缺少 url 参数" }, 400);

  let srcUrl;
  try {
    srcUrl = new URL(target);
  } catch (e) {
    return jsonResponse({ success: 0, m: "url 参数不合法" }, 400);
  }
  if (srcUrl.protocol !== "http:" && srcUrl.protocol !== "https:") {
    return jsonResponse({ success: 0, m: "仅支持 http/https 地址" }, 400);
  }
  if (isBlockedHost(srcUrl.hostname)) {
    return jsonResponse({ success: 0, m: "该地址不被允许" }, 403);
  }

  const isPlaylist = /\.m3u8?([?#]|$)/i.test(target);
  // 用 URL 解析相对地址：兼容 ../ 反斜路径、//host/x.ts（协议相对）以及带查询串的清单地址
  const join = (u) => {
    try {
      return new URL(u, srcUrl.href).href;
    } catch (e) {
      return u;
    }
  };

  // ---------- 分片 / 密钥：流式透传（不缓冲，避免整段下载完才回传导致卡顿） ----------
  if (!isPlaylist) {
    const res = await fetchStream(target, 20000, context.request.headers.get("range"));
    if (!res || !res.ok || !res.body) return jsonResponse({ success: 0, m: "获取分片失败" }, 502);
    const ct = res.headers.get("content-type") || "";
    const type = /\.ts([?#]|$)/i.test(target) || /video\/mp2t/i.test(ct)
      ? "video/mp2t"
      : ct || "application/octet-stream";
    const headers = {
      "Content-Type": type,
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "max-age=86400",
    };
    // 回传范围信息，否则浏览器无法确认按需取字节的结果（fMP4/CMAF 会退化成整段下载）
    const cr = res.headers.get("content-range");
    if (cr) headers["Content-Range"] = cr;
    const ar = res.headers.get("accept-ranges");
    if (ar) headers["Accept-Ranges"] = ar;
    return new Response(res.body, { status: res.status, headers });
  }

  // ---------- 播放列表：文本重写 ----------
  const data = await fetchText(target, 15000);
  if (!data) return jsonResponse({ success: 0, m: "获取 m3u8 失败" });

  const out = data
    .split(/\r?\n/)
    .map((line) => {
      const v = line.trim();
      if (!v || v[0] === "#") {
        // 重写 URI="..." 属性：加密密钥 KEY / 备用音频或字幕 MEDIA / I-FRAME 流 / 初始化段 MAP / 低延迟 PART
        if (/^#EXT-X-(KEY|MEDIA|I-FRAME-STREAM-INF|SESSION-KEY|MAP|PART|PRELOAD-HINT):/i.test(v)) {
          return v.replace(/URI="([^"]+)"/i, (mm, uri) => `URI="${origin + proxyBase + encodeURIComponent(join(uri))}"`);
        }
        return line;
      }
      return origin + proxyBase + encodeURIComponent(join(v));
    })
    .join("\n");

  // 直播清单（无 ENDLIST）内容持续变化，缓存会让播放卡在旧清单上
  const isLive = !/#EXT-X-ENDLIST/i.test(data);

  return new Response(out, {
    headers: {
      "Content-Type": "application/vnd.apple.mpegurl; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": isLive ? "no-store" : "max-age=300",
    },
  });
}
