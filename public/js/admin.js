// ============================================================
// YunPlayer 后台管理逻辑
// ============================================================

const AUTH_KEY = "yunplayer_admin_auth";
let currentAdminUser = "admin"; // 当前登录用户名（用于判断是否被修改）
let currentTheme = "dark";      // 当前选中的模板风格

function getAuth() {
  try { return JSON.parse(sessionStorage.getItem(AUTH_KEY) || "null") || {}; } catch (e) { return {}; }
}

function setAuth(user, pass) {
  sessionStorage.setItem(AUTH_KEY, JSON.stringify({ user, pass }));
}

function authHeaders() {
  const a = getAuth();
  return a.user ? { "x-admin-user": a.user, "x-admin-pass": a.pass } : {};
}

function toast(msg, ok) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = "toast show" + (ok ? " ok" : " err");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => (t.className = "toast"), 2600);
}

// ---------- 登录 ----------
document.getElementById("loginBtn").addEventListener("click", async () => {
  const user = document.getElementById("loginUser").value.trim();
  const pass = document.getElementById("loginPass").value.trim();
  if (!user || !pass) return toast("请输入用户名和密码");
  setAuth(user, pass);
  await loadConfig();
});

// ---------- 配置加载与渲染 ----------
async function loadConfig() {
  let data;
  try {
    data = await fetch("/api/admin/config", { headers: authHeaders() }).then((r) => r.json());
  } catch (e) {
    data = { success: 0, m: "网络错误：" + e.message };
  }
  if (!data.success) {
    // 仅登录态失效时清除凭据；网络错误保留，便于重试
    if (String(data.m || "").indexOf("网络错误") !== 0) sessionStorage.removeItem(AUTH_KEY);
    document.getElementById("loginBox").style.display = "block";
    document.getElementById("panelBox").style.display = "none";
    toast(data.m || "登录失败");
    return;
  }
  document.getElementById("loginBox").style.display = "none";
  document.getElementById("panelBox").style.display = "block";
  const c = data.config;
  document.getElementById("cfgTitle").value = c.title || "";
  document.getElementById("cfgHot").value = (c.hot || []).join(",");
  document.getElementById("cfgIntro").value = c.intro || "";
  currentAdminUser = c.adminUser || "admin";
  document.getElementById("cfgAdminUser").value = currentAdminUser;
  document.getElementById("cfgAdminPass").value = "";
  document.getElementById("cfgAdminPass2").value = "";
  // 模板风格：回填选中态，并让后台跟随该风格
  currentTheme = c.theme === "light" ? "light" : "dark";
  applyTheme(currentTheme);
  pickTheme(currentTheme);
  // 站点页脚
  const f = c.footer || {};
  document.getElementById("cfgFootContact").value = f.contactText || "";
  document.getElementById("cfgFootEmail").value = f.email || "";
  document.getElementById("cfgFootNote").value = f.note || "";
  document.getElementById("cfgFootCopyright").value = f.copyright || "";
  document.getElementById("cfgFootIcp").value = f.icp || "";
  document.getElementById("cfgFootExtra").value = f.extra || "";
  renderParse(c.parse || []);
  renderRes(c.resources || []);
}

/** 更新模板选择卡片的选中态 */
function pickTheme(theme) {
  const box = document.getElementById("themePick");
  if (!box) return;
  box.querySelectorAll(".theme-card").forEach((el) => {
    el.classList.toggle("active", el.dataset.themeVal === theme);
  });
}

// 解析接口行
function renderParse(list) {
  const box = document.getElementById("parseRows");
  box.innerHTML = list
    .map(
      (p, i) => `
      <div class="cfg-row" data-i="${i}">
        <input class="row-name" placeholder="接口名称" value="${esc(p.name)}" />
        <input class="row-url" placeholder="https://解析地址/?url=" value="${esc(p.url)}" />
        <span class="switch ${p.off ? "on" : ""}"><i></i></span>
        <button class="row-del" title="删除">✕</button>
      </div>`
    )
    .join("");
}
document.getElementById("addParseBtn").addEventListener("click", () => {
  const box = document.getElementById("parseRows");
  box.insertAdjacentHTML(
    "beforeend",
    `<div class="cfg-row" data-i="-1"><input class="row-name" placeholder="接口名称" /><input class="row-url" placeholder="https://解析地址/?url=" /><span class="switch on"><i></i></span><button class="row-del" title="删除">✕</button></div>`
  );
});

// 资源站行
function renderRes(list) {
  const box = document.getElementById("resRows");
  box.innerHTML = list
    .map(
      (r, i) => `
      <div class="cfg-row" data-i="${i}">
        <input class="row-name" placeholder="资源站名称" value="${esc(r.name)}" />
        <input class="row-url" placeholder="https://接口地址/" value="${esc(r.url)}" />
        <select class="row-type">
          <option value="0" ${r.type === 1 ? "" : "selected"}>?wd=</option>
          <option value="1" ${r.type === 1 ? "selected" : ""}>/wd/</option>
        </select>
        <span class="switch ${r.off ? "on" : ""}"><i></i></span>
        <button class="row-del" title="删除">✕</button>
      </div>`
    )
    .join("");
}
document.getElementById("addResBtn").addEventListener("click", () => {
  const box = document.getElementById("resRows");
  box.insertAdjacentHTML(
    "beforeend",
    `<div class="cfg-row" data-i="-1"><input class="row-name" placeholder="资源站名称" /><input class="row-url" placeholder="https://接口地址/" /><select class="row-type"><option value="0">?wd=</option><option value="1">/wd/</option></select><span class="switch on"><i></i></span><button class="row-del" title="删除">✕</button></div>`
  );
});

// 模板风格选择（点击即时预览）
document.getElementById("themePick").addEventListener("click", (e) => {
  const card = e.target.closest(".theme-card");
  if (!card) return;
  currentTheme = card.dataset.themeVal === "light" ? "light" : "dark";
  pickTheme(currentTheme);
  applyTheme(currentTheme);
});

// 行内操作（切换开关 / 删除）
document.addEventListener("click", (e) => {
  const sw = e.target.closest(".switch");
  if (sw) {
    sw.classList.toggle("on");
    return;
  }
  const del = e.target.closest(".row-del");
  if (del) {
    del.closest(".cfg-row").remove();
  }
});

// ---------- 保存 / 恢复 ----------
document.getElementById("saveBtn").addEventListener("click", async () => {
  const parse = [...document.querySelectorAll("#parseRows .cfg-row")].map((r) => ({
    name: r.querySelector(".row-name").value.trim() || "解析接口",
    url: r.querySelector(".row-url").value.trim(),
    off: r.querySelector(".switch").classList.contains("on") ? 1 : 0,
  }));
  const resources = [...document.querySelectorAll("#resRows .cfg-row")].map((r) => ({
    name: r.querySelector(".row-name").value.trim() || "资源站",
    url: r.querySelector(".row-url").value.trim(),
    type: parseInt(r.querySelector(".row-type").value, 10),
    off: r.querySelector(".switch").classList.contains("on") ? 1 : 0,
  }));
  if (!parse.length && !resources.length) return toast("请至少保留一个接口或资源站");

  // 后台账号：用户名可改，密码留空表示不修改
  const adminUser = document.getElementById("cfgAdminUser").value.trim();
  const pass1 = document.getElementById("cfgAdminPass").value;
  const pass2 = document.getElementById("cfgAdminPass2").value;
  if (pass1 || pass2) {
    if (pass1 !== pass2) return toast("两次输入的密码不一致");
    if (pass1.length < 4) return toast("密码至少 4 位");
  }
  const adminChanged = !!pass1 || (!!adminUser && adminUser !== currentAdminUser);

  const body = {
    config: {
      title: document.getElementById("cfgTitle").value.trim(),
      intro: document.getElementById("cfgIntro").value.trim(),
      theme: currentTheme,
      hot: document.getElementById("cfgHot").value.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
      footer: {
        contactText: document.getElementById("cfgFootContact").value.trim(),
        email: document.getElementById("cfgFootEmail").value.trim(),
        note: document.getElementById("cfgFootNote").value.trim(),
        copyright: document.getElementById("cfgFootCopyright").value.trim(),
        icp: document.getElementById("cfgFootIcp").value.trim(),
        extra: document.getElementById("cfgFootExtra").value.trim(),
      },
      parse,
      resources,
    },
  };
  if (adminChanged) body.admin = { user: adminUser || currentAdminUser, pass: pass1 };

  try {
    const r = await fetch("/api/admin/config", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    }).then((x) => x.json());
    if (r.success && adminChanged) {
      // 同步本地凭据，避免下次请求仍用旧密码
      const nextUser = body.admin.user;
      const nextPass = pass1 || getAuth().pass || "";
      setAuth(nextUser, nextPass);
      currentAdminUser = nextUser;
      document.getElementById("cfgAdminPass").value = "";
      document.getElementById("cfgAdminPass2").value = "";
    }
    toast(r.m || (r.success ? "已保存" : "保存失败"), r.success);
  } catch (e) {
    toast("保存失败：" + e.message);
  }
});

document.getElementById("resetBtn").addEventListener("click", async () => {
  if (!confirm("确定恢复为 functions/_config.js 内置默认配置吗？后台修改将被清除。")) return;
  try {
    const r = await fetch("/api/admin/config", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ reset: true }),
    }).then((x) => x.json());
    toast(r.m || "操作完成", r.success);
    if (r.success) await loadConfig();
  } catch (e) {
    toast("操作失败：" + e.message);
  }
});

// ---------- 退出登录 ----------
document.getElementById("logoutBtn").addEventListener("click", () => {
  sessionStorage.removeItem(AUTH_KEY);
  document.getElementById("panelBox").style.display = "none";
  document.getElementById("loginBox").style.display = "block";
  document.getElementById("loginPass").value = "";
  toast("已退出登录", true);
});

// 已登录则直接进入面板
(async () => {
  if (getAuth().user) await loadConfig();
})();
