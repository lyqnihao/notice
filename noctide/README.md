# 夜潮 NOCTIDE v3.0.0

成人影视聚合站 —— 多源并行聚合、站内零广告、播放时自动剔除片源贴片广告、直链（m3u8）解析。

- 版本：`3.0.0`（build 2026-09-19）
- 形态：纯静态前端（HTML + CSS + 原生 JS，无框架、无构建步骤）
- 依赖：`hls.min.js`（随包附带，无需联网加载 CDN）

---

## 一、目录结构

```
noctide-v3.0.0/
├── index.html        首页（SPA：列表 / 分类 / 搜索 / 收藏 / 历史 都在这一页）
├── app.js            主逻辑：三线并行聚合、去重、过滤、源池扫描、路由
├── style.css         全部样式（含移动端适配）
├── hls.min.js        HLS 播放库
├── favicon.svg       站点图标
├── sources.json      源池（24 个采集源，含片量与通道标记）
├── version.json      版本号（首页页脚自动读取并显示）
├── play.html         旧版独立播放页（保留，站内现走 SPA 播放面板）
├── core.js           旧版播放页逻辑
├── watch.js          旧版播放页播放器逻辑
├── .api-proxy        三条高速通道的上游接口地址（第 1/2/3 行对应 /api/、/api2/、/api3/）
└── README.md         本文件
```

运行时只依赖 `index.html / app.js / style.css / hls.min.js / favicon.svg / sources.json / version.json` 这 7 个文件。

---

## 二、部署

### 1. 放文件

把整包内容丢到站点根目录（以 `/var/www/noctide` 为例）：

```bash
mkdir -p /var/www/noctide
cp -a noctide-v3.0.0/. /var/www/noctide/
```

### 2. 必须配反向代理（关键）

采集源的接口**不返回跨域头**，浏览器直接 `fetch` 会被 CORS 拦掉。所以前端不直连源站，而是请求自己站内的 `/api/`、`/api2/`、`/api3/`，由 nginx 反代到上游。
`.api-proxy` 的第 1/2/3 行就是这三条通道的上游地址。

nginx 示例（把 `example.com` 换成你的域名）：

```nginx
server {
    listen 80;
    server_name example.com;
    root /var/www/noctide;
    index index.html;

    # 单页应用回退
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 通道 1（对应 .api-proxy 第 1 行）
    location /api/ {
        proxy_pass https://lbapi9.com/api.php/provide/vod/;
        proxy_ssl_server_name on;
        proxy_set_header Host lbapi9.com;
        proxy_set_header Accept-Encoding "";
        proxy_connect_timeout 10s;
        proxy_read_timeout 30s;
    }

    # 通道 2（对应 .api-proxy 第 2 行）
    location /api2/ {
        proxy_pass https://slapibf.com/api.php/provide/vod/;
        proxy_ssl_server_name on;
        proxy_set_header Host slapibf.com;
        proxy_set_header Accept-Encoding "";
        proxy_connect_timeout 10s;
        proxy_read_timeout 30s;
    }

    # 通道 3（对应 .api-proxy 第 3 行）
    location /api3/ {
        proxy_pass https://apiyutu.com/api.php/provide/vod/;
        proxy_ssl_server_name on;
        proxy_set_header Host apiyutu.com;
        proxy_set_header Accept-Encoding "";
        proxy_connect_timeout 10s;
        proxy_read_timeout 30s;
    }
}
```

> 注意两点：
> 1. `proxy_pass` 末尾的斜杠和 `location` 末尾的斜杠要**成对**，否则路径会被拼错（例如 `/api/?ac=list` 会变成 `/api.php/provide/vod/?ac=list`，这是正确的）。
> 2. **只反代目录接口，不要反代视频流。** 视频 m3u8 / ts 由浏览器直连源站 CDN 拉取。若用服务器中转视频流，机房 IP 会被上游防盗链挡（403），全站黑屏，且流量费极高。

### 3. HTTPS

建议上证书（Let's Encrypt 即可）。站点本身不涉及混合内容问题，但很多源站 CDN 只对 https 页面友好。

---

## 三、版本号

`version.json` 控制首页页脚显示的版本：

```json
{
  "version": "3.0.0",
  "build": "2026-09-19",
  "codename": "夜潮",
  "notes": ["..."]
}
```

**每次修订的固定动作**：改完代码 → 递增 `version` → 更新 `build` 日期 → 重新打包（包名带版本号）。
前端页面加载时会带时间戳请求 `version.json`，所以改了立刻生效，不用清缓存。

---

## 四、源池（sources.json）

24 个源，字段：

| 字段 | 说明 |
|---|---|
| `id` | 唯一标识 |
| `name` | 展示名 |
| `api` | 目录接口地址 |
| `tags` | 站内展示的标签 |
| `total` | 片量（采集时统计） |
| `note` | 备注 |
| `channel` | `1/2/3` = 走三条高速通道（对应 `/api/` `/api2/` `/api3/`）；`0` = 备用库，走中转通道 |
| `host` | 域名（用于直连测速与降权判断） |

加源：直接在数组里追加一条，`channel` 填 `0`，然后在「更新源」面板里扫描、勾选、应用即可。
想把它升成高速通道，需要在 nginx 加一条反代（`/api4/` …），并在 `app.js` 顶部的 `CFG.apis` 里补上对应路径。

---

## 五、几个实现要点（二次开发必看）

**1. 三线并行聚合**
`CFG.apis` 里的三条通道同时发请求，结果按片名去重后混合排序。某条通道失败自动跳过，不影响其余两条。

**2. 广告过滤（两层）**
- 数据层：源站返回的推广条目（含推广关键词、异站跳转）在渲染前直接拦掉。
- 播放层：拉取 m3u8 播放列表后解析分片，把**不属于正片目录的异目录分段**摘除再交给播放器。实测这类采集站的常见手法是「开头 9 段 + 中插 9 段」共 18 段异目录视频（约 52~54 秒赌博贴片），过滤后直接进正片。
- 播放面板里有「广告过滤：开/关」开关，个别片子被误伤时可关掉恢复原始列表。

**3. 直链解析**
播放页右侧面板显示当前片的 m3u8 地址，「复制」一键带走（PotPlayer / IINA / VLC 可直接播放）；多线路的片支持「复制全部」。

**4. 收藏 / 观看历史 / 进度续播**
全部走 `localStorage`，无后端、无账号体系。换浏览器/清缓存会丢。

**5. 播放兜底**
播放失败时给出「重试 / 换线路 / 用外部播放器打开」三条出口，不留黑屏。

---

## 六、免责

本站只做目录聚合与播放器，不存储、不转码、不分发任何视频文件，播放直连来源站。内容版权归各来源站所有。请遵守所在地法律法规。
