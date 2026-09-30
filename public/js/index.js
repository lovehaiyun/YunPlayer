// ============================================================
// YunPlayer 首页 / 搜索逻辑
// ============================================================

const resultsEl = document.getElementById("results");
const emptyEl = document.getElementById("empty");

/** 渲染加载骨架 */
function renderSkeleton(n) {
  resultsEl.innerHTML = Array.from({ length: n }, () => '<div class="skeleton"></div>').join("");
}

/** 按标题生成占位图色相 */
function hashHue(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

/** 渲染搜索结果卡片 */
function renderCards(list) {
  if (!list.length) {
    resultsEl.innerHTML = "";
    emptyEl.style.display = "block";
    emptyEl.innerHTML =
      "未找到相关资源。<br />请到 <b>后台管理 → 资源站</b> 检查配置是否可用，或换个关键词重试。";
    return;
  }
  emptyEl.style.display = "none";
  // 聚合搜索结果：多个资源站有同一部片时，卡片携带全部站点进入聚合播放页
  const cardHref = (v) => {
    let h = "/play?id=" + encodeURIComponent(v.id) + "&flag=" + encodeURIComponent(v.flag);
    if (v.sites && v.sites.length > 1) {
      h += "&sites=" + encodeURIComponent(JSON.stringify(v.sites.map((s) => ({ flag: s.flag, id: s.id }))));
    }
    return h;
  };
  resultsEl.innerHTML = list
    .map(
      (v) => `
      <a class="card" href="${cardHref(v)}">
        <div class="card-poster" style="--c:${hashHue(v.title)}deg">
          <div class="card-ph">${esc((v.title || "影").slice(0, 1))}</div>
          ${v.pic ? `<img src="${esc(v.pic)}" loading="lazy" onerror="this.remove()" />` : ""}
          ${v.type ? `<span class="card-type">${esc(v.type)}</span>` : ""}
        </div>
        <div class="card-info"><div class="card-title">${esc(v.title)}</div></div>
      </a>`
    )
    .join("");
}

/** 执行搜索 */
async function doSearch(keyword) {
  keyword = keyword.trim();
  if (!keyword) return;
  emptyEl.style.display = "none";
  renderSkeleton(12);
  try {
    const data = await api("/api/search", { wd: keyword });
    renderCards(data.list || []);
  } catch (e) {
    resultsEl.innerHTML = "";
    emptyEl.style.display = "block";
    emptyEl.innerHTML = "搜索失败，请稍后重试（" + esc(e.message) + "）。";
  }
}

document.getElementById("searchForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const keyword = document.getElementById("searchInput").value.trim();
  if (!keyword) return;
  // 粘贴了视频链接（直链或网页链接）→ 进播放页，由后端自动匹配资源站
  if (/^https?:\/\//i.test(keyword)) {
    window.location.href = "/play?url=" + encodeURIComponent(keyword);
    return;
  }
  doSearch(keyword);
});

// 热门词点击
document.getElementById("hot").addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  document.getElementById("searchInput").value = chip.dataset.wd;
  doSearch(chip.dataset.wd);
});

// 加载站点名称与热门词（可在后台修改）
(async () => {
  try {
    const data = await api("/api/site");
    if (data.success) {
      applySiteMeta(data);
      if (data.title) {
        document.getElementById("logoName").textContent = data.title;
        document.getElementById("heroTitle").textContent = data.title;
        document.title = data.title + " · 智能解析播放";
      }
      // 热门词标签（不显示「热门：」前缀）
      const hot = data.hot || [];
      const box = document.getElementById("hot");
      box.innerHTML = hot.map((w) => `<span class="chip" data-wd="${esc(w)}">${esc(w)}</span>`).join("");
      box.style.display = hot.length ? "" : "none";

      // 本站简介（后台可自定义，留空则不显示）
      const intro = String(data.intro || "").trim();
      const introEl = document.getElementById("siteIntro");
      if (intro) {
        introEl.textContent = intro;
        introEl.style.display = "block";
      } else {
        introEl.style.display = "none";
      }
    }
  } catch (e) {
    /* 接口失败不影响首页使用 */
  }
})();

// 自动搜索 URL 中携带的关键词（支持 ?wd= 直达搜索）
const autoWd = qs("wd");
if (autoWd) {
  document.getElementById("searchInput").value = autoWd;
  doSearch(autoWd);
}

// 主页日期时钟（每秒刷新）
(function startClock() {
  const timeEl = document.getElementById("clockTime");
  const dateEl = document.getElementById("clockDate");
  if (!timeEl || !dateEl) return;
  const WEEK = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
  const pad = (n, len) => String(n).padStart(len || 2, "0");
  function tick() {
    const d = new Date();
    timeEl.textContent = pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
    dateEl.textContent =
      pad(d.getFullYear(), 4) + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + WEEK[d.getDay()];
  }
  tick();
  setInterval(tick, 1000);
})();
