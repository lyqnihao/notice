#!/usr/bin/env python3
import html
import json
import os
import re
import sys
from urllib.parse import parse_qs, unquote, urlparse

import requests

BASE_URL = "https://naixxzy.com"
API_URL = BASE_URL + "/api.php/provide/vod/"

session = requests.Session()
session.headers.update({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
})

HTTP_URL_RE = re.compile(r'https?://[^\s<>"\']+|//[^\s<>"\']+|www\.[^\s<>"\']+')
MEDIA_HINTS = (".m3u8", ".mp4", ".m4v", ".mov", ".webm", ".flv", ".avi", ".mkv")

def normalize_url(url):
    if not url:
        return ""
    value = str(url).strip()
    value = value.replace("\\/", "/").replace("&amp;", "&")
    value = value.strip(" '\"\t\r\n")
    if value.startswith("//"):
        value = "https:" + value
    elif value.startswith("/"):
        value = BASE_URL.rstrip("/") + value
    elif value.startswith("www."):
        value = "https://" + value
    return value

def split_candidate_urls(text):
    if not text:
        return []
    matches = HTTP_URL_RE.findall(text)
    if matches:
        return matches
    compact = text.strip()
    if compact.startswith("/"):
        return [compact]
    if " " not in compact and "\n" not in compact and "/" in compact:
        return [compact]
    return []

def score_play_url(url):
    lower = url.lower()
    score = 0
    if lower.startswith("https://"):
        score += 40
    elif lower.startswith("http://"):
        score += 30
    if ".m3u8" in lower:
        score += 500
    elif any(ext in lower for ext in (".mp4", ".m4v", ".mov", ".webm")):
        score += 450
    elif any(ext in lower for ext in (".flv", ".avi", ".mkv")):
        score += 350
    if "m3u8" in lower:
        score += 60
    if "index" in lower:
        score += 10
    if "?url=" in lower or "jiexi" in lower or "parser" in lower:
        score -= 80
    if "player/" in lower and not any(ext in lower for ext in MEDIA_HINTS):
        score -= 40
    return score

def extract_nested_media_url(url):
    try:
        parsed = urlparse(url)
        query = parse_qs(parsed.query)
    except Exception:
        return ""
    for key in ("url", "vid", "play", "source"):
        for value in query.get(key, []):
            nested = normalize_url(unquote(value))
            if nested.startswith("http") and nested != url:
                return nested
    return ""

def extract_play_urls(play_url_raw):
    if not play_url_raw:
        return []
    raw = str(play_url_raw).strip()
    groups = [part.strip() for part in raw.split("$$$") if part.strip()] or [raw]
    urls = []
    seen = set()
    for group in groups:
        episodes = [part.strip() for part in group.split("#") if part.strip()] or [group]
        for episode in episodes:
            candidates = episode.split("$")[1:] if "$" in episode else [episode]
            for candidate in candidates:
                for url in split_candidate_urls(candidate):
                    final_url = normalize_url(url)
                    nested_url = extract_nested_media_url(final_url)
                    for picked_url in (nested_url, final_url):
                        if not picked_url or picked_url in seen:
                            continue
                        seen.add(picked_url)
                        urls.append(picked_url)
    urls.sort(key=score_play_url, reverse=True)
    return urls

def get_config():
    try:
        resp = session.get(API_URL, params={"ids": "recommend"}, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        tabs = []
        for item in data.get("class", []):
            type_name = item.get("type_name", "")
            if "精" in type_name:
                continue
            tabs.append({
                "name": type_name,
                "id": str(item.get("type_id", ""))
            })
        if tabs:
            return tabs
    except Exception:
        pass
    return [
        {"name": "电影", "id": "1"},
        {"name": "电视剧", "id": "2"},
        {"name": "动漫", "id": "3"}
    ]

def get_videos(tid=None, page=1, keyword=""):
    params = {"ac": "videolist", "pg": page}
    if keyword:
        params["wd"] = keyword
    elif tid:
        params["t"] = tid
    else:
        return []
    try:
        resp = session.get(API_URL, params=params, timeout=10)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        print(f"请求失败: {e}")
        return []
    videos = []
    for item in data.get("list", []):
        raw_play = item.get("vod_play_url", "") or ""
        play_urls = extract_play_urls(raw_play)
        pic = item.get("vod_pic", "") or ""
        if "?" in pic:
            pic = pic.split("?", 1)[0]
        videos.append({
            "title": item.get("vod_name", "无标题"),
            "img": normalize_url(pic),
            "url": play_urls[0] if play_urls else "",
            "play_urls": play_urls,
            "duration": item.get("vod_duration", "") or "",
            "raw_url": raw_play
        })
    return videos

def clear_screen():
    os.system('cls' if os.name == 'nt' else 'clear')

def print_header(title):
    print("=" * 40)
    print(f"{title:^40}")
    print("=" * 40)

def print_tabs(tabs):
    print("分类列表：")
    for i, tab in enumerate(tabs):
        print(f"  {i+1}. {tab['name']}")
    print("  0. 搜索")
    print("  q. 退出")

def print_videos(videos, page):
    if not videos:
        print("暂无数据。")
        return
    print(f"\n第 {page} 页，共 {len(videos)} 条")
    print("-" * 40)
    for idx, v in enumerate(videos, 1):
        duration = f"[{v['duration']}]" if v['duration'] else ""
        print(f"{idx:2}. {v['title']} {duration}")
    print("-" * 40)
    print("操作：输入序号播放，n下一页，p上一页，s搜索，b返回主菜单，q退出")

def print_video_link(video):
    urls = video.get("play_urls", [])
    if not urls:
        print("没有解析到播放地址。")
        if video.get("raw_url"):
            print(f"原始数据: {video['raw_url'][:200]}")
        return
    if len(urls) == 1:
        print(f"播放链接: {urls[0]}")
    else:
        print("检测到多个播放地址：")
        for i, u in enumerate(urls, 1):
            print(f"  {i}. {u}")
        choice = input("请选择序号 (默认1): ").strip()
        try:
            idx = int(choice) - 1 if choice else 0
            print(f"播放链接: {urls[idx]}")
        except:
            print(f"播放链接: {urls[0]}")

def search_videos():
    keyword = input("请输入搜索关键词: ").strip()
    if not keyword:
        return
    page = 1
    while True:
        videos = get_videos(keyword=keyword, page=page)
        if not videos and page == 1:
            print("未找到相关视频。")
            break
        clear_screen()
        print_header(f"搜索: {keyword}")
        print_videos(videos, page)
        action = input("\n请输入操作: ").strip().lower()
        if action == 'n':
            page += 1
        elif action == 'p' and page > 1:
            page -= 1
        elif action == 'b':
            break
        elif action == 'q':
            sys.exit(0)
        elif action.isdigit():
            idx = int(action) - 1
            if 0 <= idx < len(videos):
                print_video_link(videos[idx])
                input("\n按回车继续...")
            else:
                print("序号无效")
        else:
            break

def browse_category(tab_id, tab_name):
    page = 1
    while True:
        videos = get_videos(tid=tab_id, page=page)
        if not videos and page == 1:
            print("该分类暂无视频。")
            break
        clear_screen()
        print_header(f"{tab_name} - 第{page}页")
        print_videos(videos, page)
        action = input("\n请输入操作: ").strip().lower()
        if action == 'n':
            page += 1
        elif action == 'p' and page > 1:
            page -= 1
        elif action == 's':
            search_videos()
            break
        elif action == 'b':
            break
        elif action == 'q':
            sys.exit(0)
        elif action.isdigit():
            idx = int(action) - 1
            if 0 <= idx < len(videos):
                print_video_link(videos[idx])
                input("\n按回车继续...")
            else:
                print("序号无效")
        else:
            print("无效输入")

def main():
    clear_screen()
    print_header("影视播放命令行版")
    tabs = get_config()
    if not tabs:
        print("无法获取分类，请检查网络。")
        return
    while True:
        clear_screen()
        print_header("主菜单")
        print_tabs(tabs)
        choice = input("\n请选择: ").strip().lower()
        if choice == 'q':
            print("再见！")
            break
        elif choice == '0':
            search_videos()
        elif choice.isdigit():
            idx = int(choice) - 1
            if 0 <= idx < len(tabs):
                browse_category(tabs[idx]['id'], tabs[idx]['name'])
            else:
                print("无效选项")
        else:
            print("无效输入")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n已退出")
        sys.exit(0)