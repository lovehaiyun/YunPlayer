// 路由：/api/admin/config
//   GET  /api/admin/config  → 读取当前生效配置（不含密码，仅回传用户名）
//   POST /api/admin/config  → 保存配置（body: {config:{...}, admin?:{user,pass}}）或恢复默认（body: {reset:true}）
// 鉴权：请求头 x-admin-user / x-admin-pass（值见 functions/_config.js 的 admin 字段）
//   后台可自定义账号密码：保存时在 KV 中存 SHA-256 加盐哈希；未自定义时回退 _config.js 中的明文
import { CONFIG } from "../../_config.js";
import { getConfig, jsonResponse } from "../../_lib.js";

/** SHA-256 十六进制摘要 */
async function sha256Hex(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** 生成随机盐（bytes 字节 → 十六进制字符串） */
function randomHex(bytes) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return [...arr].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** 校验登录：优先 KV 中的加盐哈希，回退 _config.js 明文 */
async function checkAuth(request, env) {
  const cfg = await getConfig(env);
  const a = cfg.admin || CONFIG.admin || { user: "admin", password: "admin888" };
  const user = request.headers.get("x-admin-user");
  const pass = request.headers.get("x-admin-pass") || "";
  if (user !== (a.user || "admin")) return false;
  if (a.passHash && a.salt) return (await sha256Hex(a.salt + pass)) === a.passHash;
  return pass === (a.password || "admin888");
}

const strOf = (v) => String(v == null ? "" : v).trim();

/** 归一化页脚配置（限长；键缺失时回退内置默认，显式传空字符串视为清空 → 前台隐藏该项） */
function normalizeFooter(f) {
  const d = (CONFIG.footer || {});
  const src = f && typeof f === "object" ? f : {};
  const pick = (k, max) => {
    const raw = k in src ? src[k] : d[k];
    return strOf(raw).slice(0, max);
  };
  return {
    contactText: pick("contactText", 20),
    email: pick("email", 80),
    note: pick("note", 500),
    // 版权信息始终保持有值，避免页脚行首出现多余分隔符
    copyright: pick("copyright", 120) || strOf(d.copyright),
    icp: pick("icp", 60),
    extra: pick("extra", 120),
  };
}

/** 归一化接口/资源站列表，过滤非法项，避免脏数据导致后续 500 */
function normalizeList(list, { name, hasType }) {
  if (!Array.isArray(list)) return [];
  return list
    .map((it) => {
      if (!it || typeof it !== "object") return null;
      const url = strOf(it.url);
      if (!/^https?:\/\//i.test(url)) return null;
      const row = { name: strOf(it.name) || name, url, off: it.off ? 1 : 0 };
      if (hasType) row.type = Number(it.type) === 1 ? 1 : 0;
      return row;
    })
    .filter(Boolean);
}

export async function onRequest(context) {
  const { request, env } = context;

  if (!(await checkAuth(request, env))) {
    return jsonResponse({ success: 0, m: "登录验证失败" }, 401);
  }
  if (!env.CONFIG_KV) {
    return jsonResponse({ success: 0, m: "未绑定 CONFIG_KV，请在 Cloudflare 控制台创建 KV 并绑定到项目", kvMissing: true });
  }

  if (request.method === "GET") {
    const cfg = await getConfig(env);
    const a = cfg.admin || {};
    // 不回传密码或其哈希，仅回传用户名供后台展示
    return jsonResponse({
      success: 1,
      config: {
        title: cfg.title || "YunPlayer",
        intro: cfg.intro || "",
        theme: cfg.theme === "light" ? "light" : "dark",
        footer: cfg.footer || {},
        hot: cfg.hot || [],
        parse: cfg.parse || [],
        resources: cfg.resources || [],
        adminUser: a.user || "admin",
      },
    });
  }

  if (request.method === "POST") {
    const body = await request.json().catch(() => ({}));

    // 恢复默认配置
    if (body.reset) {
      await env.CONFIG_KV.delete("config");
      return jsonResponse({ success: 1, m: "已恢复默认配置" });
    }

    const cfg = body.config;
    if (!cfg || !Array.isArray(cfg.resources) || !Array.isArray(cfg.parse)) {
      return jsonResponse({ success: 0, m: "配置格式不正确" }, 400);
    }
    const parse = normalizeList(cfg.parse, { name: "解析接口" });
    const resources = normalizeList(cfg.resources, { name: "资源站", hasType: true });
    if (!parse.length && !resources.length) {
      return jsonResponse({ success: 0, m: "请至少保留一个有效接口（地址需以 http/https 开头）" }, 400);
    }
    const toSave = {
      title: strOf(cfg.title) || "YunPlayer",
      intro: strOf(cfg.intro).slice(0, 500),
      theme: cfg.theme === "light" ? "light" : "dark",
      footer: normalizeFooter(cfg.footer),
      hot: Array.isArray(cfg.hot) ? cfg.hot.map(strOf).filter(Boolean) : [],
      parse,
      resources,
    };

    // 后台账号：默认沿用 KV 中已保存的账号，避免「保存站点设置」时把已修改的密码冲掉
    const adminIn = body.admin;
    const hasAdminInput =
      adminIn && typeof adminIn === "object" && (strOf(adminIn.user) || strOf(adminIn.pass));
    const cur = (await getConfig(env)).admin || {};
    if (hasAdminInput) {
      const user = strOf(adminIn.user) || strOf(cur.user) || "admin";
      const pass = strOf(adminIn.pass);
      // 未提供新密码时：沿用已有哈希；若旧值来自文件明文则迁移为哈希
      const plain = pass || (cur.passHash ? "" : strOf(cur.password) || "admin888");
      if (plain) {
        const salt = randomHex(16);
        toSave.admin = { user, salt, passHash: await sha256Hex(salt + plain) };
      } else {
        toSave.admin = { user, salt: cur.salt, passHash: cur.passHash };
      }
    } else if (cur.passHash && cur.salt) {
      // 本次未修改账号：保留原有加盐哈希，否则会回退到 _config.js 的默认密码
      toSave.admin = { user: strOf(cur.user) || "admin", salt: cur.salt, passHash: cur.passHash };
    }

    await env.CONFIG_KV.put("config", JSON.stringify(toSave));
    return jsonResponse({ success: 1, m: "配置已保存" });
  }

  return jsonResponse({ success: 0, m: "不支持的请求方式" }, 405);
}