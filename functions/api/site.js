// 路由：GET /api/site
// 公开接口：返回站点名称、简介、模板风格与页脚信息（供首页渲染，配置可在后台修改）
import { getConfig, jsonResponse } from "../_lib.js";

export async function onRequest(context) {
  const cfg = await getConfig(context.env);
  return jsonResponse({
    success: 1,
    title: cfg.title || "YunPlayer",
    intro: cfg.intro || "",
    theme: cfg.theme === "light" ? "light" : "dark",
    hot: cfg.hot || [],
    footer: cfg.footer || {},
  });
}
