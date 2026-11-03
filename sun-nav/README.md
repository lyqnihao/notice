# Sun Nav 导航页

基于 Sun-Panel 风格逆向实现的**个人网站导航页**。

> **主部署方式：Cloudflare（Worker + KV）** —— 一个域名同时承载前端与 `/api/data` 接口，实现**多端实时同步**、**访问密码锁**、**坚果云每日定时备份**。
> 没有 Cloudflare 后端时自动降级为**纯本地存储**（localStorage），导入/导出/重置照常可用，仅关闭云端同步与备份；但部署在无后端环境（GitHub Pages / 任意静态托管 / 直接打开）时，仍可开启**本地访问密码**（首次打开设置，本机加密保护）。

当前版本：**v1.2.3**

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
  **导出可选格式**（Sun-Panel JSON / 浏览器 HTML 书签），**导入自动识别**本应用 JSON、**Sun-Panel 备份（含 v1.x 与 v2.x，v2 的 url/lanUrl/图标位于 `cardData` 内也能正确提取；可直接上传 `.zip` 压缩包，自动解压读取内部 config.json，无需手动解压）**、Chrome/Edge/Firefox 书签 HTML 三种来源。
- **重置**：清空所有自建/导入数据，**只保留「功能工具」一个分组**（含 IP 监控、日历时钟两个功能卡及其网络检测站点），回到干净的初始状态。
- **云端同步与访问控制（Cloudflare 为主）**：顶部「管理」按钮展开区统一收纳导入/导出/重置、本地密码与同步状态；接入 Cloudflare KV 后多端实时同步（前端经同域 `/api/data` 读写，自动一致）；可设访问密码锁（仿 Sun-Panel，仅密码、本机可记住）；支持坚果云 WebDAV 每日定时备份（详见「部署 → 工作原理」）。无 Cloudflare 后端时自动降级为本地存储，但仍可在「管理 → 本地访问密码」开启**本机密码锁**（SHA-256 哈希存本地，首次打开设置、可跳过、可记住）。
- **字段与 Sun-Panel 统一**：标签的「描述信息」对应 Sun-Panel 的 `description` 字段，导出即 Sun-Panel 兼容格式，可直接平移回 Sun-Panel。
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
├─ worker.js            Cloudflare Worker：/api/data 读写 KV + 密码锁 + 每日定时备份
├─ wrangler.toml        Cloudflare 部署配置（静态资源目录 + KV 绑定 + 定时触发器）
├─ tools/prune-packages.py  代码包留档清理（X/Y 各留 3、Z 留 5）
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

| 版本 | 日期 | 说明 |
| --- | --- | --- |
| v1.0.0 | 2026-10-26 | 首版：主题切换、搜索+多引擎、1×2 卡片右键菜单、分类树、拖拽排序、导入导出重置、IP 连通性/日历时钟固定功能卡；数据迁移自 Sun-Panel 备份（完整 23 组 / 公开 20 组） |
| v1.1.0 | 2026-10-26 | 导出改为 Sun-Panel 兼容格式（可平移回 sun-panel），导入自动识别本应用与 Sun-Panel 两种格式；搜索引擎可自定义增删，页面向下滚动时选项自动收起；卡片与分类右键新增"上移/下移"排序（移动端可用），保留桌面拖拽 |
| v1.1.1 | 2026-10-27 | 导入支持三种模式：覆盖（清空整体替换，带二次确认）/ 合并去重（并入现有，同名同链接自动去重）/ 仅追加（备份作为新分类整体加入，不去重）；同名分类追加时加"（导入）"后缀区分 |
| v1.1.2 | 2026-10-27 | 修复安卓移动端（Via 浏览器）导入导出兼容：导出改为"文件下载 + 剪贴板复制"双通道（未自动下载时内容已入剪贴板，可粘贴保存）；导入移除文件类型过滤，解决文件选择器无文件可选问题 |
| v1.1.3 | 2026-10-27 | 连通性检测站点将"必应"替换为 OpenAI；导出新增"格式选择"弹窗（Sun-Panel JSON / 浏览器 HTML 书签），导入新增自动识别 Chrome/Edge/Firefox 书签 HTML 文件 |
| v1.1.4 | 2026-10-29 | **修复桌面版卡片布局**：分组区块容器与卡片网格拆分；"引擎"按钮移入搜索框同行并改为点击切换；"编辑标签"弹窗新增"所属分组"下拉；"重置"改为只保留「功能工具」一个分组；分类树底部新增版本号行 |
| v1.1.5 | 2026-10-29 | **卡片形态调整**：普通链接卡改为 2:1 横向卡（左 Logo、右名称+描述，描述 2 行）；功能卡改为跨 2 列 × 2 行 |
| v1.1.6 | 2026-10-29 | **卡片再紧凑化**：普通卡取消 2:1 锁高，改为「比 Logo 略高」的小卡（简介压到 1 行），网格最小列宽收窄；手机端固定每行 2 列；功能卡改为跨 2 列 × 4 行 |
| v1.1.7 | 2026-10-29 | **兼容 Sun-Panel v2 备份导入**：`normalizeImport` 同时支持「顶层字段」与「`cardData` 嵌套字段」两种结构 |
| v1.1.8 | 2026-11-03 | **支持直接上传 .zip 备份导入**：内置 JSZip 离线解压后自动定位内部 config.json |
| v1.2.0 | 2026-11-03 | **多端同步与访问控制**：「管理」按钮展开区收纳导入/导出/重置；Cloudflare KV 云端实时同步；可选访问密码锁；坚果云 WebDAV 每日北京时间 09:00 定时备份；变量名大小写兼容；无后端时自动降级本地存储 |
| v1.2.1 | 2026-11-03 | **字段与 Sun-Panel 统一**：标签「介绍」改为「描述信息」，内部字段 `desc` 统一为 `description`（导出即 Sun-Panel 兼容，旧数据自动迁移）；**重构 Cloudflare 部署**：`wrangler.toml` + `worker.js` 移到子目录根，用 `[assets]` 让前端与 `/api/data` 同域一次性部署；新增 GitHub Actions「Cloudflare 自动部署」工作流并修正「Pages」工作流（须放仓库根 `.github/workflows/`）；README 以 Cloudflare 为主重写部署章节 |
| v1.2.2 | 2026-11-03 | **修正部署认知 + 补本地密码锁**：修正两个工作流位置（移出子目录、放到仓库根 `notice/.github/workflows/`）；`deploy-pages.yml` 改为发布**整个 notice 仓库**（`path: '.'`），与"Cloudflare 只部署 sun-nav 子目录"分清；新增**纯前端本地访问密码锁**（无后端环境也能设密码：首次打开可设置/跳过、SHA-256 哈希存本地、可记住密码、管理面板可设置/修改/关闭），解决"非 Cloudflare 部署没有密码入口"的问题 |
| v1.2.3 | 2026-11-03 | **修复 Sun-Panel v2 导入"描述信息"丢失**：导入时对描述字段做**递归多级提取**，兼容 Sun-Panel 各版本把"描述信息"放在顶层 / `cardData` / `cardData.content` / `data` 等任意层级、且字段名可能是 `description`/`desc`/`remark`/`note`/`memo`/`detail`/`describe`/`summary` 的情况；合并/追加导入不再丢描述 |

## 部署

本项目**主推 Cloudflare 部署**（前端 + Worker 同域，开箱即用的多端同步）。同时保留纯静态（GitHub Pages / 任意静态托管）作为无同步的备选。

### 两种 GitHub Actions 工作流（务必分清）

> ⚠️ **工作流文件必须放在仓库根目录** `notice/.github/workflows/`（不能放在 `sun-nav/` 子目录里，否则 GitHub 不会执行）。本仓库已把两个工作流放在仓库根，无需再移动。

| 工作流 | 文件 | 部署目标 | 范围 | Secrets |
| --- | --- | --- | --- | --- |
| **Cloudflare 自动部署** | `deploy-cloudflare.yml` | Cloudflare Worker（前端 + `/api/data` 同域） | 仅 `sun-nav/` 子目录（`working-directory: sun-nav`） | `CF_ACCOUNT_ID`、`CF_API_TOKEN`、`KV_NAMESPACE_ID` |
| **GitHub Pages 发布** | `deploy-pages.yml` | GitHub Pages（纯静态） | **整个 notice 仓库**（`path: '.'`，含 `sun-nav/` 在内的全部内容） | 无需额外 secret（Pages 自带权限） |

- **Cloudflare 工作流**只部署 `sun-nav/` 子目录（前端 + `/api/data` 同域，带同步能力）；**Pages 工作流**把**整个 notice 仓库**发布为静态站点（data 走本地存储，无 KV 同步）。二者互相独立，可按需只启用其中一个。

> **工作流文件在哪 / 为啥下载包里看不到？** 两个 `.yml` 属于**仓库级配置**，位于仓库根 `notice/.github/workflows/`（已就位）。代码包 `sun-nav-vX.Y.Z.zip` 只含 `sun-nav/` 应用目录，因此包里看不到它们——需要查看/下载请直接到仓库的 `.github/workflows/` 目录取（见文末「附件」）。

### 小白一步步部署到 Cloudflare（照做即可，全自动）

> 前置：① 已把 `notice` 仓库推到 GitHub（github.com/lyqnihao/notice）；② 有一个 Cloudflare 账号（免费即可）。

**第 1 步：去 Cloudflare 拿 3 个密钥的值**

| Secret 名称（必须照抄，区分大小写） | 值从哪里来 | 填到哪里（第 2 步） |
| --- | --- | --- |
| `CF_ACCOUNT_ID` | 登录 https://dash.cloudflare.com → 首页**右下角「Account ID」**，点一下复制 | GitHub 仓库 Settings → Secrets and variables → Actions → New repository secret |
| `CF_API_TOKEN` | 右上角头像 → **My Profile** → 左侧 **API Tokens** → **Create Token** → **Create Custom Token**：权限加 `Account → Workers Scripts → Edit` 和 `Account → Workers KV Storage → Edit`，其余默认 → 生成后**只显示一次，立刻复制** | 同上 |
| `KV_NAMESPACE_ID` | 控制台左侧 **Workers & Pages** → 顶部 **KV**（或 Storage → KV）→ **Create a namespace**（命名随便，如 `sun-nav-data`）→ 建好后列表里那串十六进制 ID 即值 | 同上 |

> 不会命令行也能完成上面全部操作；`CF_API_TOKEN` 的权限务必选 **Edit**（不是 Read），否则部署会报 403。

**第 2 步：把 3 个密钥填进 GitHub（仓库级 Secrets）**

1. 打开 https://github.com/lyqnihao/notice → 顶部 **Settings**（设置）。
2. 左侧 **Secrets and variables**（密钥与变量）→ **Actions**。
3. 点 **New repository secret**，逐个添加：
   - Name：`CF_ACCOUNT_ID`　Secret：第 1 步的 Account ID → **Add secret**
   - Name：`CF_API_TOKEN`　Secret：第 1 步的令牌 → **Add secret**
   - Name：`KV_NAMESPACE_ID`　Secret：第 1 步的 KV ID → **Add secret**
4. 列表里出现这三项即完成。

**第 3 步：触发部署**

1. 回仓库 → 顶部 **Actions** 标签页 → 左侧看到工作流 **Deploy Sun Nav to Cloudflare**。
2. 点进去 → 右侧 **Run workflow**（选分支 `main`/`master`）→ **Run**。
3. 约 1–2 分钟后变 ✅ 即成功。之后你每次 `git push` 改动 `sun-nav/` 下文件，它会**自动重新部署**。

**第 4 步（可选）：设置访问密码 / 坚果云定时备份**

这些不在 GitHub Secrets，部署后在 Cloudflare 的 Worker 里设：

- 控制台 → **Workers & Pages** → 找到 Worker **`sun-nav-sync`** → **Settings** → **Variables & Secrets** → **Add**：
  - `SITE_PASSWORD`（选 **Secret**）：设个密码，之后打开导航要先输入。
  - `WEBDAV_USER`（Secret）：坚果云账号。
  - `WEBDAV_PASS`（Secret）：坚果云**授权码**（设置 → 安全 → 第三方应用授权，*不是登录密码*）。
- 加完到 Actions 再 **Run workflow** 一次使其生效。

**访问地址**

- 默认：`https://sun-nav-sync.<你的 workers.dev 子域>.workers.dev`（子域在 Workers & Pages → 你的账号 → 右侧 `workers.dev` 里设置一次）。
- 若绑定自有域名，直接用你的域名。

### 方式一：GitHub Actions 自动部署到 Cloudflare（技术细节）


1. **准备 Cloudflare**
   - 登录 Cloudflare，记下 **Account ID**（Dashboard 右侧）。
   - 创建一个 **KV 命名空间**（Workers & Pages → KV → Create），记下它的**命名空间 ID**。
2. **确认工作流位置**：本仓库已把 `deploy-cloudflare.yml` 直接放在仓库根 `notice/.github/workflows/`（GitHub 只认这个位置），无需移动。
3. **添加仓库 Secrets**（`notice` 仓库 → Settings → Secrets and variables → Actions → New repository secret）：
   - `CF_ACCOUNT_ID`：上面的 Account ID。
   - `CF_API_TOKEN`：Cloudflare API Token（权限：`Account` → `Workers Scripts` → Edit，并把 Account/Zone 资源范围限制到实际部署账号）。
   - `KV_NAMESPACE_ID`：上面建的 KV 命名空间 ID（CI 会自动写进 `wrangler.toml` 的占位符处）。
4. **触发部署**：推送 `main`/`master`（且 `sun-nav/**` 有改动）即自动运行；或到 Actions 页面手动 `Run workflow`。CI 会执行 `npx wrangler deploy`，前端与 `/api/data` 同域上线。
5. **设置运行时变量/密钥**（部署后）：Worker 上线后，到 Cloudflare 该 Worker 的 **Settings → Variables & Secrets → Add** 添加（详见下方「Worker 变量与密钥」）。其中 `SITE_PASSWORD` / `WEBDAV_USER` / `WEBDAV_PASS` 选 **Secret** 类型；之后重新部署一次使其生效。

### 方式二：命令行手动部署（wrangler）

```bash
cd sun-nav
npx wrangler login                       # 浏览器授权 Cloudflare
npx wrangler kv namespace create sun-nav-data   # 创建 KV，把返回 id 填进 wrangler.toml 的 kv_namespaces.id
npx wrangler secret put SITE_PASSWORD    # 可选：访问密码锁
npx wrangler secret put WEBDAV_USER      # 坚果云账号
npx wrangler secret put WEBDAV_PASS      # 坚果云授权码（非登录密码）
npx wrangler deploy                     # 部署（前端 + /api/data 同域）
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

### 工作原理（Cloudflare 部署）

- **同域一体化**：`wrangler.toml` 用 `[assets] directory = "deploy-public"` 把前端作为静态资源托管，同时 `worker.js` 处理未命中静态文件的请求（如 `/api/data`），因此前端与接口**同源同域**，无需任何跨域配置。
- **实时同步**：前端通过同域相对路径 `/api/data` 读写 KV（GET 拉取、PUT 保存），多端共用同一命名空间即自动同步。
- **访问密码锁（Cloudflare）**：设置 `SITE_PASSWORD` 后，打开页面需输入密码（仿 Sun-Panel，仅密码、无用户名）；勾选「记住密码」可本机免输。未设置则不锁。
- **定时备份**：Cloudflare Cron（`0 1 * * *` UTC = 北京时间 09:00）触发 Worker，把 KV 当前数据以 `sun-nav-YYYYMMDDHHMMSS.json` 写入坚果云 WebDAV，**只新增、不删除旧备份**（旧备份自行清理）。
- **降级说明（无 Cloudflare 后端 / 纯静态托管）**：前端自动降级为浏览器本地存储，不启用 Cloudflare 密码锁、不备份；导入/导出/重置照常可用。

### 本地访问密码锁（无后端环境也受保护）

Cloudflare 的 `SITE_PASSWORD` 由后端校验，只在部署到 Cloudflare 时生效。若你把站点部署到 **GitHub Pages / 任意静态托管 / 直接打开 `index.html`**（这些环境没有 `/api/data` 后端），可改用**纯前端本地密码锁**：

- **首次打开**：若尚未设置密码，会弹出"设置访问密码"界面，输入两次（≥4 位）即启用；也可点「暂不设置」跳过（之后随时可在管理面板开启）。
- **之后打开**：弹出"输入访问密码"，密码以 **SHA-256 哈希**形式存于本机 localStorage（不落明文），校验通过才显示导航；勾选「记住密码」可本机免输。
- **管理面板操作**：顶部「管理」→「本地访问密码」可**设置/修改**（已设置过则不允许跳过，只能改或取消）或**关闭**（清除本地密码）。
- **注意**：本地密码仅保护"本机浏览器"的查看，无法阻止他人直接读取 localStorage 数据——它是一道**本地 deterrent（防随手翻看）**，不是服务端强鉴权；需要真正的多端统一强鉴权请用 Cloudflare 部署。

## 部署约定（维护习惯）

每次修订后固定执行以下三步，缺一不可：

1. **同步部署**：重新发布到原分享链接（同一链接、内容覆盖），便于直接查看效果。
2. **提供代码包**：打包 `sun-nav-vX.Y.Z.zip`（带版本号），**并复制一份到 `deploy-public/`**，使其随站点一起上线，可通过 `https://<站点>/sun-nav-vX.Y.Z.zip` 直接下载。
   > 本地工作区路径在部分客户端上无法下载，故代码包必须同时提供线上下载链接。
3. **代码包留档**：旧版本包**不删除、按策略保留**，见下方「代码包留档策略」。
4. **同步到 GitHub / Cloudflare**：取得授权后，同一版本同步部署到这些服务，保持各处版本一致。

其他注意事项：

- 部署前确认 `deploy-public/` 与根目录的 `index.html` / `css/style.css` / `js/app.js` 内容一致（差异应仅在 `js/data.js` 的公开版分类，以及 `deploy-public/` 内多出的代码包）。
- 打包时用 `-x "*.zip"` 排除，避免代码包把自身打进去。
- 升级版本号时同步修改：`js/app.js` 的 `APP_VERSION`、各文件头部注释、`README.md` 当前版本与版本记录表。

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

- **当前公开地址（可直接访问）**：https://af5216a4a1143e54e.app.workbuddy.host/?sharecode=L6MHTSDGZ2

当前线上代码包存档：

| 版本 | 下载链接 |
| --- | --- |
| v1.2.3（最新） | https://af5216a4a1143e54e.app.workbuddy.host/sun-nav-v1.2.3.zip?sharecode=L6MHTSDGZ2 |
| v1.2.2 | https://af5216a4a1143e54e.app.workbuddy.host/sun-nav-v1.2.2.zip?sharecode=L6MHTSDGZ2 |
| v1.2.1 | https://af5216a4a1143e54e.app.workbuddy.host/sun-nav-v1.2.1.zip?sharecode=L6MHTSDGZ2 |
| v1.2.0 | https://af5216a4a1143e54e.app.workbuddy.host/sun-nav-v1.2.0.zip?sharecode=L6MHTSDGZ2 |
| v1.1.8 | https://af5216a4a1143e54e.app.workbuddy.host/sun-nav-v1.1.8.zip?sharecode=L6MHTSDGZ2 |
| v1.1.7 | https://af5216a4a1143e54e.app.workbuddy.host/sun-nav-v1.1.7.zip?sharecode=L6MHTSDGZ2 |
| v1.1.6 | https://af5216a4a1143e54e.app.workbuddy.host/sun-nav-v1.1.6.zip?sharecode=L6MHTSDGZ2 |
| v1.1.5 | https://af5216a4a1143e54e.app.workbuddy.host/sun-nav-v1.1.5.zip?sharecode=L6MHTSDGZ2 |

> 存档自 **v1.1.5** 起开始保留；更早版本未留存源码快照，无法补建。每次发版后本表会追加新版本链接，被策略淘汰的版本同步移除。

- **Cloudflare（主部署）**：按上方「部署」章节用 `wrangler deploy` 或 GitHub Actions 自动部署（前端 + `/api/data` 同域）。
- **GitHub Pages**：`deploy-pages.yml` 已在仓库根 `.github/workflows/`，Settings → Pages → Source 选 GitHub Actions，推送即发布**整个 notice 仓库**。访问地址形如 `https://lyqnihao.github.io/notice/sun-nav/`（把 `lyqnihao` 换成你的 GitHub 用户名）。此模式无云端同步，数据存本地；可在「管理」面板开启本地密码锁。
- **其它静态托管**：上传 `deploy-public/` 目录内全部文件即可。

> `deploy-public/` 为纯静态文件（无构建步骤），任意静态托管均可直接托管。
> 公网部署请一律使用 `deploy-public/`，不要把根目录的 `js/data.js`（完整版）发布到公网。

### 附件：可直接下载的关键配置文件

以下文件属于**仓库级配置**（不在 `sun-nav-vX.Y.Z.zip` 应用包内），都在 `notice` 仓库里，可直接在 GitHub 网页端查看/下载：

| 文件 | 位置 | 作用 |
| --- | --- | --- |
| `deploy-cloudflare.yml` | `notice/.github/workflows/` | 自动部署 `sun-nav/` 到 Cloudflare（需 3 个 repo secret） |
| `deploy-pages.yml` | `notice/.github/workflows/` | 自动发布整个 notice 仓库到 GitHub Pages |
| `wrangler.toml` | `notice/sun-nav/` | Cloudflare 部署配置（静态资源目录 + KV 绑定 + 每日 09:00 备份触发器） |
| `worker.js` | `notice/sun-nav/` | Cloudflare Worker 源码（`/api/data` 读写 KV + 密码锁 + 定时备份） |
