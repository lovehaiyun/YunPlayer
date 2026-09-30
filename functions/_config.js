// ============================================================
// YunPlayer 站点配置（Cloudflare Pages Functions）
//
// 说明：
//   - 修改本文件后，推送到 Git（或重新部署）即可生效，无需其他操作
//   - 资源站指"苹果CMS类"数据接口，提供 JSON / XML 两种格式，均支持
//   - 解析接口是第三方网页解析（iframe 方式），仅在资源站找不到时兜底
//
// 资源站搜索格式（type）：
//   type = 0  →  接口地址?wd=关键词
//   type = 1  →  接口地址/wd/关键词
// 取播放数据统一使用： 接口地址?ac=videolist&ids=视频ID
// ============================================================

export const CONFIG = {
  // 站点名称（展示用）
  title: "YunPlayer",

  // 本站简介（展示在首页搜索框下方，可在后台「站点设置」中修改，留空则不显示）
  intro: "本站聚合全网公开影视接口，提供搜索与在线播放的技术演示，不存储、不制作任何影视资源。",

  // 模板风格：dark = 深色科技风（默认），light = 浅色简约风
  theme: "dark",

  // 页脚信息（均可在后台修改）
  //   link      开源地址，页脚显示为「开源地址」，点击在新标签页打开；留空则隐藏
  //   copyright 支持 {year} {title} 两个占位符，会自动替换为当前年份与站点名
  footer: {
    link: "https://github.com/lovehaiyun/YunPlayer",
    note: "本站为技术演示站点，不存储、不制作、不提供任何影视资源，全部内容均来自第三方公开接口，版权归原权利人所有；如相关内容侵犯了您的合法权益，请通过页脚的开源地址与我们联系，核实后将及时处理。",
    copyright: "© {year} {title} 版权所有",
    icp: "京ICP备00000000号",
    extra: "本站仅供技术学习与研究使用",
  },

  // 后台管理密码（访问 /admin.html 使用）
  // 仅个人使用建议也套一层 Cloudflare Access 或换复杂密码
  admin: {
    user: "admin",
    password: "admin888",
  },

  // 第三方解析接口（兜底用，off=1 启用）
  // 示例接口仅供参考，可能失效，请换成自己可用的接口地址
  parse: [
    { name: "默认解析", url: "https://www.360jiexi.com/player/?url=", off: 1 },
  ],

  // 资源站列表（off=1 启用）
  // 下列为实测可用的公共资源站，如失效可停用或替换为你自己的地址
  resources: [
    { name: "电影天堂", url: "http://caiji.dyttzyapi.com/api.php/provide/vod", type: 0, off: 1 },
    { name: "非凡影视", url: "http://ffzy5.tv/api.php/provide/vod", type: 0, off: 1 },
    { name: "量子影视", url: "https://cj.lziapi.com/api.php/provide/vod", type: 0, off: 1 },
    { name: "360资源", url: "https://360zyzz.com/api.php/provide/vod", type: 0, off: 1 },
    // 自定义资源站示例（苹果CMS JSON 接口）：
    // { name: "我的资源", url: "https://你的域名.com/api.php/provide/vod/", type: 0, off: 1 },
  ],
};
