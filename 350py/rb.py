#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# 从 Rakuten Rチャンネル 抓取频道列表，生成 m3u8 播放列表

import json
import urllib.request
import urllib.parse
import ssl

# ===== 配置 =====
API_URL = "https://backendapi.channel.rakuten.co.jp/platform/content/now-playing?platform=WEB"
OUTPUT_FILE = "rakuten_rchannel.m3u"

# 日本 IP 才需要（如果你在日本，不需要代理）
# 如果你需要走代理，在这里设置（比如 http://127.0.0.1:7897）
PROXY = None
# PROXY = "http://127.0.0.1:7897"

# ===== 请求头 =====
HEADERS = {
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) "
                  "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "ja,en;q=0.9",
    "Origin": "https://channel.rakuten.co.jp",
    "Referer": "https://channel.rakuten.co.jp/",
}


def fetch_channels():
    """抓取频道列表"""
    req = urllib.request.Request(API_URL, headers=HEADERS)

    # 处理代理
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    if PROXY:
        handler = urllib.request.ProxyHandler({
            "http": PROXY,
            "https": PROXY,
        })
        opener = urllib.request.build_opener(
            handler,
            urllib.request.HTTPSHandler(context=ctx)
        )
    else:
        opener = urllib.request.build_opener(
            urllib.request.HTTPSHandler(context=ctx)
        )

    with opener.open(req, timeout=30) as resp:
        data = resp.read()
        return json.loads(data.decode("utf-8"))


def generate_m3u(channels):
    """生成 m3u8 播放列表"""
    lines = ["#EXTM3U"]

    ok_count = 0
    drm_count = 0
    skip_count = 0

    for ch in channels:
        ch_id = ch.get("id")
        title = ch.get("title", "").strip()
        manifest = ch.get("manifestUrl", "").strip()
        logo = ch.get("thumbnailUrl", "").strip()
        genre = ch.get("genreName", "").strip()
        rating = ch.get("rating", "").strip()
        drm = ch.get("drm")

        # 跳过无效
        if not manifest or manifest == "https://dummy.m3u8":
            skip_count += 1
            print("跳过（无地址）: [%s] %s" % (ch_id, title))
            continue

        # 跳过 DRM
        if drm:
            drm_count += 1
            print("跳过（DRM）: [%s] %s" % (ch_id, title))
            continue

        # 频道名：带分类和年龄标记
        display_name = title
        if genre:
            display_name += " (%s)" % genre
        if rating and rating != "G":
            display_name += " [%s]" % rating

        # 写入 m3u
        lines.append('#EXTINF:-1 tvg-id="rakuten_%s" tvg-logo="%s" group-title="%s",%s' % (
            ch_id, logo, genre or "其他", display_name
        ))
        lines.append(manifest)
        ok_count += 1

    return lines, ok_count, drm_count, skip_count


def main():
    print("正在抓取频道列表...")
    print("API: %s" % API_URL)

    try:
        data = fetch_channels()
    except Exception as e:
        print("抓取失败: %s" % e)
        print("提示：如果你不在日本，需要设置 PROXY 走日本节点")
        return

    channels = data.get("data", [])
    print("获取到 %d 个频道" % len(channels))

    lines, ok, drm, skip = generate_m3u(channels)

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")

    print("")
    print("=" * 50)
    print("生成完成: %s" % OUTPUT_FILE)
    print("可播放: %d 个" % ok)
    print("DRM 跳过: %d 个" % drm)
    print("无地址跳过: %d 个" % skip)
    print("=" * 50)


if __name__ == "__main__":
    main()