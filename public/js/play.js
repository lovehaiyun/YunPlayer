// ============================================================
// YunPlayer 播放页逻辑
// ============================================================

const playerEl = document.getElementById("player");
const placeholderEl = document.getElementById("placeholder");
const titleEl = document.getElementById("playTitle");
const metaEl = document.getElementById("playMeta");
const sourceSectionEl = document.getElementById("sourceSection");
const sourceTabsEl = document.getElementById("sourceTabs");
const epSectionEl = document.getElementById("epSection");
const episodesEl = document.getElementById("episodes");

let currentInfo = null;   // /api/parse 返回的数据
let hls = null;           // Hls.js 实例
let isIframe = false;     // 当前是否为 iframe 解析模式
let currentSources = [];  // 当前展示的线路（已过滤为 m3u8）
let currentSrcIdx = 0;    // 当前选中的线路索引

/** 展示加载占位 */
function showLoading() {
  if (!placeholderEl) return;
  playerEl.classList.add("loading");
  placeholderEl.style.display = "flex";
}

/** 隐藏加载占位 */
function hideLoading() {
  playerEl.classList.remove("loading");
  if (placeholderEl) placeholderEl.style.display = "none";
}

/** m3u8 地址统一走本站代理，解决跨域/防盗链 */
function proxyUrl(u) {
  return "/m3u8?url=" + encodeURIComponent(u);
}

/** 判断是否为 m3u8 直链 */
function isM3u8Url(u) {
  return /\.m3u8([?#]|$)/i.test(u);
}

/** 初始化视频播放（m3u8 用 Hls.js，其余用原生播放） */
function playVideo(url, autoplay) {
  clearPlayer();
  hideLoading();

  const video = document.createElement("video");
  video.controls = true;
  video.autoplay = autoplay !== false;
  video.playsInline = true;
  video.style.width = "100%";
  video.style.height = "100%";

  let attached = true;
  if (/\.m3u8([?#]|$)/i.test(url)) {
    if (window.Hls && Hls.isSupported()) {
      // Hls.js 接管播放：不要先把 m3u8 赋给 video.src，
      // Chrome 桌面版原生不支持 HLS，直接赋值会触发浏览器的"下载"行为
      hls = new Hls({ enableWorker: true });
      hls.loadSource(proxyUrl(url));
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, (e, data) => {
        if (data && data.fatal) {
          hls.destroy();
          hls = null;
          video.remove();
          showError("视频流加载失败（m3u8 可能已失效或被防盗链限制），请切换其他线路或资源站");
        }
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = proxyUrl(url); // iOS Safari 原生 HLS
    } else {
      attached = false;
      showError("当前浏览器不支持 HLS(m3u8) 播放，请使用新版 Chrome / Edge / Safari");
    }
  } else {
    video.src = url;
  }

  if (!attached) return;
  playerEl.appendChild(video);
  video.addEventListener("play", () => placeholderEl && (placeholderEl.style.display = "none"));
}

/** 显示播放错误 */
function showError(msg) {
  hideLoading();
  placeholderEl.style.display = "flex";
  placeholderEl.innerHTML =
    "<div class='empty' style='margin:0'>" + esc(msg) + "</div>";
}

/** 以 iframe 方式播放（第三方解析接口） */
function playIframe(url) {
  clearPlayer();
  hideLoading();
  isIframe = true;
  const frame = document.createElement("iframe");
  frame.src = url;
  frame.allowFullscreen = true;
  frame.setAttribute("allow", "autoplay; fullscreen; encrypted-media");
  playerEl.appendChild(frame);
}

/** 渲染选集列表（切换线路时需重建） */
function renderEpisodes(parts) {
  if (!parts || parts.length <= 1) {
    epSectionEl.style.display = "none";
    episodesEl.innerHTML = "";
    return;
  }
  epSectionEl.style.display = "block";
  episodesEl.innerHTML = parts
    .map((p, i) => `<span class="ep${i === 0 ? " active" : ""}" data-i="${i}">${esc(p.name)}</span>`)
    .join("");
}

/** 清空播放器 */
function clearPlayer() {
  if (hls) {
    hls.destroy();
    hls = null;
  }
  isIframe = false;
  playerEl.innerHTML = "";
}

/** 渲染播放 */
function renderPlay(info) {
  if (!info || !info.success) {
    titleEl.textContent = "播放失败";
    metaEl.innerHTML = "";
    hideLoading();
    placeholderEl.style.display = "flex";
    placeholderEl.innerHTML =
      "<div class='empty' style='margin:0'>" + esc(info && info.m ? info.m : "未知错误") +
      "<br /><a href='/' style='color:#a855f7'>返回首页重新搜索</a></div>";
    return;
  }

  document.title = info.title + " - YunPlayer";
  titleEl.textContent = info.title;
  // 来源站点：聚合播放时列出全部站点
  const fromSites = [...new Set((info.sources || []).map((s) => s.from).filter(Boolean))];
  const fromName = fromSites.length ? fromSites.join(" · ") : (info.from || "资源");
  metaEl.innerHTML =
    '<span class="from-badge">' + esc(fromName) + "</span>" +
    (info.flag >= 0 ? "<span>ID: " + esc(info.flag) + "</span>" : "");

  // 两种模式都只展示 m3u8 来源的线路（jx 模式用原始地址判断，不受解析前缀影响）
  // 没有 m3u8 线路时回退展示全部
  const all = info.sources || [];
  currentSources = all.filter(
    (s) => s.parts && s.parts.length && isM3u8Url(s.parts[0].raw || s.parts[0].url)
  );
  if (!currentSources.length) currentSources = all;
  const src = currentSources[0] || { flag: "", parts: info.parts || [] };
  const parts = src.parts || [];

  renderEpisodes(parts.length > 1 ? parts : null);

  // 多线路切换（标签显示为资源站名称）
  if (currentSources.length > 1) {
    sourceSectionEl.style.display = "block";
    sourceTabsEl.innerHTML = currentSources
      .map((s, i) => {
        const from = s.from || info.from;
        const label = from
          ? from + (currentSources.length > 1 ? " " + (i + 1) : "")
          : "线路" + (i + 1);
        return `<span class="ep${i === 0 ? " active" : ""}" data-src="${i}">${esc(label)}</span>`;
      })
      .join("");
  } else {
    sourceSectionEl.style.display = "none";
  }

  // 播放方式：解析接口模式(jx)一律 iframe；直链模式按地址判断
  const playUrl = parts.length ? parts[0].url : info.url;
  if (info.type === "jx") {
    playIframe(playUrl);
  } else if (/\.(mp4|m3u8|webm|ogg|m4v)([?#]|$)/i.test(playUrl)) {
    playVideo(playUrl, true);
  } else {
    playIframe(playUrl);
  }
}

/** 切换剧集 / 线路 */
function switchPlay(info, srcIdx, partIdx) {
  const src = currentSources[srcIdx];
  const part = src && src.parts[partIdx];
  if (!part) return;
  document.title = info.title + " · " + part.name + " - YunPlayer";
  if (info.type === "jx") {
    playIframe(part.url);
  } else if (/\.(mp4|m3u8|webm|ogg|m4v)([?#]|$)/i.test(part.url)) {
    playVideo(part.url, true);
  } else {
    playIframe(part.url);
  }
}

// ---------- 事件绑定 ----------
episodesEl.addEventListener("click", (e) => {
  const ep = e.target.closest(".ep");
  if (!ep) return;
  episodesEl.querySelectorAll(".ep").forEach((x) => x.classList.remove("active"));
  ep.classList.add("active");
  switchPlay(currentInfo, currentSrcIdx, parseInt(ep.dataset.i, 10));
});

sourceTabsEl.addEventListener("click", (e) => {
  const tab = e.target.closest(".ep");
  if (!tab) return;
  sourceTabsEl.querySelectorAll(".ep").forEach((x) => x.classList.remove("active"));
  tab.classList.add("active");
  const idx = parseInt(tab.dataset.src, 10);
  currentSrcIdx = isNaN(idx) ? 0 : idx;
  // 切换线路后选集可能完全不同，需重建选集列表
  const src = currentSources[currentSrcIdx];
  const parts = (src && src.parts) || [];
  renderEpisodes(parts.length > 1 ? parts : null);
  switchPlay(currentInfo, currentSrcIdx, 0);
});

// ---------- 初始化 ----------
(async () => {
  const id = qs("id");
  const flag = qs("flag");
  const url = qs("url");
  const wd = qs("wd");
  const sites = qs("sites");

  let info;
  try {
    if (sites) {
      // 聚合播放：一次合并多个资源站的播放源
      info = await api("/api/parse", { sites });
    } else if (id) {
      info = await api("/api/parse", { id, flag: flag || "0" });
    } else if (url) {
      info = await api("/api/parse", { url });
    } else if (wd) {
      info = await api("/api/parse", { wd });
    } else {
      info = { success: 0, m: "缺少播放参数，请从首页搜索进入" };
    }
  } catch (e) {
    info = { success: 0, m: "请求失败：" + e.message };
  }
  currentInfo = info;
  renderPlay(info);
})();

// ---------- 页脚站点信息（与首页保持一致的站点名） ----------
(async () => {
  try {
    const data = await api("/api/site");
    if (data && data.success) applySiteMeta(data);
  } catch (e) {
    /* 接口失败不影响播放 */
  }
})();
