// ============================================================
// YunPlayer 核心工具库（仅供 functions 内部使用）
// ============================================================
import { CONFIG } from "./_config.js";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// 搜索引擎爬虫 UA：爱奇艺等平台对普通 UA 只返回 JS 空壳页，对爬虫才返回完整 SEO 标题
const BOT_UA =
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

// 搜索返回的结果条数上限（补图范围与此保持一致）
const MAX_RESULTS = 40;

// ---------- 网络请求 ----------

/** 带超时的文本抓取，失败返回空串；opts.ua 可覆盖 UA */
export async function fetchText(url, timeout = 12000, opts = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": opts.ua || UA, Accept: "*/*" },
      signal: ctrl.signal,
    });
    return await res.text();
  } catch (e) {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 流式抓取（不缓冲响应体）：供 m3u8 代理透传 .ts 分片/密钥使用。
 * 超时只作用于「拿到响应头」阶段，拿到后即清除计时器，
 * 否则大分片会在传输途中被中断，反而造成卡顿/失败。
 */
export async function fetchStream(url, timeout = 20000, range) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const headers = { "User-Agent": UA, Accept: "*/*" };
    // fMP4/CMAF 的分片按 Byte-Range 请求，透传 Range 才能只取需要的字节
    if (range) headers.Range = range;
    const res = await fetch(url, {
      redirect: "follow",
      headers,
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    return res;
  } catch (e) {
    clearTimeout(timer);
    return null;
  }
}

/** 并发抓取多个地址（限制同时并发数），保持与原数组顺序对应 */
export async function fetchMulti(urls, limit = 5, timeout) {
  const results = new Array(urls.length).fill("");
  let idx = 0;
  const worker = async () => {
    while (idx < urls.length) {
      const i = idx++;
      results[i] = await fetchText(urls[i], timeout);
    }
  };
  const n = Math.max(1, Math.min(limit, urls.length));
  await Promise.all(Array.from({ length: n }, worker));
  return results;
}

// ---------- 基础解析 ----------

/**
 * 判断是否为浏览器可直接播放的视频文件链接
 * 注：不含 flv —— Chrome 等现代浏览器已移除原生 FLV 支持，直链播放会失败
 */
function detectVideoFile(u) {
  return /^https?:\/\//i.test(u) && /\.(mp4|m3u8|webm|ogg|m4v)([?#]|$)/i.test(u);
}

/**
 * 把目标地址拼到解析接口地址后面。
 * 目标地址含 & / # / 空格 / 非 ASCII 时会污染解析接口自身的查询参数（如 & 会被当成新参数），
 * 此时对目标地址做 URL 编码；否则保持原样，兼容只接受明文地址的解析站。
 */
function appendTarget(base, target) {
  const t = String(target == null ? "" : target);
  return base + (/[&#\s]|[^\x00-\x7F]/.test(t) ? encodeURIComponent(t) : t);
}

/** 从 HTML 中提取 <title> 并清洗成可搜索的片名 */
function extractTitle(html) {
  const m = (html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return "";
  return cleanTitle(m[1]);
}

/** 清洗标题：去掉标签、多余空白和常见后缀（如 "剧名 - xxx播放站"、"《剧名》xxx-爱奇艺"） */
function cleanTitle(t) {
  t = (t || "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  t = t.split(/[|｜]|\s+[-_]\s*/)[0];
  // 《剧名》... → 取书名号内片名
  if (/^《.+》/.test(t)) {
    const m = t.match(/^《(.+)》/);
    if (m) t = m[1];
  }
  // 去掉末尾站点名（-爱奇艺 / 爱奇艺 / 优酷 等）
  t = t.replace(
    /-?(?:爱奇艺|优酷|腾讯视频|腾讯|哔哩哔哩|bilibili|搜狐视频|芒果TV|芒果tv|西瓜视频|乐视|PP视频|pptv|1905电影网|风行|56网|电影天堂)$/i,
    ""
  );
  t = t.replace(/【[^】]*】$/, "");
  t = t.replace(/[（(](高清|hd|超清|全集|免费|完整版|在线观看|国语|粤语|普通话|下载)[^）)]*[）)]$/i, "");
  t = t.replace(/(?:\s*(?:在线观看|完整版|电影完整版|高清|超清|全集|国语|粤语|普通话|中文字幕|无删减|抢先版|正版|下载))$/i, "");
  return t.trim();
}

/** 判断标题是否为站点通用文案（非影片名），用于触发爬虫 UA 重试 */
function isGenericTitle(t) {
  const s = cleanTitle(t);
  if (!s || s.length < 2) return true;
  if (
    /^(?:爱奇艺|优酷|腾讯视频|腾讯|哔哩哔哩|bilibili|搜狐视频|芒果TV|西瓜视频|乐视|PPTV|1905电影网|电影天堂|首页|404|错误|验证)$/i.test(
      s
    )
  ) {
    return true;
  }
  if (/在线视频|正版高清|视频网站|海量|官方网站|综合门户|页面不存在|not found/i.test(s)) {
    return true;
  }
  return false;
}

/** 解析剧集串："第1集$url#第2集$url2#..." */
function parseParts(str) {
  const parts = [];
  String(str || "")
    .split("#")
    .forEach((p) => {
      const kv = p.split("$");
      if (kv.length >= 2 && kv[1]) parts.push({ name: kv[0] || "正片", url: kv[1] });
    });
  return parts;
}

/** 解析资源站返回的 XML 搜索结果 */
function parseXmlSearch(html) {
  const out = [];
  const re = /<video>([\s\S]*?)<\/video>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const b = m[1];
    const g = (pat) => {
      const mm = b.match(pat);
      return mm ? mm[1].trim() : "";
    };
    const id = g(/<id>(.*?)<\/id>/);
    if (!id) continue;
    out.push({
      id,
      title: g(/<name>(.*?)<\/name>/),
      type: g(/<type>(.*?)<\/type>/),
      pic: g(/<pic>(.*?)<\/pic>/),
      desc: g(/<notes>(.*?)<\/notes>/),
    });
  }
  return out;
}

/** 解析资源站返回的播放列表（JSON / XML），返回 { name, sources:[{flag, parts}] } */
function parseVideoList(html) {
  const t = (html || "").trim();
  let name = "";
  const sources = [];
  if (t.startsWith("{")) {
    try {
      const j = JSON.parse(html);
      const v = (j.list || [])[0];
      if (!v) return { name, sources };
      name = v.vod_name || "";
      const note = v.vod_play_note || "$$$";
      const froms = String(v.vod_play_from || "").split(note);
      const urls = String(v.vod_play_url || "").split(note);
      froms.forEach((f, i) => {
        const parts = parseParts(urls[i]);
        if (parts.length) sources.push({ flag: f || "未知线路", parts });
      });
    } catch (e) {
      /* 忽略解析异常 */
    }
  } else if (t.startsWith("<")) {
    const n = html.match(/<name>([\s\S]*?)<\/name>/i);
    if (n) name = n[1].trim();
    const ddRe = /<dd([^>]*)>([\s\S]*?)<\/dd>/g;
    let m;
    while ((m = ddRe.exec(html)) !== null) {
      const fm = m[1].match(/flag="([^"]*)"/);
      const parts = parseParts(m[2]);
      if (parts.length) sources.push({ flag: fm ? fm[1] : "未知线路", parts });
    }
  }
  return { name, sources };
}

// ---------- 轻量缓存（Cloudflare Cache API） ----------
// 用于加速重复的搜索/详情请求，降低上游资源站压力；本地或异常环境不支持时自动跳过。

const CACHE_ORIGIN = "https://yunplayer.internal/";

async function cacheGet(key) {
  try {
    const res = await caches.default.match(CACHE_ORIGIN + key);
    if (res) return await res.json();
  } catch (e) {
    /* 缓存不可用时忽略 */
  }
  return null;
}

async function cachePut(key, data, ttl) {
  try {
    await caches.default.put(
      CACHE_ORIGIN + key,
      new Response(JSON.stringify(data), {
        headers: { "Content-Type": "application/json", "Cache-Control": "max-age=" + ttl },
      })
    );
  } catch (e) {
    /* 缓存不可用时忽略 */
  }
}

// ---------- 配置加载 ----------

/**
 * 读取生效配置：优先 Cloudflare KV（后台管理页保存的），
 * 未绑定 KV 或没有保存记录时回退到 _config.js 内置默认值。
 */
export async function getConfig(env) {
  if (env && env.CONFIG_KV) {
    try {
      const raw = await env.CONFIG_KV.get("config");
      if (raw) {
        const saved = JSON.parse(raw);
        // footer/admin 是嵌套对象，浅合并会让默认值里新增的字段整体丢失，需逐键合并
        return {
          ...CONFIG,
          ...saved,
          footer: { ...CONFIG.footer, ...(saved.footer || {}) },
          admin: { ...CONFIG.admin, ...(saved.admin || {}) },
        };
      }
    } catch (e) {
      /* KV 读取失败则用默认配置 */
    }
  }
  return CONFIG;
}

// ---------- 业务逻辑 ----------

/**
 * 按关键词并发搜索所有启用的资源站
 * opts.withPic === false 时跳过详情补图（供"按链接解析"等只需首条的场景使用，避免多余延迟）
 */
export async function search(name, cfg, opts = {}) {
  const withPic = opts.withPic !== false;
  const cacheKey = "search?wd=" + encodeURIComponent(name);
  const cached = await cacheGet(cacheKey);
  if (cached) return cached;
  const items = [];
  const jobs = [];
  cfg.resources.forEach((site, i) => {
    if (!site.off) return;
    const base = site.url.replace(/\/+$/, "");
    const qurl =
      site.type === 1
        ? base + "/wd/" + encodeURIComponent(name)
        : base + "?wd=" + encodeURIComponent(name);
    jobs.push({ site, flag: i, qurl });
  });
  const texts = await fetchMulti(jobs.map((j) => j.qurl), 5);
  jobs.forEach((j, n) => {
    const html = (texts[n] || "").trim();
    if (!html) return;
    let list = [];
    if (html.startsWith("{")) {
      try {
        const jj = JSON.parse(html);
        list = (jj.list || []).map((v) => ({
          // vod_id 缺失时不要产出字符串 "undefined"，否则会进入结果并导致详情请求失败
          id: v.vod_id == null ? "" : String(v.vod_id),
          title: v.vod_name || "",
          type: v.type_name || "",
          pic: v.vod_pic || "",
        }));
      } catch (e) {
        return;
      }
    } else if (html.startsWith("<")) {
      list = parseXmlSearch(html);
    }
    list.forEach((v) => {
      if (v.id && v.title)
        items.push({
          id: v.id,
          flag: j.flag,
          from: j.site.name,
          title: v.title,
          type: v.type || "",
          pic: v.pic || "",
        });
    });
  });
  // 按标题相似度排序，避免同义词排前面
  const key = cleanTitle(name);
  items.sort((a, b) => rank(a.title, key) - rank(b.title, key));
  // 聚合去重：相同片名（去年份/标点）只保留一条，附带其它站点的播放入口
  const norm = (t) => cleanTitle(t).replace(/[^\w\u4e00-\u9fa5]+/g, "").trim();
  const seen = new Map();
  const merged = [];
  for (const it of items) {
    const k = norm(it.title);
    if (!k) continue;
    if (!seen.has(k)) {
      const one = { ...it, sites: [{ flag: it.flag, id: it.id, from: it.from }] };
      seen.set(k, one);
      merged.push(one);
    } else {
      const cur = seen.get(k);
      if (!cur.sites.some((s) => s.flag === it.flag)) {
        cur.sites.push({ flag: it.flag, id: it.id, from: it.from });
      }
    }
  }
  const out = merged.slice(0, MAX_RESULTS);
  // 搜索结果缺封面时经详情接口批量补图（限量并发 + 短超时，避免拖慢搜索）
  // 资源站搜索接口普遍不返回封面；补图范围与返回条数保持一致
  if (withPic) {
    const needPic = out.filter((it) => !it.pic && cfg.resources[it.flag]);
    if (needPic.length) {
      const jobs = needPic.map((it) => ({
        it,
        qurl:
          cfg.resources[it.flag].url.replace(/\/+$/, "") +
          "?ac=videolist&ids=" +
          encodeURIComponent(it.id),
      }));
      const texts = await fetchMulti(jobs.map((j) => j.qurl), 10, 4000);
      jobs.forEach((j, n) => {
        const pic = extractPic(texts[n]);
        if (pic) j.it.pic = pic;
      });
    }
    // 只缓存非空结果：资源站临时超时/抽风时空数组会被当作命中，导致 2 分钟内一直搜不到
    if (out.length) await cachePut(cacheKey, out, 120);
  }
  return out;
}

/** 从详情接口返回中提取封面图（JSON / XML） */
function extractPic(html) {
  const t = (html || "").trim();
  if (!t) return "";
  if (t.startsWith("{")) {
    try {
      const j = JSON.parse(t);
      const v = (j.list || [])[0];
      return v && v.vod_pic ? String(v.vod_pic) : "";
    } catch (e) {
      return "";
    }
  }
  const m = t.match(/<pic>([\s\S]*?)<\/pic>/i);
  return m ? m[1].trim() : "";
}

function rank(title, key) {
  const t = cleanTitle(title);
  if (t === key) return 0;
  if (t.indexOf(key) >= 0) return 1;
  if (key.indexOf(t) >= 0) return 2;
  return 3;
}

/** 取启用中的解析接口列表 */
function enabledParses(cfg) {
  return (cfg.parse || []).filter((p) => p && p.off);
}

/** 解析接口展示名列表（无名时按序号兜底） */
function parseNames(list) {
  return list.map((p, i) => p.name || "解析接口 " + (i + 1));
}

/**
 * 按索引选取解析接口：越界或非法值回退到第 0 个（即默认使用第一个启用的接口）；
 * 无启用接口时 item 为 null、index 为 -1
 */
function pickParse(cfg, idx) {
  const list = enabledParses(cfg);
  if (!list.length) return { item: null, index: -1, list };
  const n = parseInt(idx, 10);
  const index = Number.isNaN(n) || n < 0 || n >= list.length ? 0 : n;
  return { item: list[index], index, list };
}

/** 为 jx 模式的结果附加「解析线路」信息（名称列表 + 当前索引），供前台切换标签使用 */
function withJx(res, pick) {
  if (res && res.type === "jx" && pick.index >= 0) {
    res.jxIndex = pick.index;
    res.jxList = parseNames(pick.list);
  }
  return res;
}

/** 根据资源站序号(flag) + 视频ID 获取播放数据（jxIdx 指定使用第几个启用的解析接口） */
export async function getVideoById(flag, id, cfg, jxIdx) {
  const site = cfg.resources[flag];
  if (!site || !site.off) return { success: 0, m: "资源站不可用" };
  const vid = String(id == null ? "" : id).trim();
  if (!vid) return { success: 0, m: "缺少视频 ID" };
  const pick = pickParse(cfg, jxIdx);
  // 缓存键需带解析接口索引，否则切换线路会命中上一个接口的结果
  const cacheKey = "video?flag=" + flag + "&id=" + encodeURIComponent(vid) + "&jx=" + pick.index;
  const cached = await cacheGet(cacheKey);
  if (cached) return cached;
  const html = await fetchText(
    site.url.replace(/\/+$/, "") + "?ac=videolist&ids=" + encodeURIComponent(vid)
  );
  if (!html) return { success: 0, m: "获取数据失败" };
  const { name, sources } = parseVideoList(html);
  if (!sources.length) return { success: 0, m: "未获取到播放地址" };
  const jx = pick.item;
  let type = "video";
  if (jx) {
    // 解析接口已启用 → 默认所有线路统一走解析接口播放（保留原始地址供前端筛选）
    const base = jx.url;
    sources.forEach((s) =>
      s.parts.forEach((p) => {
        p.raw = p.raw || p.url;
        p.url = appendTarget(base, p.raw);
      })
    );
    type = "jx";
  } else {
    // 解析接口关闭 → 仅保留直链线路，网页链接无法播放
    const direct = sources.filter((s) => s.parts.length && detectVideoFile(s.parts[0].url));
    if (!direct.length) {
      return { success: 0, m: "该资源为网页链接，需在后台开启第三方解析接口后才能播放" };
    }
    sources.length = 0;
    sources.push(...direct);
  }
  const first = sources[0];
  const res = withJx({
    success: 1,
    type,
    title: name || site.name,
    flag,
    from: site.name,
    part: 1,
    url: first.parts[0].url,
    parts: first.parts,
    sources,
  }, pick);
  await cachePut(cacheKey, res, 180);
  return res;
}

/** 根据视频链接解析播放：直链→标题搜索→第三方解析兜底（jxIdx 指定解析接口） */
export async function getVideoByUrl(inputUrl, cfg, jxIdx) {
  // 仅接受 http/https 链接，避免 javascript: 等异常协议流入播放器/解析接口
  if (!/^https?:\/\//i.test(String(inputUrl || "").trim())) {
    return { success: 0, m: "链接格式不正确，请粘贴以 http:// 或 https:// 开头的视频链接" };
  }
  inputUrl = String(inputUrl).trim();
  const pick = pickParse(cfg, jxIdx);
  const jx = pick.item;
  // 1. 直链（mp4/m3u8 等）：解析接口启用时默认走解析，否则直接播放
  if (detectVideoFile(inputUrl)) {
    if (jx) {
      const purl = appendTarget(jx.url, inputUrl);
      return withJx({
        success: 1,
        type: "jx",
        title: "视频",
        flag: -1,
        from: "解析接口",
        part: 1,
        url: purl,
        parts: [{ name: "播放", url: purl, raw: inputUrl }],
        sources: [{ flag: "解析", parts: [{ name: "播放", url: purl, raw: inputUrl }] }],
      }, pick);
    }
    return {
      success: 1,
      type: "video",
      title: "视频",
      flag: -1,
      from: "直链",
      part: 1,
      url: inputUrl,
      parts: [{ name: "正片", url: inputUrl }],
      sources: [{ flag: "直链", parts: [{ name: "正片", url: inputUrl }] }],
    };
  }
  // 2. 取页面标题并按片名搜索资源站（命中多站时聚合播放源）
  //    先按普通 UA 抓取；标题像站点通用文案（如爱奇艺空壳页）时，换爬虫 UA 重试取 SEO 标题
  let html = await fetchText(inputUrl);
  let title = extractTitle(html);
  if (!title || isGenericTitle(title)) {
    const html2 = await fetchText(inputUrl, 12000, { ua: BOT_UA });
    if (html2 && html2 !== html) title = extractTitle(html2) || title;
  }
  if (title) {
    // 此处只需首条结果，跳过补图以免额外延迟
    const list = await search(title, cfg, { withPic: false });
    if (list.length) {
      const best = list[0];
      const matched =
        best.sites && best.sites.length > 1
          ? await aggregateByIds(
              JSON.stringify(best.sites.map((s) => ({ flag: s.flag, id: s.id }))),
              cfg,
              pick.index
            )
          : await getVideoById(best.flag, best.id, cfg, pick.index);
      if (matched.success) return matched;
    }
  }
  // 3. 第三方解析接口兜底（iframe）
  if (jx) {
    const purl = appendTarget(jx.url, inputUrl);
    return withJx({
      success: 1,
      type: "jx",
      title: title || "视频",
      flag: -1,
      from: "解析接口",
      part: 1,
      url: purl,
      parts: [{ name: "播放", url: purl, raw: inputUrl }],
      sources: [{ flag: "解析", parts: [{ name: "播放", url: purl, raw: inputUrl }] }],
    }, pick);
  }
  return { success: 0, m: "解析失败，请检查资源站与解析接口配置" };
}

/** 聚合多资源站同一影片：按 [{flag,id}] 合并所有站的播放源为多线路（jxIdx 指定解析接口） */
export async function aggregateByIds(sitesRaw, cfg, jxIdx) {
  let pairs;
  try {
    pairs = JSON.parse(sitesRaw);
  } catch (e) {
    pairs = null;
  }
  if (!Array.isArray(pairs) || !pairs.length) return { success: 0, m: "sites 参数错误" };
  // 防御：sites 由前端拼接但可被伪造，限制数量避免单次请求打爆上游资源站
  if (pairs.length > 12) pairs = pairs.slice(0, 12);
  // 并发请求各资源站，避免串行等待拖慢聚合页
  const settled = await Promise.all(
    pairs.map(async (s) => {
      const flag = parseInt(s.flag, 10);
      if (isNaN(flag) || flag < 0 || flag >= cfg.resources.length) return null;
      const id = s.id == null ? "" : String(s.id).trim();
      if (!id) return null;
      return getVideoById(flag, id, cfg, jxIdx);
    })
  );
  const results = settled.filter((r) => r && r.success);
  if (!results.length) return { success: 0, m: "所有资源站均无法播放该影片" };
  // 合并所有站的线路，同源地址去重，每条线路标记来源站点
  const sources = [];
  const seen = new Set();
  for (const r of results) {
    for (const s of r.sources || []) {
      const raw = s.parts[0] ? s.parts[0].raw || s.parts[0].url : "";
      if (!raw || seen.has(raw)) continue;
      seen.add(raw);
      s.from = r.from;
      sources.push(s);
    }
  }
  if (!sources.length) return { success: 0, m: "聚合结果为空" };
  const first = sources[0];
  const out = {
    success: 1,
    type: results[0].type,
    title: results[0].title,
    from: results[0].from,
    part: 1,
    url: first.parts[0].url,
    parts: first.parts,
    sources,
  };
  // 透传解析线路信息（各结果使用的是同一个解析接口索引）
  if (results[0].type === "jx") {
    out.jxIndex = results[0].jxIndex;
    out.jxList = results[0].jxList;
  }
  return out;
}

// ---------- 响应 ----------

/** 统一 JSON 响应（带 CORS） */
export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
    },
  });
}
