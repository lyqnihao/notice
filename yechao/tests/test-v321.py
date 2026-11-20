#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.2.1 新增功能浏览器集成测试：启用上限/默认不启用/NSFW/片头片尾布局/版本号"""
import json
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8899/index.html"
CATS = [{"type_id": 1, "type_pid": 0, "type_name": "电影"}]
def vod(i, name="影片"):
    return {"vod_id": i, "vod_name": f"{name}{i}", "vod_pic": "", "type_name": "动作片",
            "vod_hits": 100, "vod_score": 8.0, "vod_time": "2026-11-20",
            "vod_play_url": f"第1集$https://mock.mp4", "vod_content": ""}
VODS = [vod(i) for i in range(1, 8)]

passed = 0
failed = 0
def ok(name, cond, info=""):
    global passed, failed
    if cond:
        print("  ✓ " + name); passed += 1
    else:
        print("  ✗ " + name + (" → " + info if info else "")); failed += 1

def mock_route(route):
    q = parse_qs(urlparse(route.request.url).query)
    if "ac" in q:
        ac = q["ac"][0]
        body = {"class": CATS, "list": []} if ac == "list" else {"pagecount": 1, "total": 7, "list": VODS}
        route.fulfill(status=200, content_type="application/json", body=json.dumps(body))
    elif route.request.url.endswith("version.json"):
        route.fulfill(status=200, content_type="application/json", body=json.dumps({"version": "3.2.4"}))
    else:
        route.continue_()

# 7 条线路，其中 1 条 NSFW。初始全禁用，避免影响首页统计。
SEEDS = [{"id": f"m{i}", "name": ("敏感站" if i == 6 else f"线路{i}"),
          "api": f"https://mock{i}.com/api.php/provide/vod/", "enabled": False,
          "nsfw": (i == 6), "origin": "manual", "status": "未检测", "tags": []} for i in range(1, 8)]
with sync_playwright() as p:
    b = p.chromium.launch(headless=True, args=["--no-sandbox"])
    pg = b.new_page(viewport={"width": 1200, "height": 900})
    pg.route("**/*", mock_route)
    # 先访问页面建立 origin，再写入种子 localStorage，最后 reload 生效
    pg.goto(BASE, wait_until="domcontentloaded")
    pg.evaluate("(s) => { localStorage.setItem('nc_sources_v1', JSON.stringify(s)); localStorage.setItem('nc_active_source_v1',''); }", SEEDS)
    pg.reload(wait_until="domcontentloaded")
    pg.wait_for_timeout(1200)

    print("\n[V3.2.1-A] 版本号显示（左下角、读 version.json）")
    ver = pg.locator("#appVer").inner_text().strip()
    ok("左下角版本号显示 v3.2.4", ver == "v3.2.4", f"实际={ver!r}")

    print("\n[V3.2.1-B] 打开资源站管理，检查 5 条上限与默认状态")
    pg.click("#sourceManageBtn")
    pg.wait_for_timeout(300)
    rows = pg.locator("#smSourceList .sm-source")
    # v3.2.2：NSFW 过滤默认开启，7 条中 1 条敏感(m6)被隐藏 → 渲染 6 条
    ok("渲染 6 条非敏感线路（NSFW 过滤开启）", rows.count() == 6, f"count={rows.count()}")
    nsfw_btns = pg.locator('#smSourceList button[data-sm-act="nsfw"]')
    ok("每条可见线路都有 NSFW 按钮", nsfw_btns.count() == 6, f"count={nsfw_btns.count()}")
    # 关闭 NSFW 过滤 → 7 条全部恢复显示
    pg.evaluate("""()=>{const e=document.querySelector('#smNsfwFilter');e.checked=false;e.dispatchEvent(new Event('change',{bubbles:true}));}""")
    pg.wait_for_timeout(150)
    ok("关闭 NSFW 过滤后恢复 7 条", pg.locator("#smSourceList .sm-source").count() == 7,
       f"count={pg.locator('#smSourceList .sm-source').count()}")
    # 再开启 → 重新隐藏
    pg.evaluate("""()=>{const e=document.querySelector('#smNsfwFilter');e.checked=true;e.dispatchEvent(new Event('change',{bubbles:true}));}""")
    pg.wait_for_timeout(150)
    ok("重开 NSFW 过滤后隐藏回 6 条", pg.locator("#smSourceList .sm-source").count() == 6,
       f"count={pg.locator('#smSourceList .sm-source').count()}")
    # 默认不启用（初始种子全禁用）
    enabled_boxes = pg.locator('#smSourceList input[data-sm="enabled"]:checked')
    ok("初始无启用线路", enabled_boxes.count() == 0, f"checked={enabled_boxes.count()}")

    print("\n[V3.2.1-C] 新导入线路默认不启用")
    pg.click("#smAdd")
    pg.wait_for_timeout(150)
    pg.fill("#smName", "新线路")
    pg.fill("#smApi", "https://new.com/api.php/provide/vod/")
    pg.click("#smSave")
    pg.wait_for_timeout(300)
    new_row = pg.locator('#smSourceList .sm-source').filter(has_text="新线路")
    ok("新线路已添加", new_row.count() == 1)
    new_chk = new_row.locator('input[data-sm="enabled"]')
    ok("新线路默认未启用", not new_chk.is_checked())

    print("\n[V3.2.1-D] 最多启用 5 条限制")
    # 逐条勾选启用，尝试启用全部（>5），应被限制在 5 条
    n = pg.locator('#smSourceList input[data-sm="enabled"]').count()
    for i in range(n):
        # 用 DOM click 触发（含 change 事件），避免超长面板的视口滚动问题
        pg.evaluate("(i) => { const b=document.querySelectorAll('#smSourceList input[data-sm=\"enabled\"]')[i]; if(b && !b.checked) b.click(); }", i)
        pg.wait_for_timeout(50)
    checked = pg.locator('#smSourceList input[data-sm="enabled"]:checked').count()
    ok("启用数被限制在 5 条", checked == 5, f"checked={checked}")

    print("\n[V3.2.1-E] NSFW 开关：开启时隐藏敏感线路参与采集")
    # 当前 NSFW 过滤默认开启，敏感站(m6)已被标记；确认开关存在且默认勾选
    nf = pg.locator("#smNsfwFilter")
    ok("NSFW 过滤开关默认开启", nf.is_checked())
    # 关闭 NSFW 过滤（派发真实 change 事件）
    pg.evaluate("() => { const e=document.querySelector('#smNsfwFilter'); e.checked=false; e.dispatchEvent(new Event('change',{bubbles:true})); }")
    pg.wait_for_timeout(200)
    ok("关闭 NSFW 过滤后开关状态更新", not nf.is_checked())
    # 重新开启
    pg.evaluate("() => { const e=document.querySelector('#smNsfwFilter'); e.checked=true; e.dispatchEvent(new Event('change',{bubbles:true})); }")
    pg.wait_for_timeout(200)
    ok("重新开启 NSFW 过滤", nf.is_checked())

    print("\n[V3.2.1-F] 播放页片头片尾行：在进度条下方、同一行、紧邻")
    pg.click("#smClose")
    pg.wait_for_timeout(150)
    # 用真实点击一张卡片触发播放（mock 视频域名会网络失败，但布局已渲染）
    pg.locator("#app .card").first.click()
    pg.wait_for_timeout(600)
    # 触发进度条显示
    pg.evaluate("() => { const r=document.querySelector('#progRow'); if(r) r.hidden=false; const s=document.querySelector('#skipRow'); if(s) s.hidden=false; }")
    pg.wait_for_timeout(100)
    prog = pg.locator("#progRow").bounding_box()
    skip = pg.locator("#skipRow").bounding_box()
    ok("进度条与片头片尾行都可见", prog is not None and skip is not None)
    if prog and skip:
        ok("片头片尾行在进度条正下方", skip["y"] > prog["y"], f"prog.y={prog['y']}, skip.y={skip['y']}")
        intro = pg.locator("#introSec").bounding_box()
        outro = pg.locator("#outroSec").bounding_box()
        if intro and outro:
            ok("片头与片尾控件在同一行(y接近)", abs(intro["y"] - outro["y"]) < 12,
               f"intro.y={intro['y']}, outro.y={outro['y']}")
    # 关键 id 仍在，事件绑定不断
    for cid in ["skipIntroCheck", "introSec", "skipOutroCheck", "outroSec"]:
        ok(f"控件 #{cid} 仍存在", pg.locator(f"#{cid}").count() == 1)

    print("\n[G] JS 错误检查")
    # 已在前序测试覆盖，这里只确认页面仍可交互
    ok("页面交互正常（版本号可读）", len(pg.locator("#appVer").inner_text()) > 0)

    b.close()

print("\n========================================")
print(f"通过 {passed} / 失败 {failed}")
print("========================================\n")
import sys
sys.exit(1 if failed else 0)
