# 部署信息

- 应用名：潮汐TIDEFLOW
- app_id：`app_17eckqrc16z`
- 线上地址（固定，复发不变）：https://4m2y5f3566jsm.aiforce.cloud/app/app_17eckqrc16z

## 重新部署（改完代码后）

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
