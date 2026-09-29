// 路由：GET /m3u8?url=xxx
// m3u8 跨域代理：将分片/多码率/加密密钥地址重写为本站地址，绕过防盗链与 CORS 限制。
// 播放列表(.m3u8/.m3u) → 文本重写；分片/密钥等二进制 → 原样透传（避免文本解码损坏数据）。
import { fetchText, fetchBuf, jsonResponse } from "./_lib.js";

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
  if (h === "::1" || h.startsWith("fe80:") || h.startsWith("fc") || h.startsWith("fd")) return true;
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
  const pathBase = target.slice(0, target.lastIndexOf("/"));
  const join = (u) => {
    if (/^https?:\/\//i.test(u)) return u;
    if (u[0] === "/") return srcUrl.origin + u;
    return pathBase + "/" + u;
  };

  // ---------- 分片 / 密钥：二进制透传 ----------
  if (!isPlaylist) {
    const buf = await fetchBuf(target, 20000);
    if (!buf.ok || !buf.body) return jsonResponse({ success: 0, m: "获取分片失败" });
    const type = /\.ts([?#]|$)/i.test(target)
      ? "video/mp2t"
      : buf.type || "application/octet-stream";
    return new Response(buf.body, {
      status: buf.status,
      headers: {
        "Content-Type": type,
        "Content-Length": String(buf.body.byteLength),
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "max-age=86400",
      },
    });
  }

  // ---------- 播放列表：文本重写 ----------
  const data = await fetchText(target, 15000);
  if (!data) return jsonResponse({ success: 0, m: "获取 m3u8 失败" });

  const out = data
    .split(/\r?\n/)
    .map((line) => {
      const v = line.trim();
      if (!v || v[0] === "#") {
        // 重写 URI="..." 属性：加密密钥 KEY / 备用音频 MEDIA / I-FRAME 等
        if (/^#EXT-X-(KEY|MEDIA|I-FRAME-STREAM-INF|SESSION-KEY):/i.test(v)) {
          return v.replace(/URI="([^"]+)"/i, (mm, uri) => `URI="${origin + proxyBase + encodeURIComponent(join(uri))}"`);
        }
        return line;
      }
      return origin + proxyBase + encodeURIComponent(join(v));
    })
    .join("\n");

  return new Response(out, {
    headers: {
      "Content-Type": "application/vnd.apple.mpegurl; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "max-age=300",
    },
  });
}
