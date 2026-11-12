# Sun Nav 导航页

基于 Sun-Panel 风格逆向实现的**个人网站导航页**。

> **主部署方式：Cloudflare（Worker + KV）** —— 一个域名同时承载前端与 `/api/data`、`/api/meta` 接口，实现**多端实时同步**、**自动获取站点信息**、**访问密码锁**、**坚果云每日定时备份**。
> 没有 Cloudflare 后端时自动降级为**纯本地存储**（localStorage），导入/导出/重置照常可用，仅关闭云端同步与备份；但部署在无后端环境（GitHub Pages / 任意静态托管 / 直接打开）时，仍可开启**本地访问密码**（首次打开设置，本机加密保护）。
>
> ⚠️ **数据层随部署方式而变，且各部署相互独立**：只有 **Cloudflare Worker + KV** 部署具备**服务端数据库**（KV 键值库）与多端同步；在线预览站、GitHub Pages 等纯静态部署**没有服务端数据库**，数据存各自浏览器 localStorage，彼此不共享、也不跨设备同步。详见下方「数据层与部署独立性」。

当前版本：**v1.4.0**

## 功能特性

- **深/浅色主题一键切换**，样式基于 CSS 变量，默认深色。
- **顶部搜索框**：输入即站内过滤当前页面卡片；**回车或点击"搜索"** 用搜索引擎在新标签页打开并清空输入框。
- **多搜索引擎**：可勾选，支持**自定义增删**（"编辑引擎"管理，搜索地址用 `{q}` 占位）；勾选多个时逐个打开搜索页、**焦点保留在本页**；**"引擎"按钮与搜索框同一行**（搜索按钮右侧），点击可展开/收起引擎选项，页面向下滚动时也会自动收起（部分引擎页面可能被浏览器弹窗拦截，属浏览器限制）。
- **标签卡片**：普通链接卡为**紧凑横向小卡** —— 左侧 38px Logo（自动抓取 favicon，失效回退首字母），右侧站点名（最多 2 行）+ 描述信息（最多 1 行，超出省略）；卡片高度以「比 Logo 略高」为基准（桌面约 56~66px），网格按容器宽度 `auto-fill` 自动填充（1920px 约 8 列、1600px 约 7 列、1280px 约 5 列、1024px 约 4 列、平板 2 列、**手机固定每行 2 列**）。
- **功能卡片（IP 监控 / 日历时钟）**：**跨 2 列 × 4 行**（高度随普通卡片行高自动缩放），宽度不足时（≤540px）自动改为占满整行；内部站点网格用 `auto-fit` 自适应（桌面 4 列 / 手机 2 列），日历按月自适应高度，**任何宽度下内容均完整显示不裁切**。
  **右键菜单**：打开外网链接 / 打开内网链接 / 上移 / 下移 / 编辑标签 / 删除标签。
- **标签可跨分组移动**：**"编辑标签"弹窗新增"所属分组"下拉列表**，选择其它分组保存后该标签即从原分组移入目标分组（添加站点时也可直接指定分组）。
- **分类与卡片均可排序**：桌面端直接拖拽；任意端（含手机）也可用右键菜单**上移/下移**。分类支持右键重命名、添加站点、删除。
- **左侧可折叠分类树**：点击切换分类、显示"全部站点"，固定分类带"固定"标记，窄屏自动收纳。
- **增删改**：页面按钮即可完成（+分类、+添加站点、编辑、删除），数据自动保存；
  **导出可选格式**（Sun-Panel JSON / 浏览器 HTML 书签），**导入自动识别**本应用 JSON、**Sun-Panel v1.x 备份（可直接上传 `.zip` 压缩包，自动解压读取内部 config.json，无需手动解压）**、Chrome/Edge/Firefox 书签 HTML 三种来源。（注：Sun-Panel v2 导出格式存疑，兼容性待验证，暂不主推）
- **重置**：清空所有自建/导入数据，**只保留「功能工具」一个分组**（含 IP 监控、日历时钟两个功能卡及其网络检测站点），回到干净的初始状态。
- **云端同步与访问控制（Cloudflare 为主）**：顶部「管理」按钮展开区统一收纳导入/导出/重置、本地密码与同步状态；接入 Cloudflare KV 后多端实时同步（前端经同域 `/api/data` 读写，自动一致）；可设访问密码锁（仿 Sun-Panel，仅密码、本机可记住）；支持坚果云 WebDAV 每日定时备份（详见「部署 → 工作原理」）。无 Cloudflare 后端时自动降级为本地存储，但仍可在「管理 → 本地访问密码」开启**本机密码锁**（SHA-256 哈希存本地，首次打开设置、可跳过、可记住）。
- **字段与 Sun-Panel 统一**：标签的「描述信息」对应 Sun-Panel 的 `description` 字段，导出即 Sun-Panel 兼容格式，可直接平移回 Sun-Panel。
- **自动获取站点信息（v1.4.0）**：添加站点时**只填网址**，点「⚡ 自动获取」即自动补齐名称 / 描述 / Logo。**三级降级**：A 同源 Worker `/api/meta`（Cloudflare 部署，服务端抓取，带站点密码校验与 SSRF 防护）→ B 公共元数据 / 代理服务（GitHub Pages 等纯静态部署兜底）→ C favicon 多源 `<img>` 探测（任何环境可用，通常至少能拿到图标）。**只写空白字段、绝不覆盖已填内容**，所有字段始终开放可手改、不自动保存；自动填入项带高亮标记，一编辑即消失。
- **版本号显示**：左侧分类树底部、"收起分类树"按钮下方一行显示当前代码版本号，随版本同步更新。
- **固定功能卡**（"功能工具"分类，不可随数据丢失）：
  - **IP 与连通性测试**：自包含实现（参考 ip.skk.moe），实时显示公网 IP/归属地/ISP，并对百度/Google/GitHub/OpenAI/Cloudflare/YouTube 等主要站点做连通性探测（显示延迟），每 30 秒自动刷新。
  - **日历与时钟**：实时时钟 + 当月日历（高亮今天与周末）。
  - **网络检测 / IP 信息检测** 网站导航若干（IPCheck、ip.skk.moe、ip111、IPv6 测试、ipleak、itdog 等）。

## 性能优化（条目多不卡顿）

- 卡片图片 `loading="lazy"` 懒加载 + `referrerPolicy` 防泄漏。
- 全部视图下分类区块使用 CSS `content-visibility: auto` 懒渲染。
- Logo 加载失败自动回退为站点首字母，不阻塞布局。
- 数据渲染基于原生 JS 轻量实现，无第三方框架依赖。

## 目录结构

```
sun-nav/
├─ index.html           入口页（前端）
├─ css/style.css        样式（深/浅主题变量）
├─ js/app.js            逻辑（状态、渲染、搜索、右键菜单、拖拽、widget、云端同步）
├─ js/data.js           站点数据（完整版，含本地/自建使用）
├─ worker.js            Cloudflare Worker：/api/data 读写 KV + /api/meta 元数据抓取 + 密码锁 + 每日定时备份
├─ wrangler.toml        Cloudflare 部署配置（静态资源目录 + KV 绑定 + 定时触发器）
├─ tools/prune-packages.py  代码包留档清理（X/Y 各留 3、Z 留 5）
├─ test/                测试版归档（独立构建，经 GitHub Pages 预览；不参与正式版 / Cloudflare 部署）
└─ deploy-public/       公开部署版（已剔除敏感分类，仅用于发布公网；内含代码包 zip）
```

> 本项目是 `notice` 仓库里的 **`sun-nav/` 子目录**。GitHub Actions 工作流必须位于**仓库根目录**的 `.github/workflows/`（即 `notice/.github/workflows/`），放在子目录里不会被执行——本仓库已把两个工作流放在仓库根，无需再移动（详见下方「部署」说明）。

## 本地运行

直接双击 `index.html` 用浏览器打开即可（数据在本地 localStorage）。
或任意静态服务器托管该目录：`python3 -m http.server 8080` 后访问 `http://localhost:8080`。

> 注：file:// 方式打开时，IP 检测接口受浏览器 CORS 限制可能显示"获取失败"，部署到 http(s) 后即可正常获取 IP。

## 数据说明

- 默认站点数据来自 `js/data.js`（`window.SUN_PANEL_DATA`）。
- 页面内增删改会写入浏览器 localStorage 并优先于默认数据加载。
- 完整版 `js/data.js` 含全部分类；`deploy-public/js/data.js` 为公开部署版，已剔除敏感分类（Pornhub / 搭梯子 / 公益机场），避免公网链接与平台内容政策冲突。
- 日后新增站点：可在页面点"添加站点"，或直接告知维护方在 `js/data.js` 对应分类中追加后发新版本。
- 标签字段与 Sun-Panel 对齐：`title` / `url` / `lanUrl` / `description`（描述信息）/ `logo`。

## 版本记录

> 排列规则：**最新版本在最前**（降序），便于快速查看当前改动。

**部署记录（非代码版本）**

| 日期 | 部署地址 | 说明 |
| --- | --- | --- |
| 2026-11-12 | https://af5216a4a1143e54e.app.workbuddy.host/?sharecode=L6MHTSDGZ2 | **v1.4.0 转正 + 建立测试版归档规则**：① 「自动获取站点信息」测试构建（v1.4.0-test.1）验证通过后**转正为 v1.4.0**，合并进正式版 `sun-nav/`；② **移除 Cloudflare Drop 专用交付物与文档**（Drop 为纯静态托管、无法运行 Worker `/api/meta`，不作为部署通道保留）；③ 归档规则：以后测试版在仓库 `sun-nav/` 下建 `test/` 目录推送，经 GitHub Pages 预览，不另开部署地址、不覆盖正式版；④ 本次测试版作为首个归档推入 `sun-nav/test/`。代码级更新，版本号 v1.4.0 |
| 2026-11-07 | https://af5216a4a1143e54e.app.workbuddy.host/?sharecode=L6MHTSDGZ2 | **GitHub 连接器打通 + 清理历史残留 + 固化总记忆规则**：① GitHub 连接器重新授权成功，实测 `/user` = `lyqnihao`、`lyqnihao/notice` 具备 admin/push 权限，只读比对确认远端与本地 v1.3.2 完全一致；② **真实推送测试**：删除历史残留 `sun-nav/worker/`（早期旧版 Worker 结构，已迁至 `sun-nav/` 根、不参与部署），验证 clone→commit→push 全链路可用；③ 固化总记忆规则：每次修订回复开头直接给两个可点击链接、末尾询问是否更新 GitHub（确认后直推）、commit summary 用版本号/非代码级按原因提炼。属文档与仓库维护，功能代码未改，版本号保持 v1.3.2 |
| 2026-11-07 | https://af5216a4a1143e54e.app.workbuddy.host/?sharecode=L6MHTSDGZ2 | **新增「数据层与部署独立性」说明**：明确服务端数据库 / 云端同步（Cloudflare KV）**仅属 Cloudflare 部署**，workbuddy.host 在线预览站与 GitHub Pages 等纯静态部署为**各自独立的浏览器本地存储**、无服务端数据库、不跨设备同步；概览追加醒目提示，部署章节新增三方式对照表、判定方式与「各自独立」含义。属文档修订，功能代码未改，版本号保持 v1.3.2 |
| 2026-11-06 | https://af5216a4a1143e54e.app.workbuddy.host/?sharecode=L6MHTSDGZ2 | **恢复原部署地址 + 修复 Cloudflare 变量被清空**：① 原地址仍可用，上一轮误判"被屏蔽"而更换 `appName` 属理解错误，已改回原 `appName` 重新部署、恢复原地址；② 「总要求」修正为**优先复用原地址、两个链接都写成可点击超链接，仅当链接确实被屏蔽才换新**；③ 修复 GitHub Actions 每次部署清空控制台已设 Variables 的问题：`deploy-cloudflare.yml` rev.2 改用 `wrangler@4 deploy --keep-vars` 并锁定大版本，CI 不写入任何 vars/secrets。v1.1.5–v1.3.2 代码包随恢复后的原地址上线并验证 200 |
| 2026-11-06 | （已作废，勿使用） | 曾因误判原地址被屏蔽而更换 `appName` 发布的临时新地址；本轮已改回并恢复原地址，该临时地址不再维护（留痕） |

| 版本 | 日期 | 说明 |
| --- | --- | --- |
| v1.4.0 | 2026-11-12 | **自动获取站点信息（由 v1.4.0-test.1 转正）**：① 添加站点表单新增「⚡ 自动获取」按钮，只填网址即自动补齐名称 / 描述 / Logo，**只写空白字段、不覆盖手填内容**，字段始终开放可改、不自动保存；② **三级降级** A 同源 `/api/meta`（服务端抓取 `<title>`/`description`/`og:*`/`link[rel=icon]`）→ B 公共代理并行竞速 → C favicon 多源探测；③ **Worker 新增 `/api/meta` 分支**，与 `/api/data` 一致校验 `SITE_PASSWORD`，内置 SSRF 防护（拒绝私网 / 云元数据 / 非 80·443 端口、逐跳校验重定向最多 3 跳、6s 超时、300KB 上限、过滤 `data:` 空图标）；④ 前端 A 级请求自动附带站点密码；⑤ 测试期修复 `extractMeta()` 混合正则吞掉 `<title>` 导致标题为空的 bug。v1.4.0-test.1 为测试构建版本号，正式版跳过不用 |
| v1.3.2 | 2026-11-06 | **初始数据精简 + 响应式侧边栏 + 通用HTML多地址导出/导入**：① **初始部署默认数据只保留「功能工具」「测试中」「外网应用」三个分类**，其余 20 个分类清理（仅影响无本地存档时的首次 seed）；② **响应式侧边栏**——电脑版（宽屏）默认开启菜单，手机版（≤760px）打开时默认关闭减少遮挡（init 与 resize 时按宽度自动设置）；③ **通用 HTML（书签）导出**：一个标签同时有外网/内网地址时，拆成「标题（外网）」「标题（内网）」多条超链接避免丢失；**导入时**识别该后缀并合并回同一标签的多个地址，且合并去重时对同名同链接条目补全省缺字段（如 lanUrl） |
| v1.3.1 | 2026-11-03 | **修复重置清掉自定义标签 + 搜索多引擎 + 导入排序**：① **重置时保留「功能工具」内用户自己添加的标签**——`buildResetData` 改为优先采用现有「功能工具」分组（含自定义标签），仅补足默认组件（IP监测/日历时钟），不再因重置而清空用户内容；② **搜索多选引擎**——逐个打开，浏览器只放行首个弹窗，被拦截的其余引擎改为右上角可点击链接浮层，确保都能打开；③ 导入模式「覆盖」移至最后，默认仍为「合并去重」 |
| v1.3.0 | 2026-11-03 | **导入默认改合并 + 导出命名规范化**：导入模式**默认改为"合并去重"**（原为"覆盖"），修复"导入其它备份时现有分类/标签被整体替换丢失"的问题（如「功能工具」分类下的自定义标签在导入后消失）；导出文件命名调整为 `SunNav-Data<时间戳>.SunPanel.json`，与 Sun-Panel 导出风格一致、便于存储区分。**版本号跳过 v1.2.3 / v1.2.4**：该两版为 Sun-Panel v2 导入的试探性修改，因 v2 导出本身存疑、暂不确定导入是否有误，故废弃不用 |
| v1.2.2 | 2026-11-03 | **修正部署认知 + 补本地密码锁**：修正两个工作流位置（移出子目录、放到仓库根 `notice/.github/workflows/`）；`deploy-pages.yml` 改为发布**整个 notice 仓库**（`path: '.'`），与"Cloudflare 只部署 sun-nav 子目录"分清；新增**纯前端本地访问密码锁**（无后端环境也能设密码：首次打开可设置/跳过、SHA-256 哈希存本地、可记住密码、管理面板可设置/修改/关闭），解决"非 Cloudflare 部署没有密码入口"的问题 |
| v1.2.1 | 2026-11-03 | **字段与 Sun-Panel 统一**：标签「介绍」改为「描述信息」，内部字段 `desc` 统一为 `description`（导出即 Sun-Panel 兼容，旧数据自动迁移）；**重构 Cloudflare 部署**：`wrangler.toml` + `worker.js` 移到子目录根，用 `[assets]` 让前端与 `/api/data` 同域一次性部署；新增 GitHub Actions「Cloudflare 自动部署」工作流并修正「Pages」工作流（须放仓库根 `.github/workflows/`）；README 以 Cloudflare 为主重写部署章节 |
| v1.2.0 | 2026-11-03 | **多端同步与访问控制**：「管理」按钮展开区收纳导入/导出/重置；Cloudflare KV 云端实时同步；可选访问密码锁；坚果云 WebDAV 每日北京时间 09:00 定时备份；变量名大小写兼容；无后端时自动降级本地存储 |
| v1.1.8 | 2026-11-03 | **支持直接上传 .zip 备份导入**：内置 JSZip 离线解压后自动定位内部 config.json |
| v1.1.7 | 2026-10-29 | **兼容 Sun-Panel v2 备份导入**：`normalizeImport` 同时支持「顶层字段」与「`cardData` 嵌套字段」两种结构 |
| v1.1.6 | 2026-10-29 | **卡片再紧凑化**：普通卡取消 2:1 锁高，改为「比 Logo 略高」的小卡（简介压到 1 行），网格最小列宽收窄；手机端固定每行 2 列；功能卡改为跨 2 列 × 4 行 |
| v1.1.5 | 2026-10-29 | **卡片形态调整**：普通链接卡改为 2:1 横向卡（左 Logo、右名称+描述，描述 2 行）；功能卡改为跨 2 列 × 2 行 |
| v1.1.4 | 2026-10-29 | **修复桌面版卡片布局**：分组区块容器与卡片网格拆分；"引擎"按钮移入搜索框同行并改为点击切换；"编辑标签"弹窗新增"所属分组"下拉；"重置"改为只保留「功能工具」一个分组；分类树底部新增版本号行 |
| v1.1.3 | 2026-10-27 | 连通性检测站点将"必应"替换为 OpenAI；导出新增"格式选择"弹窗（Sun-Panel JSON / 浏览器 HTML 书签），导入新增自动识别 Chrome/Edge/Firefox 书签 HTML 文件 |
| v1.1.2 | 2026-10-27 | 修复安卓移动端（Via 浏览器）导入导出兼容：导出改为"文件下载 + 剪贴板复制"双通道（未自动下载时内容已入剪贴板，可粘贴保存）；导入移除文件类型过滤，解决文件选择器无文件可选问题 |
| v1.1.1 | 2026-10-27 | 导入支持三种模式：覆盖（清空整体替换，带二次确认）/ 合并去重（并入现有，同名同链接自动去重）/ 仅追加（备份作为新分类整体加入，不去重）；同名分类追加时加"（导入）"后缀区分 |
| v1.1.0 | 2026-10-26 | 导出改为 Sun-Panel 兼容格式（可平移回 sun-panel），导入自动识别本应用与 Sun-Panel 两种格式；搜索引擎可自定义增删，页面向下滚动时选项自动收起；卡片与分类右键新增"上移/下移"排序（移动端可用），保留桌面拖拽 |
| v1.0.0 | 2026-10-26 | 首版：主题切换、搜索+多引擎、1×2 卡片右键菜单、分类树、拖拽排序、导入导出重置、IP 连通性/日历时钟固定功能卡；数据迁移自 Sun-Panel 备份（完整 23 组 / 公开 20 组） |

## 部署

本项目**主推 Cloudflare 部署**（前端 + Worker 同域，开箱即用的多端同步）。同时保留纯静态（GitHub Pages / 任意静态托管）作为无同步的备选。

### 两种 GitHub Actions 工作流（务必分清）

> ⚠️ **工作流文件必须放在仓库根目录** `notice/.github/workflows/`（不能放在 `sun-nav/` 子目录里，否则 GitHub 不会执行）。本仓库已把两个工作流放在仓库根，无需再移动。

| 工作流 | 文件 | 部署目标 | 范围 | Secrets |
| --- | --- | --- | --- | --- |
| **Cloudflare 自动部署** | `deploy-cloudflare.yml` | Cloudflare Worker（前端 + `/api/data` 同域） | 仅 `sun-nav/` 子目录（`working-directory: sun-nav`） | `CF_ACCOUNT_ID`、`CF_API_TOKEN`、`KV_NAMESPACE_ID` |
| **GitHub Pages 发布** | `deploy-pages.yml` | GitHub Pages（纯静态） | **整个 notice 仓库**（`path: '.'`，含 `sun-nav/` 在内的全部内容） | 无需额外 secret（Pages 自带权限） |

- **Cloudflare 工作流**只部署 `sun-nav/` 子目录（前端 + `/api/data` 同域，带同步能力）；**Pages 工作流**把**整个 notice 仓库**发布为静态站点（数据走本地存储，无 KV 同步）。二者互相独立，可按需只启用其中一个。

### 方式一：GitHub Actions 自动部署到 Cloudflare（推荐）

1. **准备 Cloudflare**
   - 登录 Cloudflare，记下 **Account ID**（Dashboard 右侧）。
   - 创建一个 **KV 命名空间**（Workers & Pages → KV → Create），记下它的**命名空间 ID**。
2. **确认工作流位置**：本仓库已把 `deploy-cloudflare.yml` 直接放在仓库根 `notice/.github/workflows/`（GitHub 只认这个位置），无需移动。
3. **添加仓库 Secrets**（`notice` 仓库 → Settings → Secrets and variables → Actions → New repository secret）：
   - `CF_ACCOUNT_ID`：上面的 Account ID。
   - `CF_API_TOKEN`：Cloudflare API Token（权限：`Account` → `Workers Scripts` → Edit，并把 Account/Zone 资源范围限制到实际部署账号）。
   - `KV_NAMESPACE_ID`：上面建的 KV 命名空间 ID（CI 会自动写进 `wrangler.toml` 的占位符处）。
4. **触发部署**：推送 `main`/`master`（且 `sun-nav/**` 有改动）即自动运行；或到 Actions 页面手动 `Run workflow`。CI 会执行 `npx wrangler@4 deploy --keep-vars`，前端与 `/api/data` 同域上线；`--keep-vars` 保证控制台里手动设置的 Variables 不会被每次部署覆盖（见下方「变量保护」）。
5. **设置运行时变量/密钥**（部署后，**只需一次**）：Worker 上线后，到 Cloudflare 该 Worker 的 **Settings → Variables & Secrets → Add** 添加（详见下方「Worker 变量与密钥」）。其中 `SITE_PASSWORD` / `WEBDAV_USER` / `WEBDAV_PASS` 务必选 **Secret** 类型；**设置后即时生效，无需重新部署**，后续每次 Actions 部署也不会清除它们（见下方「变量保护」）。

### 方式二：命令行手动部署（wrangler）

```bash
cd sun-nav
npx wrangler login                       # 浏览器授权 Cloudflare
npx wrangler kv namespace create sun-nav-data   # 创建 KV，把返回 id 填进 wrangler.toml 的 kv_namespaces.id
npx wrangler secret put SITE_PASSWORD    # 可选：访问密码锁
npx wrangler secret put WEBDAV_USER      # 坚果云账号
npx wrangler secret put WEBDAV_PASS      # 坚果云授权码（非登录密码）
npx wrangler@4 deploy --keep-vars       # 部署（前端 + /api/data 同域；保留控制台已设变量）
```

### 方式三：GitHub Pages（纯静态，无同步）

把 `deploy-pages.yml` 放到仓库根 `.github/workflows/`（本仓库已就位）；在 `notice` 仓库 Settings → Pages → Build and deployment → Source 选 **GitHub Actions**。该工作流用 `path: '.'` **发布整个 notice 仓库**（含 `sun-nav/` 在内的全部内容），数据走本地存储，无 KV 同步；如需启用本机密码保护，见下方「本地访问密码锁」。

### 方式四：Cloudflare Pages / 其它静态托管（纯静态）

直接上传 `deploy-public/` 目录即可（Cloudflare Pages、豆包、aiforce.cloud 等）。无 `/api` 后端，自动降级为本地存储，导入/导出/重置照常可用。

### Worker 变量与密钥（手动添加哪些）

| 名称 | 必填 | 类型 | 说明 |
| --- | --- | --- | --- |
| `KV`（绑定名） | 是 | 绑定 | `wrangler.toml` 中 `kv_namespaces` 的 binding，默认 `KV` |
| `SITE_PASSWORD` | 否 | Secret | 设置后启用访问密码锁（仿 Sun-Panel，仅密码、可本机记住） |
| `WEBDAV_URL` | 否 | Var / Secret | 坚果云 Dav 地址，如 `https://dav.jianguoyun.com/dav/` |
| `WEBDAV_USER` | 否 | Secret | 坚果云账号 |
| `WEBDAV_PASS` | 否 | Secret | 坚果云授权码（**注意是「授权码」非登录密码**） |
| `WEBDAV_PATH` | 否 | Var | 备份目录，默认 `/sun-nav` |

- 变量名大小写均可，Worker 内部不区分（`WEBDAV_URL` / `webdav_url` 等价）。
- 敏感项（`SITE_PASSWORD` / `WEBDAV_USER` / `WEBDAV_PASS`）请用 `wrangler secret put` 或在 Dashboard **Variables & Secrets → Add 选 Secret**；非敏感项可写进 `wrangler.toml` 的 `[vars]`。

#### 变量保护：为什么现在不会被每次部署清空

Wrangler 默认把 `wrangler.toml` 当作配置的**唯一来源**：`wrangler deploy` 会用 toml 里的 `[vars]` 全量覆盖控制台中的同名变量，并删除控制台里额外添加的明文变量（官方文档：`--keep-vars` 默认 false）。这正是"GitHub Actions 每部署一次、Variables 就被清空"的根因。早期 README 还写着"设置变量后重新部署一次使其生效"，等于主动触发了这次覆盖。

修复（`deploy-cloudflare.yml` rev.2）：部署命令改为 **`wrangler@4 deploy --keep-vars`**，并把 `wrangler@latest` 锁到大版本 `@4` 避免行为漂移。

| 项目 | 加 `--keep-vars` 后 |
| --- | --- |
| 控制台里**额外**手动添加的明文变量 | 保留，不再被删除 |
| Secret 类型（`SITE_PASSWORD` / `WEBDAV_USER` / `WEBDAV_PASS`） | 官方保证**任何部署都不会删除 Secret**（无论该开关真假）；用 `wrangler secret put` 或控制台选 **Secret** 类型设置一次即可 |
| `wrangler.toml` `[vars]` 里**已声明**的 `WEBDAV_URL` / `WEBDAV_PATH` | 每次仍以 toml 为准（期望行为）。若希望完全由控制台接管，删除 `[vars]` 这两行，并在控制台补 `WEBDAV_URL`，否则定时备份不工作 |

> 若你在控制台设的是**明文变量**而非 Secret，请改为 Secret 类型——明文变量即使加了 `--keep-vars`，被 toml 同名声明的仍会被覆盖。
>
> **为什么不做「检测首次部署、只在第一次由 Actions 设置」**：该方案需调用 Cloudflare API 判断 Worker 是否已存在，判断失败会变成"每次重设"或"永不设置"，且把密码放进 CI 会扩大泄露面。改用官方内建 `--keep-vars`：**所有变量/密钥只在控制台设置一次，CI 完全不碰**，更简单也更可靠。本地命令行部署同样请带 `--keep-vars`（见方式二）。

### 工作原理（Cloudflare 部署）

- **同域一体化**：`wrangler.toml` 用 `[assets] directory = "deploy-public"` 把前端作为静态资源托管，同时 `worker.js` 处理未命中静态文件的请求（如 `/api/data`），因此前端与接口**同源同域**，无需任何跨域配置。
- **实时同步**：前端通过同域相对路径 `/api/data` 读写 KV（GET 拉取、PUT 保存），多端共用同一命名空间即自动同步。
- **访问密码锁（Cloudflare）**：设置 `SITE_PASSWORD` 后，打开页面需输入密码（仿 Sun-Panel，仅密码、无用户名）；勾选「记住密码」可本机免输。未设置则不锁。
- **定时备份**：Cloudflare Cron（`0 1 * * *` UTC = 北京时间 09:00）触发 Worker，把 KV 当前数据以 `sun-nav-YYYYMMDDHHMMSS.json` 写入坚果云 WebDAV，**只新增、不删除旧备份**（旧备份自行清理）。
- **降级说明（无 Cloudflare 后端 / 纯静态托管）**：前端自动降级为浏览器本地存储，不启用 Cloudflare 密码锁、不备份；导入/导出/重置照常可用。

### 数据层与部署独立性（重要 · 对外介绍请先读）

Sun Nav 的**服务端数据库 / 云端同步不是所有部署都有**，而是绑定在 Cloudflare 那套部署上。同一个代码包部署到不同平台，会呈现完全不同的数据层：

| 部署方式 | 数据存哪 | 服务端数据库 | 多端 / 跨设备同步 | 密码锁 |
| --- | --- | --- | --- | --- |
| **Cloudflare Worker + KV**（主部署） | 服务端 **KV 键值数据库**（`env.KV` + `/api/data`；另有 `/api/meta` 元数据抓取） | ✅ 有 | ✅ 同一命名空间全端实时同步 | 服务端 `SITE_PASSWORD`（`/api/data` 与 `/api/meta` 均校验） |
| **workbuddy.host 在线预览**（纯静态托管） | 浏览器 **localStorage** | ❌ 无 | ❌ | 本地密码锁（仅本机） |
| **GitHub Pages / 其它静态托管 / 直接打开 `index.html`** | 浏览器 **localStorage** | ❌ 无 | ❌ | 本地密码锁（仅本机） |

**判定方式**：前端 `bootData()` 启动时会请求同源 `/api/data`——返回 `200`/`401` 说明存在 Cloudflare 后端，进入 KV 模式；返回 **`404`**（静态服务器没有这个接口）则自动降级为本地模式。站点「管理 → 同步状态」会显示"云端同步：已连接"或"本地存储"，可据此当场确认。

「自动获取」同理：Cloudflare 部署走 **A**（`/api/meta` 服务端抓取，需站点密码，最完整）；纯静态部署下 A 返回 404 / HTML，自动降级 **B**（公共代理）+ **C**（favicon 探测），因此静态部署通常**至少能自动拿到 Logo**，名称/描述取决于第三方服务可用性。

**「各自独立」的确切含义**：

- 不同域名之间天然各存一份（localStorage 按源隔离），预览站 / GitHub Pages / 本地文件互不影响；
- 同一域名 + 同一浏览器内重复打开是同一份数据；换浏览器、换设备、无痕窗口 = 另一份；
- Cloudflare 那套主数据在 KV，前端 localStorage 只保留「记住的密码」、主题、搜索引擎等本机偏好。

**设计取向**：**不做跨服务器同步**，各部署的数据刻意保持独立——预览 / 演示环境既读不到、也不会污染正式 Cloudflare 数据。Cloudflare 站点是**唯一**具备服务端数据库与多端同步能力的部署。

> 对外介绍的准确说法：*"Sun Nav 支持服务端数据库（Cloudflare KV）实现多端实时同步；演示 / 预览站是纯静态版，数据存浏览器本地，各部署相互独立。"* 请勿把"有数据库后端"套用到在线预览站或 GitHub Pages 上。

### 本地访问密码锁（无后端环境也受保护）

Cloudflare 的 `SITE_PASSWORD` 由后端校验，只在部署到 Cloudflare 时生效。若你把站点部署到 **GitHub Pages / 任意静态托管 / 直接打开 `index.html`**（这些环境没有 `/api/data` 后端），可改用**纯前端本地密码锁**：

- **首次打开**：若尚未设置密码，会弹出"设置访问密码"界面，输入两次（≥4 位）即启用；也可点「暂不设置」跳过（之后随时可在管理面板开启）。
- **之后打开**：弹出"输入访问密码"，密码以 **SHA-256 哈希**形式存于本机 localStorage（不落明文），校验通过才显示导航；勾选「记住密码」可本机免输。
- **管理面板操作**：顶部「管理」→「本地访问密码」可**设置/修改**（已设置过则不允许跳过，只能改或取消）或**关闭**（清除本地密码）。
- **注意**：本地密码仅保护"本机浏览器"的查看，无法阻止他人直接读取 localStorage 数据——它是一道**本地 deterrent（防随手翻看）**，不是服务端强鉴权；需要真正的多端统一强鉴权请用 Cloudflare 部署。

## 部署约定（维护习惯）

每次修订后固定执行以下四步，缺一不可：

1. **自动部署**：把 `deploy-public/` 实际重新发布一次（发布脚本取当次返回的 `shareLink`）。**正常情况下地址保持不变，优先复用原地址**；仅当链接确实被系统屏蔽/打不开时，才更换 `appName` 发布全新地址、给新链接（换址属例外，见下方总要求）。
2. **提供代码包**：打包 `sun-nav-vX.Y.Z.zip`（带版本号），**并复制一份到 `deploy-public/`**，使其随站点一起上线，可通过 `https://<当次部署地址>/sun-nav-vX.Y.Z.zip` 直接下载。
   > 本地工作区路径在部分客户端上无法下载，故代码包必须同时提供线上下载链接。
3. **代码包留档**：旧版本包**不删除、按策略保留**，见下方「代码包留档策略」。
4. **同步到 GitHub / Cloudflare**：**先询问用户是否更新 GitHub，确认后**再推送到 `lyqnihao/notice` 的 `main`（commit summary 按下方规则），保持各处版本一致；未确认不推送。

> **【总要求·每次提交必须给出两个链接】** 每完成一次修订/提交，都要**实际重新自动部署一次**（把 `deploy-public/` 重新发布，取**当次返回的 `shareLink`**，原样保留 `?sharecode=...`），并在回复中同时给出：
>
> | 链接类型 | 说明 |
> | --- | --- |
> | **部署超链接** | 当次部署产出的在线预览地址（形如 `https://xxx.app.workbuddy.host/?sharecode=...`），打开即检查最新版本效果 |
> | **代码包下载链接** | 同一部署地址下的 `sun-nav-vX.Y.Z.zip`（随 `deploy-public/` 上线），可直接下载 |
>
> - **链接以当次实际部署返回为准**，每次都要重新部署并验证，不要凭记忆复用；但原地址能正常访问时**不要更换**，保持地址稳定便于检查与存档。
> - **【回复形式·固定】每次修订后的回复开头，直接、显眼地给出这两个可点击链接**（单独成行，如 `- **[在线预览 · 打开即检查](地址)**` / `- **[下载 vX.Y.Z 代码包](地址)**`），不要藏在表格里、也不要只给裸 URL 或本地路径。此形式用户已确认好用，每次修订后照做。
> - 回复中两个链接都要写成**可直接点击的 Markdown 超链接**（`[在线预览](地址)` / `[下载代码包](地址)`），不要只给裸文本 URL 或本地文件路径。
> - 发版前须**实际验证**两个链接可访问（HTTP 200）：主页 `js/app.js` 的 `APP_VERSION` 应为最新版本，zip 链接能下载且字节数与本地包一致；**仅在本地工作区给出文件路径不算完成交付**。
> - **仅当原链接确实被系统错屏蔽 / 打不开**：才更换 `appName` 发布一个**全新部署地址**，并把新链接同步更新到本表与存档表后再给出；换址属例外操作，不要每次提交都做。

> **【总要求·每次修订后询问是否更新 GitHub】** 每次修订完成、给出上面两个链接之后，**必须主动询问用户「是否把本次代码更新至 GitHub 仓库」**；得到明确确认后，再直接更新到 `lyqnihao/notice` 的 `main` 分支（连接器已授权、具备 push 权限，无需用户手动上传）。未获确认前不得擅自推送。
>
> - **GitHub 提交 summary（commit message）规则**：
>   - **代码级更新**（有新版本号）：summary 直接用**代码版本号**，如 `v1.3.2`。
>   - **非代码级更新**（无新版本号，如文档修订、清理残留、部署/配置维护）：由助手**根据修订原因提炼一句中文 summary**，如 `清理历史残留：移除 sun-nav/worker/ 旧版 Worker 结构`、`文档：补充数据层与部署独立性说明`。
> - 推送前先 `git status` 确认改动范围、只提交本次相关内容；推送后核对远端最新提交与文件状态，确认同步成功。

> **【总要求·测试版归档】** 以后的测试版**不另开部署地址、不占用正式版地址**：在 GitHub 仓库 `sun-nav/` 目录下建 `test/` 子目录，把测试版构建推送到 `lyqnihao/notice` 的 `main`，由 GitHub Pages 发布整个仓库后可直接访问 `sun-nav/test/`。测试版与正式版 `sun-nav/` 根目录文件互不覆盖，且**不参与 Cloudflare Worker 部署**（`[assets]` 只取 `deploy-public/`）。测试版可保留自己的 `TEST` 标识与独立版本号（如 `v1.4.0-test.N`），便于区分。

其他注意事项：

- 部署前确认 `deploy-public/` 与根目录的 `index.html` / `css/style.css` / `js/app.js` 内容一致（差异应仅在 `js/data.js` 的公开版分类，以及 `deploy-public/` 内多出的代码包）。
- 打包时用 `-x "*.zip"` 排除，避免代码包把自身打进去。
- 升级版本号时同步修改：`js/app.js` 的 `APP_VERSION`、各文件头部注释、`README.md` 当前版本与版本记录表、**部署存档表的最新版链接**、代码包文件名。

### 代码包留档策略

代码包体积小、线上空间充足，**历史版本按版本号 X.Y.Z 三级分层保留**（由 `tools/prune-packages.py` 自动维护）：

| 段位 | 含义 | 保留规则 |
| --- | --- | --- |
| **X** | 主版本 | 全局保留**最新 3 个**主版本 |
| **Y** | 次版本 | 每个主版本下保留**最新 3 个**次版本 |
| **Z** | 修订号 | 每个 (主版本, 次版本) 下**最多保留最新 5 个**修订号 |

示例：若已有 `v1.1.0 ~ v1.1.7`，只保留 `v1.1.3 ~ v1.1.7`；若已有主版本 1/2/3/4，则整个 `v1.x` 会被淘汰。

手动执行：

```bash
python3 tools/prune-packages.py            # 清理 deploy-public 下的旧包
python3 tools/prune-packages.py --dry-run  # 只预览将要删除的文件
python3 tools/prune-packages.py --list     # 打印当前保留清单
```

### 部署地址与存档

- **部署超链接（在线预览，始终为最新版，可直接打开检查）**：https://af5216a4a1143e54e.app.workbuddy.host/?sharecode=L6MHTSDGZ2
- **最新版代码包下载链接**：https://af5216a4a1143e54e.app.workbuddy.host/sun-nav-v1.4.0.zip?sharecode=L6MHTSDGZ2

当前线上代码包存档（**最新版本在最前**）：

| 版本 | 下载链接 |
| --- | --- |
| **v1.4.0（最新）** | https://af5216a4a1143e54e.app.workbuddy.host/sun-nav-v1.4.0.zip?sharecode=L6MHTSDGZ2 |
| v1.3.2 | https://af5216a4a1143e54e.app.workbuddy.host/sun-nav-v1.3.2.zip?sharecode=L6MHTSDGZ2 |
| v1.3.1 | https://af5216a4a1143e54e.app.workbuddy.host/sun-nav-v1.3.1.zip?sharecode=L6MHTSDGZ2 |
| v1.3.0 | https://af5216a4a1143e54e.app.workbuddy.host/sun-nav-v1.3.0.zip?sharecode=L6MHTSDGZ2 |
| v1.2.2 | https://af5216a4a1143e54e.app.workbuddy.host/sun-nav-v1.2.2.zip?sharecode=L6MHTSDGZ2 |
| v1.2.1 | https://af5216a4a1143e54e.app.workbuddy.host/sun-nav-v1.2.1.zip?sharecode=L6MHTSDGZ2 |
| v1.2.0 | https://af5216a4a1143e54e.app.workbuddy.host/sun-nav-v1.2.0.zip?sharecode=L6MHTSDGZ2 |
| v1.1.8 | https://af5216a4a1143e54e.app.workbuddy.host/sun-nav-v1.1.8.zip?sharecode=L6MHTSDGZ2 |
| v1.1.7 | https://af5216a4a1143e54e.app.workbuddy.host/sun-nav-v1.1.7.zip?sharecode=L6MHTSDGZ2 |
| v1.1.6 | https://af5216a4a1143e54e.app.workbuddy.host/sun-nav-v1.1.6.zip?sharecode=L6MHTSDGZ2 |
| v1.1.5 | https://af5216a4a1143e54e.app.workbuddy.host/sun-nav-v1.1.5.zip?sharecode=L6MHTSDGZ2 |

> 存档自 **v1.1.5** 起开始保留；更早版本未留存源码快照，无法补建。以上链接均已验证 HTTP 200、字节数与本地包一致。每次发版后本表会追加新版本链接（置于最前），被策略淘汰的版本同步移除。

- **Cloudflare（主部署）**：按上方「部署」章节用 `wrangler deploy` 或 GitHub Actions 自动部署（前端 + `/api/data` + `/api/meta` 同域）。
- **GitHub Pages**：`deploy-pages.yml` 已在仓库根 `.github/workflows/`，Settings → Pages → Source 选 GitHub Actions，推送即发布**整个 notice 仓库**。
- **其它静态托管**：上传 `deploy-public/` 目录内全部文件即可。

> `deploy-public/` 为纯静态文件（无构建步骤），任意静态托管均可直接托管。
> 公网部署请一律使用 `deploy-public/`，不要把根目录的 `js/data.js`（完整版）发布到公网。
