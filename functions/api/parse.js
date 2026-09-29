// 路由：GET /api/parse
// 支持四种模式：
//   ?id=视频ID&flag=资源站序号       —— 播放搜索结果（推荐，最稳定）
//   ?sites=[{flag,id},...]          —— 聚合多资源站播放源（聚合搜索入口）
//   ?url=视频页面链接                —— 按链接解析（直链/标题搜索/第三方解析兜底）
//   ?wd=片名                        —— 按片名搜索后自动播放第一条
import { getVideoById, getVideoByUrl, aggregateByIds, search, getConfig, jsonResponse } from "../_lib.js";

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const p = url.searchParams;
  const id = p.get("id");
  const flag = p.get("flag");
  const sites = p.get("sites");
  const u = (p.get("url") || "").trim();
  const wd = (p.get("wd") || "").trim();

  const cfg = await getConfig(context.env);
  let info;
  if (sites) {
    info = await aggregateByIds(sites, cfg);
  } else if (id) {
    info = await getVideoById(flag === null ? 0 : parseInt(flag, 10) || 0, id, cfg);
  } else if (u) {
    info = await getVideoByUrl(u, cfg);
  } else if (wd) {
    const list = await search(wd, cfg);
    if (list.length) info = await getVideoById(list[0].flag, list[0].id, cfg);
    else info = { success: 0, m: "未找到相关资源" };
  } else {
    info = { success: 0, m: "缺少参数" };
  }
  return jsonResponse(info);
}
