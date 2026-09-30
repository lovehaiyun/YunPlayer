<div align="center">

# YunPlayer

**聚合全网影视资源 · 智能解析 · 高清在线播放**

基于 Cloudflare Pages 的纯 JS 视频解析播放站，由 XyPlayer 的理念重写而来（PHP → Pages Functions）

[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Deploy](https://img.shields.io/badge/Deploy-Cloudflare%20Pages-F38020?logo=cloudflare&logoColor=white)](https://pages.cloudflare.com/)
[![Player](https://img.shields.io/badge/Player-Hls.js-4B8BBE)](https://github.com/video-dev/hls.js)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](#)

</div>

---

## 简介

YunPlayer 把影视解析流程精简为三件事：

**首页搜索 → 聚合资源站结果 → 一键解析播放**

同时支持粘贴视频直链 / 网页链接直接播放。前端零框架（原生 HTML / CSS / JS），后端跑在 Cloudflare Pages Functions（Workers 运行时），**无需服务器、无需数据库**，部署在 Cloudflare 免费额度内即可运行。

## 功能特性

### 搜索与播放

- **多资源站并发搜索**：同时检索多个苹果CMS类接口（JSON / XML 均支持），相同影视自动聚合为一条结果
- **聚合播放源**：点开结果后合并所有资源站的线路，支持切换线路与选集
- **三种播放方式**
  - 视频直链（mp4 / m3u8 / webm 等）HTML5 播放，m3u8 自动走 `/m3u8` 代理解决跨域与防盗链
  - 按片名搜索资源站，取回多线路播放列表
  - 网页链接兜底走第三方解析接口（iframe）
- **粘贴链接直接播放**：输入平台链接后自动抓取标题，再回资源站搜索，找不到才走解析接口
- **自动补图**：搜索结果缺封面时自动调用详情接口补齐，失败时显示渐变占位图

### 站点与后台

- **网页后台** `/admin.html`：在线增删 / 停用资源站与解析接口，修改站点名、简介、热门词
- **2 套模板一键切换**：深色科技风（默认）/ 浅色简约风，基于 CSS 变量实现，刷新不闪烁
- **页脚全可配置**：联系我们、免责声明、版权、备案号、底部说明，支持 `{year}` / `{title}` 占位符，留空自动隐藏
- **安全的后台账号**：用户名 / 密码可自定义，密码以加盐 SHA-256 存入 KV，不回传明文
- **响应式**：手机 / PC 自适应

### 工程细节

- 搜索 / 详情接口带缓存（Cache API，1–5 分钟），聚合请求并发抓取
- `/m3u8` 代理做协议校验与内网地址拦截
- 配置存 Cloudflare KV，不绑 KV 也能运行（自动回退 `_config.js`）

## 技术栈

| 层 | 使用 |
|---|---|
| 部署 | Cloudflare Pages（免费额度） |
| 后端 | Pages Functions（Workers 运行时，无框架） |
| 前端 | 原生 HTML / CSS / JS，零构建、零运行时依赖 |
| 播放 | [Hls.js](https://github.com/video-dev/hls.js) 播放 m3u8 |
| 存储 | Cloudflare KV（后台配置） |
| 加密 | Web Crypto API（SHA-256 加盐哈希） |
| 主题 | CSS 变量 + `data-theme` |

## 快速开始（本地运行）

需要 Node.js 18+。

```bash
# 安装 wrangler
npm i -g wrangler

# 在项目根目录启动本地开发服务器（KV 会自动本地模拟，无需真建）
wrangler pages dev public
```

打开 <http://127.0.0.1:8788> 即可。后台地址 `/admin.html`，默认账号 `admin` / `admin888`。

> 本地 KV 数据存放在 `.wrangler/state`，与线上 KV 相互独立。

## 部署到 Cloudflare Pages

> **重要**：Cloudflare 控制台里的 **Upload assets（拖拽上传）不支持 Functions**，传上去只有一个静态页面，后端接口会全部 404。请使用下面两种方式之一，后端解析才会生效。

**前置准备**：一个 Cloudflare 账号（免费注册）。「方式一」还需要一个 GitHub 账号，但全程在浏览器里操作，不用安装任何工具；「方式二」不需要 GitHub，只需本机安装 Node.js 18+。

### 方式一：网页部署（推荐，全程浏览器操作）

1. **建仓库并上传代码**
   - 打开 github.com → **New repository** 建新仓库 → 进入仓库 → **Add file → Upload files**
   - 把本项目里的全部内容（`public/`、`functions/`、`wrangler.toml` 等）一起拖进去 → **Commit changes**
   - 仓库根目录就应该是本项目的内容，`functions/` 是后端**必须一起上传**；只传 `public/` 会导致后端接口全部 404
   - ⚠️ **不要上传 `.wrangler/` 目录**（本地开发缓存，网页拖拽上传不会自动忽略），上传前在文件列表里排除它即可
2. **连接 Cloudflare**：Dashboard → **Workers & Pages** → **Create → Pages → Connect to Git**，选中刚建的仓库
   - 不要选 **Upload assets（直接上传）**，那种方式不支持 Functions
3. **填构建设置**：**Build command 留空**，**Build output directory 填 `public`** → 点 **Save and Deploy**，等待构建完成
4. **创建 KV 并绑定**（后台配置存储）：
   - **Workers & Pages → KV → Create namespace**（名称随意，如 `yunplayer-config`）
   - 回到 Pages 项目 → **Settings → Bindings**（部分旧版界面为 **Settings → Functions → KV namespace bindings**）→ **Add → KV namespace**
   - **Variable name 必须填 `CONFIG_KV`**，Namespace 选择刚创建的那个
   - **Production 与 Preview 环境都建议绑定**，否则预览部署没有后台存储
5. **让绑定生效**：项目 → **Deployments** → 最新一条 → **Retry deployment**（重新部署一次）
6. 访问 `https://<你的项目名>.pages.dev`

以后在网页上提交 / 上传新文件，Cloudflare 会自动重新构建部署；后台保存的配置存于 KV，无需重新部署即可生效。

### 方式二：Wrangler 命令行直接上传（不需要 GitHub）

> 与控制台的「Upload assets 拖拽上传」不同，用 Wrangler 上传会**连同 `functions/` 后端一起部署**，因此这条路**完全不需要 GitHub**。
> 以下命令都要在**项目根目录**（含 `functions/` 与 `wrangler.toml` 的那一层）执行，wrangler 靠当前目录识别 `functions/`。

**0. 安装 wrangler**

```bash
npm i -g wrangler --registry=https://registry.npmmirror.com
```

**1. 登录 Cloudflare**（会打开浏览器，登录后点授权）

```bash
wrangler login
wrangler whoami   # 确认登录的账号是否正确
```

**2. 创建 KV 命名空间**（后台配置存储），记下输出的 `id`

```bash
wrangler kv namespace create yunplayer-config
```

**3. 把 id 填进 `wrangler.toml`**

```toml
[[kv_namespaces]]
binding = "CONFIG_KV"        # 必须叫 CONFIG_KV，改了后台就存不上
id = "上一步输出的 id"
preview_id = "上一步输出的 id"   # 预览环境可另建一个，简单起见填同一个也能用
```

**4. 创建 Pages 项目**（项目名决定默认域名 `<项目名>.pages.dev`）

```bash
wrangler pages project create yunplayer --production-branch main
```

**5. 部署**（静态资源 + Functions 一起上传）

```bash
wrangler pages deploy public --project-name yunplayer
```

成功后输出里会给出一个 `https://<随机串>.<项目名>.pages.dev` 地址，正式地址就是 `https://<项目名>.pages.dev`。

**6. 验证后端是否生效**

```bash
curl https://yunplayer.pages.dev/api/site
```

返回一段 JSON（含 `"success":1`）即说明 Functions 正常；若返回 404 或 HTML，请检查是否在项目根目录执行、以及 `functions/` 是否完整。

> **本地预览**（可选）：`wrangler pages dev public`，默认地址 <http://127.0.0.1:8788>
>
> 不用后台功能时可以不绑 KV，站点仍可正常搜索 / 播放（配置走 `_config.js` 默认值）。
> 若控制台提示未绑定 KV：项目 → **Settings → Bindings** → Add → KV namespace，变量名填 `CONFIG_KV`，再重新执行第 5 步。
>
> ⚠️ 这种方式**没有 Git 自动部署**，以后每次改了代码都要重新执行第 5 步（详见下方「日常更新与回滚」）。

### 部署后验证（必做）

1. 访问 `https://<你的域名>/api/site`，应返回一段 JSON（含 `"success":1`）。若返回 404 或 HTML，说明 **Functions 未生效**，请检查目录结构与构建输出目录
2. 访问 `https://<你的域名>/admin.html`，用默认账号 `admin` / `admin888` 登录
3. **登录后第一件事：进「后台账号」卡片改成强密码并保存**——默认密码是公开的，务必更换

### 绑定自定义域名（可选）

Pages 项目 → **Custom domains** → **Set up a custom domain** → 输入你的域名，并按提示在 DNS 处配置记录（域名已托管在 Cloudflare 时会自动完成）。绑定后 `*.pages.dev` 仍可访问。

### 日常更新与回滚

改了代码之后怎么上线，取决于你当初用的是哪种部署方式：

| 你的部署方式 | 改了代码之后怎么上线 |
|---|---|
| 方式一（Connect to Git） | 往仓库 commit / push，Cloudflare 自动重新构建部署 |
| 方式二（Wrangler 直接上传） | **push 不会自动上线**，必须手动重新部署一次 |

**方式二（Wrangler 直传）的日常更新流程** —— 在项目根目录依次执行：

```bash
git add -A
git commit -m "你的改动说明"
git push
wrangler pages deploy public --project-name yunplayer --commit-dirty=true
```

> 最后一条才是真正上线，前三条只是同步代码到仓库。
> 不加 `--commit-dirty=true` 也能部署成功，只是 wrangler 发现工作区有未提交改动时会打一条警告，加上更清爽。

**回滚**：项目 → **Deployments** → 找到上一个正常的版本 → 右侧 **⋯ → Rollback to this deployment**，一键还原。回滚只影响前端与 Functions，**KV 中的后台配置不受影响**。

> Windows 上用 git 若出现 `LF will be replaced by CRLF` 警告，只是换行符提示，无害，可忽略。

## 配置

### 方式一：网页后台（推荐）

访问 `/admin.html` 登录后可在线管理：

| 卡片 | 可配置内容 |
|---|---|
| 站点设置 | 站点名称、热门词、本站简介 |
| 模板风格 | 深色科技风 / 浅色简约风 |
| 站点页脚 | 联系我们文字与邮箱、免责声明、版权信息、备案号、底部说明 |
| 后台账号 | 登录用户名 / 密码（加盐哈希存 KV），支持退出登录 |
| 第三方解析接口 | 增删 / 停用、名称与地址 |
| 资源站 | 增删 / 停用、名称与地址、搜索格式（`?wd=` 或 `/wd/`） |

配置存储在 **Cloudflare KV**；未绑定 KV 时会回退到 `functions/_config.js` 的内置默认值。

### 方式二：直接改文件

编辑 `functions/_config.js`：

```js
theme: "dark",           // 模板：dark 深色科技风 / light 浅色简约风

footer: {                // 页脚（copyright 支持 {year} {title} 占位符）
  link: "https://github.com/你的用户名/仓库名",   // 页脚显示为「开源地址」，点击新标签打开
  note: "……免责声明……",
  copyright: "© {year} {title} 版权所有",
  icp: "京ICP备00000000号",
  extra: "本站仅供技术学习与研究使用",
},

parse: [                 // 第三方解析接口（兜底）
  { name: "默认解析", url: "https://www.360jiexi.com/player/?url=", off: 1 },
],

resources: [             // 资源站（苹果CMS类接口）
  { name: "电影天堂", url: "http://caiji.dyttzyapi.com/api.php/provide/vod", type: 0, off: 1 },
  { name: "非凡影视", url: "http://ffzy5.tv/api.php/provide/vod", type: 0, off: 1 },
  { name: "量子影视", url: "https://cj.lziapi.com/api.php/provide/vod", type: 0, off: 1 },
  { name: "360资源", url: "https://360zyzz.com/api.php/provide/vod", type: 0, off: 1 },
  // type=0 搜索用 ?wd=关键词 ；type=1 用 /wd/关键词
],
```

- 资源站要求：支持 `?wd=关键词` 搜索、`?ac=videolist&ids=ID` 取播放数据（JSON 或 XML 均可）
- 上面为实测可用的公共接口，如失效请替换为你自己的地址，`off: 0` 可停用

## 目录结构

```
YunPlayer/
├── public/                     # 静态资源（前端页面）
│   ├── index.html              # 首页（搜索）
│   ├── play.html               # 播放页
│   ├── admin.html              # 网页后台
│   ├── css/style.css           # 全局样式（含两套主题变量）
│   ├── js/common.js            # 公共工具（主题 / 页脚渲染）
│   ├── js/index.js             # 首页逻辑
│   ├── js/play.js              # 播放页逻辑
│   ├── js/admin.js             # 后台逻辑
│   └── lib/hls.min.js          # Hls.js 播放库
├── functions/                  # Pages Functions（后端；"_" 前缀为共享代码，不注册路由）
│   ├── _config.js              # 内置默认配置
│   ├── _lib.js                 # 核心解析工具库
│   ├── api/search.js           # GET /api/search?wd=关键词
│   ├── api/parse.js            # GET /api/parse
│   ├── api/site.js             # GET /api/site
│   ├── api/admin/config.js     # 后台配置读写（需登录）
│   └── m3u8.js                 # GET /m3u8  m3u8 跨域代理
├── wrangler.toml               # 部署配置 + KV 绑定
├── LICENSE                     # 开源协议（MIT）
└── README.md
```

## API 说明

| 接口 | 方法 | 说明 |
|---|---|---|
| `/api/search` | GET | `wd=片名`，多资源站并发搜索 |
| `/api/parse` | GET | `id=ID&flag=序号` 或 `url=链接` 或 `wd=片名`，返回播放列表 |
| `/api/site` | GET | 返回站点名称、简介、模板风格、热门词与页脚信息 |
| `/api/admin/config` | GET | 读取生效配置（不含密码，需登录头） |
| `/api/admin/config` | POST | 保存配置 / `{reset:true}` 恢复默认；可选 `admin:{user,pass}` 修改后台账号 |
| `/m3u8` | GET | `url=m3u8地址`，m3u8 代理（分片重写，解决跨域） |

后台接口鉴权：请求头 `x-admin-user` / `x-admin-pass`（默认校验 `_config.js` 的 `admin` 字段；在后台修改过账号后，以 KV 中保存的加盐哈希为准）。

## 常见问题

**Q：搜索结果没有封面图？**
A：缺封面时会自动调用详情接口补齐（前 30 条、并发 10）。部分资源站有反爬校验导致补图失败，此时显示按片名生成的渐变占位图，属正常现象。

**Q：点播放没反应 / 黑屏？**
A：m3u8 依赖 Hls.js，请使用新版 Chrome / Edge / Safari；若某条线路失效，切换其他线路或资源站即可。

**Q：为什么有的资源站线路不显示？**
A：线路列表只展示 m3u8 格式的播放源，非 m3u8 格式会被隐藏。

**Q：部署后后台提示"未绑定 CONFIG_KV"？**
A：按部署第 4 步创建 KV 命名空间并绑定为 `CONFIG_KV`，再重新部署一次。

**Q：后台密码改完忘了怎么办？**
A：在 Cloudflare KV 中删除 `config` 这个键，即可恢复到 `_config.js` 中的默认账号密码。

**Q：换浏览器要重新配置吗？**
A：不用。配置存在服务端 KV，全局共享；只有后台"登录"需要在新浏览器重新输入一次账号密码。

**Q：想让别人也搭一个，会不会互相影响？**
A：不会。让对方使用**自己的**仓库、**自己的** Cloudflare 项目与**自己的** KV 命名空间部署一份即可，两边完全独立。

## 开源协议

本项目基于 [MIT License](LICENSE) 开源，可自由使用、修改与分发（请保留版权声明）。

## 免责声明

本项目仅供技术学习与研究使用，**不存储、不制作、不提供任何影视资源**；全部内容均来自使用者自行配置的第三方公开接口，版权归原权利人所有。请勿用于任何商业或侵权用途，因使用本项目产生的一切后果由使用者自行承担。

## 致谢

- 灵感来自 XyPlayer（我爱小云）
- 播放器 [Hls.js](https://github.com/video-dev/hls.js)
- 托管 [Cloudflare Pages](https://pages.cloudflare.com/)

---

<div align="center">

如果这个项目对你有帮助，欢迎点个 Star 支持一下

</div>