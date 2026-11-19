# 夜潮 NOCTIDE v3.2.0

纯静态前端影视目录与播放器。v3.2.0 在 v3.1.0 完整功能基础上，重排播放页布局、新增播放器进度条、M3U8 广告过滤、片头片尾跳过、请求中继、多格式订阅与资源检测增强。保留原有首页/搜索/分类/筛选/收藏/历史/线路切换/自动下一集/播放记录全部功能。

## 部署

将本目录内文件上传到任意静态站点目录即可，使用相对路径，可部署在 GitHub Pages 子目录（例如 `/yechao/`）。无需构建、数据库、Worker 或服务器端代码。

解压 `noctide-v3.2.0.zip` 后，完整覆盖原 `notice/yechao/` 目录即可。

### 运行时文件

| 文件 | 说明 |
| --- | --- |
| `index.html` | 页面入口（暗色风格 + 青绿强调色） |
| `app.js` | 首页、搜索、分类、收藏、历史、播放、进度条、过滤、片头片尾 |
| `source-manager.js` | 资源站/订阅管理、检测、请求模式 |
| `signal-core.js` | 核心纯逻辑（时间/Base58/M3U8过滤/订阅解析/增量更新/请求模式） |
| `style.css` | 全部样式（含方案B布局与响应式） |
| `hls.min.js` | 本地 HLS 播放库，不依赖第三方 CDN |
| `sources.json` | 首次启动时导入的默认线路清单 |
| `favicon.svg`、`version.json` | 图标与版本信息 |
| `tests/` | Node 与浏览器自动化测试脚本（可删，不影响运行） |

> 数据全部保存在浏览器 `localStorage`，键名沿用 `nc_sources_v1` / `nc_subscriptions_v1` / `nc_active_source_v1`，并新增 `nc_config_v1`（请求设置）、`nc_selection_v1`（勾选状态）、`nc_player_pref_v1`（播放设置）。旧版数据会自动迁移，迁移失败不会丢失原资源。

## v3.2.0 更新日志

### 首页
- 所有视频卡片统一宽度与 2:3 封面比例，统一 `object-fit:cover` 裁切，图片不变形。
- 标题最多两行，超出省略，标题区域高度统一；评分/年份/类型/热度统一排列。
- 桌面、平板、手机响应式适配；搜索、分类、筛选、跳转全部保留。

### 播放页（方案 B）
- 顺序：播放器 → 播放线路 → 选集 → 影片详情 → 演员/导演/分类/标签 → 相关推荐。
- 演员、导演支持点击站内搜索；分类与标签可点击；保留暗色风格与青绿强调色。
- 保留线路切换、选集切换、自动下一集、播放记录；新增结尾预热下一集（预加载）。

### 播放器进度条（参考 TIDEFLOW）
- 播放器下方常驻进度条，显示当前时间与总时长，`HH:MM:SS` 统一格式。
- `timeupdate` 实时刷新，`loadedmetadata`/`durationchange` 更新时长，支持拖动跳转与手机触摸。
- 未知时长显示 `LIVE` 并禁用普通 seek。进度保存、续播、自动下一集不受影响。

### M3U8 广告过滤（复用 TIDEFLOW `stripForeignSegments`）
- 基于分片目录分布的启发式过滤：主目录占比 ≥60% 才启用，样本过少/分布不明显/会把正片删空时自动回退。
- 正确保留 `EXTINF` / `EXT-X-DISCONTINUITY` 等标签，处理查询参数与相对/绝对地址；master 列表自动跟随子码率。
- 默认开启，显示过滤片段数，可下载过滤后 M3U8；切换线路/剧集/预加载时重新过滤，关闭可恢复原始列表。
- 注意：这是基于目录分布的启发式，不是通用广告识别；MP4 直链不适用；跨域无法读取时需配合 relay；不承诺清除所有广告。

### MP4 片头片尾跳过
- 片头跳过秒数、片尾预留秒数、两个独立开关，默认均 0 秒且关闭。
- 片头仅在开头跳一次，用户手动拖动后不再误触发；片尾到达阈值配合自动下一集或正常结束。

### 资源管理
- 修复“检测全部”只检测勾选项的问题：现遍历所有资源（含禁用/未勾选）。
- 新增全选、反选、检测选中；勾选（批量操作）与启用（是否采集）彻底分离，禁用资源仍可手动检测。
- 检测结果分类：正常/请求超时/HTTP 错误/跨域网络失败/响应格式错误/中继不可用；显示进度与统计；并发上限 4。

### 请求模式与跨域
- 可配置：纯直连、优先 relay、直连失败后自动 relay（默认）；超时可控，relay 地址自定义。
- 候选公共中继 `https://pz.v88.qzz.io/?url=` 已实测可用，但默认留空（隐私/日志/安全风险），仅发送目标 URL，请填自己的 Cloudflare Worker 更稳妥。

### 订阅系统
- 全面兼容：JSON 数组、`sites`/`sources`/`list`/`data` 数组、LunaTV/MoonTV `api_site` 对象、OmniBox `sites`（保留 id/key/name/api/isActive/remark/tags/priority/proxyMode/customProxy）、Base58 编码配置、Noctide 自身导出格式。
- 字段兼容 name/title/key/siteName、api/url/apiUrl/baseUrl、remark/description/detail、enabled/isActive/active、tags/tag；`type` 不再一律当作 CMS 类型。
- 增量更新：新增/更新/删除已移除旧源；不删手动资源、不删其他订阅资源、失败或空数组保留旧资源；基于稳定 ID 或规范化 API URL 去重。
- 错误分类：网络失败/超时/HTTP/CORS/HTML 登录页/JSON 错误/不支持格式/无有效 CMS API；TVBox 播放配置明确拒绝，不误导入。

## 苹果 CMS V10 请求参数

- 分类：`?ac=list`
- 视频列表：`?ac=videolist&pg=1&pagesize=24`
- 搜索：`?ac=videolist&wd=关键词`
- 详情：`?ac=detail&ids=视频ID`

## 关于跨域（CORS）

浏览器直连资源站时，源站必须允许跨域访问，否则会被拦截。v3.2.0 的 relay 模式可缓解部分场景，但公共代理有隐私风险，且并非所有源站都适用；`no-cors` 无法读取 JSON，不作为解决方案。

## 测试

- `tests/test-core.js`：核心纯逻辑 38 项（Node）。
- `tests/test-browser.py`：浏览器集成 29 项（需 Playwright + 本地服务）。
- `tests/test-subscription-ui.py`：订阅系统 UI 10 项。

运行方式见各脚本头部注释。测试结果汇总于交付说明。

## 版本

- 版本：`3.2.0`
- 构建日期：`2026-11-20`
