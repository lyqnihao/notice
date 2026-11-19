# -*- coding: utf-8 -*-
"""浏览器集成测试：加载真实页面，拦截 API，验证首页/播放页/资源管理器/进度条/过滤。"""
import json, sys, time
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8899/index.html"
errors = []
passed = 0
failed = 0

def ok(name, cond, extra=""):
    global passed, failed
    if cond:
        print(f"  ✓ {name}"); passed += 1
    else:
        print(f"  ✗ {name} {extra}"); failed += 1

# mock CMS 数据
CATS = [{"type_id": 1, "type_pid": 0, "type_name": "电影"},
        {"type_id": 2, "type_pid": 1, "type_name": "动作片"},
        {"type_id": 3, "type_pid": 1, "type_name": "喜剧片"}]
def vod(i):
    return {
        "vod_id": i, "vod_name": f"测试影片 {i} 超长的标题用来验证两行省略效果是否正常工作哦",
        "vod_pic": "", "type_name": ["动作片", "喜剧片"][i % 2], "type_id": 2,
        "vod_remarks": "HD", "vod_hits": 100000 + i * 37, "vod_score": 8.5,
        "vod_time": "2026-11-20 10:00:00",
        "vod_play_url": "第1集$https://a.com/main/1.mp4#第2集$https://a.com/main/2.mp4",
        "vod_content": "这是一段影片简介内容，用于测试详情展示。",
        "vod_actor": "演员甲,演员乙", "vod_director": "导演丙", "vod_tag": "动作,经典",
    }
VODS = [vod(i) for i in range(1, 30)]

def api_response(params):
    ac = params.get("ac", [""])
    ac = ac[0] if isinstance(ac, list) else ac
    if ac == "list":
        return {"class": CATS, "list": []}
    if ac == "videolist":
        return {"pagecount": 3, "total": 100, "list": VODS}
    if ac == "detail":
        return {"list": [VODS[0]]}
    return {"list": VODS}

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
    ctx = browser.new_context(viewport={"width": 1280, "height": 900})
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append("console.error: " + m.text) if m.type == "error" else None)

    def handle(route):
        from urllib.parse import urlparse, parse_qs
        q = parse_qs(urlparse(route.request.url).query)
        # 只拦截带 ac= 的采集接口；sources.json 走真实
        if "ac" in q:
            route.fulfill(status=200, content_type="application/json", body=json.dumps(api_response(q)))
        else:
            route.continue_()

    # 先注入初始化 localStorage：一条启用的 mock 线路，避免走 sources.json 真实站
    page.add_init_script("""
      if (!localStorage.getItem('nc_sources_v1')) {
        localStorage.setItem('nc_sources_v1', JSON.stringify([{
          id:'m1', name:'Mock线路', api:'https://mock.com/api.php/provide/vod/',
          enabled:true, origin:'manual', status:'正常', statusCode:'ok', tags:[]
        }]));
        localStorage.setItem('nc_active_source_v1', JSON.stringify('m1'));
      }
    """)
    page.route("**/*", handle)
    page.goto(BASE, wait_until="domcontentloaded", timeout=30000)
    # 等首页渲染出卡片
    try:
        page.wait_for_selector(".card", timeout=15000)
    except Exception as e:
        errors.append("首页未渲染卡片: " + str(e))

    print("\n[A] 首页卡片统一")
    ok("首页渲染出卡片", page.locator("#app .card").count() > 0)
    # 卡片宽度一致（同一行）
    widths = page.eval_on_selector_all("#app .grid .card", "els => els.slice(0,4).map(e => Math.round(e.getBoundingClientRect().width))")
    ok("同一行卡片宽度一致", len(set(widths)) <= 1, f"widths={widths}")
    # 封面比例
    ratios = page.eval_on_selector_all("#app .grid .card .thumb", "els => els.slice(0,4).map(e => {const r=e.getBoundingClientRect();return (r.width/r.height).toFixed(2)})")
    ok("封面比例一致(2/3≈0.67)", len(set(ratios)) <= 1, f"ratios={ratios}")
    # 标题两行省略 CSS
    clamp = page.eval_on_selector("#app .card .c-name", "e => getComputedStyle(e).webkitLineClamp")
    ok("标题两行省略(-webkit-line-clamp=2)", clamp == "2", f"clamp={clamp}")
    # 元信息含年份/类型(评分)
    ok("元信息含评分", page.locator("#app .card .c-score").count() > 0)

    print("\n[B] 播放页方案B布局")
    page.locator("#app .card").first.click()
    page.wait_for_timeout(1200)
    ok("播放器浮层打开", page.locator("#pmask").is_visible())
    # 检查顺序：播放器、线路、选集、详情、chips、推荐
    order = page.eval_on_selector_all("#pmask .player-scroll > *", "els => els.map(e => e.id).filter(Boolean)")
    # player-video 无 id，用 class 检查部分关键块顺序
    idx = {k: order.index(k) for k in ["lineBlock","epBlock","detailBlock","metaBlock","relBlock"] if k in order}
    ok("线路→选集→详情→标签→推荐 顺序正确",
       all(idx.get(a, -1) < idx.get(b, -1) for a,b in [("lineBlock","epBlock"),("epBlock","detailBlock"),("detailBlock","metaBlock"),("metaBlock","relBlock")]),
       f"order={order}")
    ok("渲染出线路按钮", page.locator("#lines .line-btn").count() >= 1)
    ok("渲染出选集按钮", page.locator("#eps .ep").count() >= 2)
    ok("渲染出可点击演员/标签 chips", page.locator("#pChips .p-chip").count() > 0)
    ok("渲染出相关推荐", page.locator("#relGrid .card").count() > 0)

    print("\n[C] 进度条")
    ok("进度条容器存在", page.locator("#progRow").count() == 1)
    # 手动触发 loadedmetadata + timeupdate 不易，直接调用内部 updProg（全局函数）
    page.evaluate("() => { const v=document.getElementById('video'); Object.defineProperty(v,'duration',{value:125,configurable:true}); Object.defineProperty(v,'currentTime',{value:65,configurable:true,writable:true}); updProg(); }")
    cur = page.locator("#progCur").inner_text()
    dur = page.locator("#progDur").inner_text()
    ok("进度条当前时间正确(01:05)", cur == "01:05", f"cur={cur}")
    ok("进度条总时长正确(02:05)", dur == "02:05", f"dur={dur}")
    # LIVE：模拟未知时长
    page.evaluate("() => { const v=document.getElementById('video'); Object.defineProperty(v,'duration',{value:NaN,configurable:true}); updProg(); }")
    ok("未知时长显示 LIVE", page.locator("#progDur").inner_text() == "LIVE")
    ok("LIVE 时进度条禁用 seek", page.locator("#progBar").is_disabled())

    print("\n[D] 广告过滤开关/片头片尾设置")
    ok("广告过滤默认开启", page.locator("#adfCheck").is_checked())
    ok("片头跳过默认关闭且 0 秒", (not page.locator("#skipIntroCheck").is_checked()) and page.locator("#introSec").input_value() == "0")
    ok("片尾预留默认关闭且 0 秒", (not page.locator("#skipOutroCheck").is_checked()) and page.locator("#outroSec").input_value() == "0")
    ok("自动下一集默认开启", page.locator("#autoNextCheck").is_checked())

    # 关闭播放器
    page.locator("#pclose").click()
    page.wait_for_timeout(300)

    print("\n[E] 资源站管理：勾选/启用分离、全选、反选、检测全部")
    page.locator("#sourceManageBtn").click()
    page.wait_for_timeout(300)
    ok("资源面板打开", page.locator("#sourcePanel").is_visible())
    # 添加第二条禁用线路，测试检测全部包含禁用
    page.evaluate("""
      () => {
        const s = JSON.parse(localStorage.getItem('nc_sources_v1'));
        s.push({id:'m2',name:'禁用线路',api:'https://mock2.com/api.php/provide/vod/',enabled:false,origin:'manual',status:'未检测',tags:[]});
        localStorage.setItem('nc_sources_v1', JSON.stringify(s));
      }
    """)
    page.reload(wait_until="domcontentloaded"); page.wait_for_timeout(800)
    page.locator("#sourceManageBtn").click(); page.wait_for_timeout(300)
    total_sources = page.locator("#smSourceList .sm-source").count()
    ok("两条线路(含禁用)都显示", total_sources == 2, f"count={total_sources}")
    # 全选
    page.locator("#smSelectAll").click(); page.wait_for_timeout(200)
    checked = page.eval_on_selector_all("#smSourceList input[data-sm=checked]", "els => els.every(e=>e.checked)")
    ok("全选勾选所有", checked)
    # 反选
    page.locator("#smInvertSel").click(); page.wait_for_timeout(200)
    checked2 = page.eval_on_selector_all("#smSourceList input[data-sm=checked]", "els => els.every(e=>!e.checked)")
    ok("反选反转所有勾选", checked2)
    # 勾选状态与启用分离：禁用线路 enabled 仍为 false
    disabled_enabled = page.eval_on_selector("#smSourceList .sm-source[data-id=m2] input[data-sm=enabled]", "e=>e.checked")
    ok("勾选不影响启用状态(禁用仍禁用)", disabled_enabled == False)
    # 检测全部：拦截 api 请求返回 CMS JSON，验证禁用线路也被检测
    page.locator("#smTestAll").click()
    page.wait_for_timeout(2500)
    m2_status = page.locator("#smSourceList .sm-source[data-id=m2] .sm-status").inner_text()
    ok("检测全部包含禁用线路(m2被检测)", m2_status != "未检测", f"m2 status={m2_status}")
    ok("显示检测统计", page.locator("#smTestSummary").is_visible())

    print("\n[F] 请求模式设置")
    modes = page.eval_on_selector_all("#smReqMode option", "els=>els.map(e=>e.value)")
    ok("三种请求模式齐全", modes == ["direct","relay-first","fallback"], f"modes={modes}")

    print("\n[G] JS 错误检查")
    # 过滤掉 mock 假域名视频地址无法解析的预期网络错误（非代码问题）
    real_errors = [e for e in errors
                   if "favicon" not in e.lower()
                   and "ERR_NAME_NOT_RESOLVED" not in e
                   and "net::ERR" not in e
                   and not e.startswith("console.error: Failed to load resource")]
    ok("无 JavaScript 运行时错误", len(real_errors) == 0, f"errors={real_errors[:5]}")

    browser.close()

print("\n========================================")
print(f"通过 {passed} / 失败 {failed}")
print("========================================")
sys.exit(1 if failed else 0)
