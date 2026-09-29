// 路由：GET /api/search?wd=关键词
import { search, getConfig, jsonResponse } from "../_lib.js";

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const wd = (url.searchParams.get("wd") || "").trim();
  if (!wd) return jsonResponse({ success: 0, m: "请输入关键词" }, 400);
  const cfg = await getConfig(context.env);
  const list = await search(wd, cfg);
  return jsonResponse({ success: list.length ? 1 : 0, wd, list });
}
