// ============================================================
// YunPlayer 播放页逻辑
// ============================================================

const playerEl = document.getElementById("player");
let placeholderEl = document.getElementById("placeholder");
const titleEl = document.getElementById("playTitle");
const metaEl = document.getElementById("playMeta");
const sourceSectionEl = document.getElementById("sourceSection");
const sourceTabsEl = document.getElementById("sourceTabs");
const jxSectionEl = document.getElementById("jxSection");
const jxTabsEl = document.getElementById("jxTabs");
const epSectionEl = document.getElementById("epSection");
const episodesEl = document.getElementById("episodes");

let currentInfo = null;   // /api/parse 返回的数据
let hls = null;           // Hls.js 实例
let currentSources = [];  // 当前展示的线路（已过滤为 m3u8）
let currentSrcIdx = 0;    // 当前选中的线路索引
let currentPartIdx = 0;   // 当前选中的剧集索引
let currentJxIdx = 0;     // 当前选中的解析接口索引
let playParams = {};      // 播放页原始请求参数（切换解析线路时复用）

/** 展示加载占位（恢复默认文案，避免上一次的错误提示残留） */
function showLoading() {
  ensurePlaceholder();
  placeholderEl.style.display = "flex";
  placeholderEl.innerHTML = "<div class='spin'></div><span>正在解析播放地址…</span>";
}

/** 隐藏加载占位 */
function hideLoading() {
  if (placeholderEl) placeholderEl.style.display = "none";
}

/** 保证占位节点始终挂在播放器内（曾因 clearPlayer 清空 innerHTML 而丢失，导致提示/错误全部失效） */
function ensurePlaceholder() {
  if (placeholderEl && playerEl.contains(placeholderEl)) return;
  placeholderEl = document.createElement("div");
  placeholderEl.className = "placeholder";
  placeholderEl.id = "placeholder";
  placeholderEl.style.display = "none";
  playerEl.appendChild(placeholderEl);
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
      hls = new Hls({
        enableWorker: true,
        // 默认缓冲偏小，网络抖动时容易卡顿/断流，这里适当放宽并增加重试
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        maxBufferSize: 60 * 1000 * 1000,
        backBufferLength: 30,
        abrEwmaDefaultEstimate: 1000000,
        capLevelToPlayerSize: true,
        fragLoadingMaxRetry: 6,
        manifestLoadingMaxRetry: 4,
      });
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
  ensurePlaceholder();
  placeholderEl.style.display = "flex";
  placeholderEl.innerHTML =
    "<div class='empty' style='margin:0'>" + esc(msg) + "</div>";
}

/** 以 iframe 方式播放（第三方解析接口） */
function playIframe(url) {
  clearPlayer();
  hideLoading();
  const frame = document.createElement("iframe");
  frame.src = url;
  frame.allowFullscreen = true;
  frame.setAttribute("allow", "autoplay; fullscreen; encrypted-media");
  playerEl.appendChild(frame);
}

/** 渲染选集列表（切换线路时需重建；activeIdx 为当前选中集） */
function renderEpisodes(parts, activeIdx) {
  const act = Number.isInteger(activeIdx) ? activeIdx : 0;
  if (!parts || parts.length <= 1) {
    epSectionEl.style.display = "none";
    episodesEl.innerHTML = "";
    return;
  }
  epSectionEl.style.display = "block";
  episodesEl.innerHTML = parts
    .map((p, i) => `<span class="ep${i === act ? " active" : ""}" data-i="${i}">${esc(p.name)}</span>`)
    .join("");
}

/** 清空播放器（只移除播放元素，保留占位节点） */
function clearPlayer() {
  if (hls) {
    hls.destroy();
    hls = null;
  }
  playerEl.querySelectorAll("video, iframe").forEach((el) => el.remove());
}

/** 渲染播放（keepPos=true 时保留当前线路/选集，用于切换解析线路） */
function renderPlay(info, keepPos) {
  if (!info || !info.success) {
    titleEl.textContent = "播放失败";
    metaEl.innerHTML = "";
    ensurePlaceholder();
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
  // 初次加载从头播；切换解析线路时保留原来的线路与选集
  if (!keepPos) {
    currentSrcIdx = 0;
    currentPartIdx = 0;
  }
  currentSrcIdx = Math.max(0, Math.min(currentSrcIdx, currentSources.length - 1));
  const src = currentSources[currentSrcIdx] || { flag: "", parts: info.parts || [] };
  const parts = src.parts || [];
  currentPartIdx = Math.max(0, Math.min(currentPartIdx, Math.max(0, parts.length - 1)));

  renderEpisodes(parts.length > 1 ? parts : null, currentPartIdx);

  // 解析线路：解析接口启用且数量 > 1 时，可手动切换（复用资源站线路的标签样式）
  const jxList = Array.isArray(info.jxList) ? info.jxList : [];
  if (info.type === "jx" && jxList.length > 1) {
    const cur = typeof info.jxIndex === "number" ? info.jxIndex : currentJxIdx;
    jxSectionEl.style.display = "block";
    jxTabsEl.innerHTML = jxList
      .map((n, i) => `<span class="ep${i === cur ? " active" : ""}" data-jx="${i}">${esc(n)}</span>`)
      .join("");
  } else {
    jxSectionEl.style.display = "none";
    jxTabsEl.innerHTML = "";
  }

  // 多线路切换（标签显示为资源站名称）
  if (currentSources.length > 1) {
    sourceSectionEl.style.display = "block";
    sourceTabsEl.innerHTML = currentSources
      .map((s, i) => {
        const from = s.from || info.from;
        const label = from
          ? from + (currentSources.length > 1 ? " " + (i + 1) : "")
          : "线路" + (i + 1);
        return `<span class="ep${i === currentSrcIdx ? " active" : ""}" data-src="${i}">${esc(label)}</span>`;
      })
      .join("");
  } else {
    sourceSectionEl.style.display = "none";
  }

  // 播放方式：解析接口模式(jx)一律 iframe；直链模式按地址判断
  const playUrl = parts.length ? (parts[currentPartIdx] || parts[0]).url : info.url;
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
  const i = parseInt(ep.dataset.i, 10);
  currentPartIdx = isNaN(i) ? 0 : i;
  switchPlay(currentInfo, currentSrcIdx, currentPartIdx);
});

jxTabsEl.addEventListener("click", (e) => {
  const tab = e.target.closest(".ep");
  if (!tab || tab.classList.contains("active")) return;
  jxTabsEl.querySelectorAll(".ep").forEach((x) => x.classList.remove("active"));
  tab.classList.add("active");
  const idx = parseInt(tab.dataset.jx, 10);
  currentJxIdx = isNaN(idx) ? 0 : idx;
  // 同步到地址栏，便于分享/刷新后保持所选解析线路
  const u = new URL(window.location.href);
  u.searchParams.set("jx", String(currentJxIdx));
  history.replaceState(null, "", u);
  // 切换解析线路：保留当前资源站线路与选集，只重载播放器
  loadPlay(currentJxIdx, true);
});

sourceTabsEl.addEventListener("click", (e) => {
  const tab = e.target.closest(".ep");
  if (!tab) return;
  sourceTabsEl.querySelectorAll(".ep").forEach((x) => x.classList.remove("active"));
  tab.classList.add("active");
  const idx = parseInt(tab.dataset.src, 10);
  currentSrcIdx = isNaN(idx) ? 0 : idx;
  currentPartIdx = 0;
  // 切换线路后选集可能完全不同，需重建选集列表
  const src = currentSources[currentSrcIdx];
  const parts = (src && src.parts) || [];
  renderEpisodes(parts.length > 1 ? parts : null, 0);
  switchPlay(currentInfo, currentSrcIdx, 0);
});

// ---------- 加载与渲染 ----------
/** 请求播放数据并渲染（jxIdx 指定解析接口索引；keepPos 为 true 时保留当前线路与选集） */
async function loadPlay(jxIdx, keepPos) {
  const params = Object.assign({}, playParams);
  if (jxIdx != null) params.jx = String(jxIdx);
  // 请求期间给出加载反馈，避免切换解析线路时长时间黑屏看起来像"卡住/没反应"
  showLoading();
  let info;
  try {
    info = await api("/api/parse", params);
  } catch (e) {
    info = { success: 0, m: "请求失败：" + e.message };
  }
  currentInfo = info;
  if (info && info.success && typeof info.jxIndex === "number") currentJxIdx = info.jxIndex;
  renderPlay(info, keepPos === true);
}

// ---------- 初始化 ----------
(async () => {
  const id = qs("id");
  const flag = qs("flag");
  const url = qs("url");
  const wd = qs("wd");
  const sites = qs("sites");

  if (sites) {
    // 聚合播放：一次合并多个资源站的播放源
    playParams = { sites };
  } else if (id) {
    playParams = { id, flag: flag || "0" };
  } else if (url) {
    playParams = { url };
  } else if (wd) {
    playParams = { wd };
  }

  if (!Object.keys(playParams).length) {
    currentInfo = { success: 0, m: "缺少播放参数，请从首页搜索进入" };
    renderPlay(currentInfo);
    return;
  }
  const jx0 = parseInt(qs("jx"), 10);
  await loadPlay(isNaN(jx0) ? 0 : jx0);
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
