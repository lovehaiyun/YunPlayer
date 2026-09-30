// ============================================================
// YunPlayer 公共工具
// ============================================================

/** 读取 URL 查询参数 */
function qs(name) {
  return new URLSearchParams(window.location.search).get(name) || "";
}

/** 调用 API */
async function api(path, params) {
  const query = new URLSearchParams(params || {});
  const res = await fetch(path + "?" + query.toString(), { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}

/** HTML 转义 */
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 应用模板风格（dark 深色科技 / light 浅色简约），并记住选择避免刷新闪烁 */
function applyTheme(theme) {
  const t = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = t;
  try {
    localStorage.setItem("yunplayer_theme", t);
  } catch (e) {
    /* 隐私模式下忽略 */
  }
}

/** 用站点配置填充模板风格与页脚各处（元素不存在则自动跳过） */
function applySiteMeta(data) {
  if (!data) return;
  const str = (v) => String(v == null ? "" : v).trim();
  const title = str(data.title);
  if (title) {
    document.querySelectorAll("[data-site-copy]").forEach((el) => {
      el.textContent = title;
    });
  }
  applyTheme(data.theme);

  const f = data.footer || {};
  const year = new Date().getFullYear();
  // 支持 {year} {title} 占位符
  const token = (s) =>
    String(s == null ? "" : s).replace(/\{year\}/g, year).replace(/\{title\}/g, title);

  const setText = (sel, val) => {
    document.querySelectorAll(sel).forEach((el) => {
      el.textContent = val;
    });
  };
  // 留空则隐藏该项（连带其分隔符）
  const setOptional = (sel, val) => {
    document.querySelectorAll(sel).forEach((el) => {
      el.textContent = val;
      el.style.display = val ? "" : "none";
    });
  };

  if (str(f.note)) setText("[data-foot-note]", token(f.note));
  if (str(f.copyright)) setText("[data-foot-copyright]", token(f.copyright));
  setOptional("[data-foot-icp]", str(f.icp));
  setOptional("[data-foot-extra]", str(f.extra));

  // 开源地址（新标签页打开；留空则隐藏）
  const link = str(f.link);
  document.querySelectorAll("[data-foot-link]").forEach((el) => {
    if (link) {
      el.href = link;
      el.style.display = "";
    } else {
      el.style.display = "none";
    }
  });
}
