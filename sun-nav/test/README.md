# Sun Nav · 自动获取站点信息【测试版归档】

**版本：v1.4.0-test.1（TEST）** · 测试构建归档，**功能已转正为正式版 v1.4.0**

> 本目录是「添加标签时只填网址 → 自动补齐名称 / 描述 / Logo」的**测试构建留档**，按项目总规则存放于仓库 `sun-nav/test/`，由 GitHub Pages 发布整个仓库后可直接访问 `sun-nav/test/` 预览。
> **不参与正式版 / Cloudflare Worker 部署**（`[assets]` 只取 `deploy-public/`），与 `sun-nav/` 根目录正式版文件互不覆盖。
> 正式版地址：https://af5216a4a1143e54e.app.workbuddy.host/?sharecode=L6MHTSDGZ2

---

## 一、怎么用

1. 打开测试版在线地址（见交付链接）。
2. 点「+ 添加站点」，**只在「外网链接」填一个网址**（如 `https://www.bilibili.com`，不写协议也能自动补 `https://`）。
3. 点输入框右侧 **「⚡ 自动获取」**。
4. 等待几秒，空白的「名称 / 描述信息 / Logo」会被自动补齐，并高亮标记。
5. **所有字段仍然开放、可任意手动修改**；改动后自动标记消失。已填写的字段**不会被覆盖**。
6. 不满意可清空字段再点一次「自动获取」重新抓取；失败只会提示，不会清空你已填的内容。

## 二、三级降级（方案 3：A + B + C）

| 级别 | 途径 | 生效条件 | 说明 |
| --- | --- | --- | --- |
| **A** | 同源 `GET /api/meta?url=` | 部署在 **Cloudflare Worker** 上 | 服务端抓取目标 HTML，解析 title / description / og:* / link[rel=icon]，最可靠 |
| **B** | 公共元数据 / 代理服务 | 纯静态托管（**GitHub Pages**、静态预览站等） | 并行竞速 microlink / whateverorigin / allorigins / codetabs，首个有效结果胜出 |
| **C** | favicon 多源 `<img>` 探测 | 任何环境 | 图片加载不受 CORS 限制，依次探测站点 `/favicon.ico`、favicon.im、faviconkit、Google s2、DDG icons |

- 优先 A；A 不可用（纯静态托管时`/api/meta` 返回 404 或 HTML）自动降级 B；图标始终用 C 兜底。
- C 是**最稳的一环**：即使 A、B 全失败，通常仍能自动拿到 Logo。
- 走 B 时网址会发送给第三方公共服务，界面有明示；A 只在自己的 Worker 内请求，不外传。

## 三、保留手动填写（设计原则）

- 自动获取**只写空白字段**，`applyMetaToForm()` 逐项检查 `el.value.trim()`，非空即跳过。
- 不锁定任何输入框、不改变数据结构（`title` / `url` / `lanUrl` / `description` / `logo` 原样）。
- 不自动保存、不自动提交表单；填完仍需点「保存」。
- 自动填入项加 `.autofilled` 视觉标记，用户一编辑就移除。

## 四、安全（SSRF 防护，仅 A 级接口）

`/api/meta` 在服务端代用户访问任意 URL，因此内置：

- 仅 `http/https`；拒绝 URL 内嵌账号密码、非 80/443 端口；
- 拒绝 `localhost`、`.local` / `.internal`、10/172.16-31/192.168/169.254/127/100.64 等私网段、云元数据 `169.254.169.254`、IPv6 字面量；
- 手动跟随重定向，**每一跳重新校验**，最多 3 跳；
- 6 秒超时、响应体上限 300KB、仅接受 HTML 类型；
- 返回 `Cache-Control: no-store`。

> 已知边界：DNS rebinding（域名解析到内网 IP）在 Workers 运行时无法彻底校验。若合并进正式版，建议再加域名白名单或出站策略。

## 五、部署方式

### 方式 1：临时账号部署完整 Worker（可体验 A + B + C）

```bash
cd sun-nav-test
npx wrangler@latest deploy --temporary
```

同样基于 Cloudflare 的 Temporary Accounts / Claim 机制，产出 `workers.dev` 临时地址 + Claim 链接，但**带 Worker**，A 级服务端抓取可用，成功率最高。无需账号凭证、不影响正式版 Worker。

### 方式 2：本地预览

```bash
python3 -m http.server 8080 --directory dist
```

纯静态，`/api/meta` 404，走 B + C。

## 六、实测情况与已知限制

| 项目 | 结果 |
| --- | --- |
| 目标站 `/favicon.ico` 直连 | ✅ 可用（如 baidu.com 返回 200） |
| whateverorigin 公共代理 | ✅ 沙箱实测 200 |
| microlink 免费接口 | ⚠️ 沙箱出口 IP 触发 429 日额度限流，用户自有 IP 通常可用 |
| allorigins / codetabs / r.jina.ai | ⚠️ 沙箱实测超时；用户本地网络可能可用 |
| SPA / 反爬 / 登录墙站点 | meta 可能为空或为通用标题，需人工核对 |
| 非 UTF-8（GBK）页面 | 解析可能乱码，截断到 60 / 120 字 |

> 沙箱网络与用户浏览器网络不同，公共服务的可用性以实际浏览器为准；A 级（自建 Worker）不受此影响。

### 本地实测记录（wrangler dev，非推断）

已用 `wrangler dev --local` 起真实 Worker 并逐项请求验证：

| 检查项 | 结果 |
| --- | --- |
| 主页 / 静态资源 / 代码包下载 | HTTP 200，含 `btnAutoMeta` 与 TEST 标识，zip 字节一致 |
| `/api/meta?url=https://www.baidu.com` | 返回中文标题「百度一下，你就知道」+ 完整描述 + favicon 绝对地址 |
| `/api/meta?url=https://www.cloudflare.com` | 返回英文标题 / 描述 / favicon |
| SSRF：127.0.0.1 / 192.168.1.1 / 10.0.0.1:22 / 169.254.169.254 / localhost / file:// | 全部 HTTP 400 拒绝 |
| `/api/data` | HTTP 404，前端正确降级 localStorage |

> 开发中发现并修复一处真实 bug：初版 `extractMeta()` 用混合正则匹配标签，`<meta>` 会跨标签吞掉后面的 `<title>...</title>`，导致标题/描述为空。已改为分别匹配 title 成对标签与 meta/link 单标签，并过滤 `data:,` 空图标。修复后重测通过。

### 测试期部署留痕

- 曾以 `wrangler deploy --temporary` 部署临时 Worker（A+B+C 全可用），属临时账号、**会自动失效，仅作留痕**。
- 转正前曾在正式版预览站挂 `/test/` 子路径供体验，**转正后已移除**；测试版改为归档到本 `sun-nav/test/` 目录。
- 沙箱出口把 `*.workers.dev` DNS 污染到无关 IP，线上地址无法在沙箱内实测 HTTP 200；Worker 逻辑已在本地 `wrangler dev` 完整验证。

## 七、与正式版的关系

| 项目 | 正式版 | 本测试版 |
| --- | --- | --- |
| 目录 | `sun-nav/` | `sun-nav/test/`（仓库内归档） |
| 版本 | v1.4.0（已含本功能） | v1.4.0-test.1 |
| Worker 名 | `sun-nav` | `sun-nav-meta-test` |
| KV / 密码锁 / 定时备份 | 有 | 无（`/api/data` 返回 404，降级本地存储） |
| 数据 | 云端同步 | 浏览器 localStorage，独立互不干扰 |
| GitHub `main` | `sun-nav/` | 归档于 `sun-nav/test/` |

本测试版功能**已转正为正式版 v1.4.0**，改动点已平移至 `sun-nav/` 根目录；正式版 `/api/meta` 已补上与 `/api/data` 一致的 `SITE_PASSWORD` 校验。本目录仅作归档。**纯静态托管无法运行 Worker `/api/meta`，故该部署通道不予保留。**
