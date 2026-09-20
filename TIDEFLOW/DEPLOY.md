# 部署信息

- 应用名：潮汐TIDEFLOW
- app_id：`app_17eckqrc16z`
- 线上地址（固定，复发不变）：https://4m2y5f3566jsm.aiforce.cloud/app/app_17eckqrc16z
- 镜像站 app_id：`app_17egtdkh958`（备用地址，内容与主站同步）
- 镜像站地址：https://4m2y5f3566jsm.aiforce.cloud/app/app_17egtdkh958

## 兼容 Cloudflare / GitHub Pages（纯静态站）

本站是**纯静态前端**（HTML/CSS/JS，无后端、无构建），所有资源引用和页面跳转都是相对路径，分类搜索用 `#q=` hash 路由 —— 因此可以原样部署到任意静态托管，**无需改动任何代码**：

### Cloudflare Pages（或 Cloudflare Drop）
1. 打开 https://dash.cloudflare.com 或 https://www.cloudflare.com/drop/
2. 把 `tideflow/` 目录（或代码包解压后的文件夹）拖进 Drop，或连 Git 仓库一键导入
3. 部署即得 `https://<项目名>.pages.dev` 固定地址；后续改代码推到仓库 / 重新拖包即自动更新

### GitHub Pages
1. 把 `tideflow/` 目录内容推到仓库根目录（或 `/docs` 目录，在 Settings → Pages 里选分支+目录）
2. 项目页地址为 `https://<用户名>.github.io/<仓库名>/`，个人页为 `https://<用户名>.github.io/`
3. 相对路径已保证子路径部署也能正常工作（图片/JS/页面跳转全部按相对路径解析）

### 版本号
每次修订只需同步三处版本号：`js/config.js` 的 `version`、`index.html` 与 `player.html` 的 `?v=` 参数（用于强刷缓存）。

## 重新部署（lark-cli，当前主链路）

```bash
cd /home/user/Doubao/chats/38442521609353474
lark-cli apps +deploy --dir ./tideflow --app-id app_17eckqrc16z
# 拿到 release_id 后轮询：
lark-cli apps +release-get --app-id app_17eckqrc16z --release-id <release_id>
# 直到 status=finished，online_url 不变
```

## 首次部署记录

- 2026-09-19 首发：22 个文件 / 522KB，status=finished
- 线上验证：首页 27 卡（NASA 18 + W3C 3 + TestVideos 6）、封面 27/27、NASA 影片直链解析并真实播放（readyState=3, 155s）

## 2026-09-19 第二次部署：接入 LunaTV 影视聚合

- 自动拉取 https://raw.githubusercontent.com/hafrey1/LunaTV-config/main/LunaTV-config.json（69 个采集站，自动更新）
- 经中转 https://pz.v88.qzz.io/?url= 访问苹果 CMS V10 接口；启动时自动探活，挑直链可播的子站
- 过滤 🔞 成人站；播放页支持选集切换；主播放列表不做广告剔除
- 线上验证：首页 114 卡（LunaTV 90）、剧集多集 m3u8 真实播放、搜索「斗罗大陆」→54 条
- 注意：个别采集站 CDN 在某些网络不可达（环境相关），换一部片即可
