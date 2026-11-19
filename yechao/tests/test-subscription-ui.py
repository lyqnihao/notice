# -*- coding: utf-8 -*-
"""订阅系统浏览器 UI 测试：拦截订阅 URL，验证多格式导入、增量更新、错误分类、去重。"""
import json, sys, os
from playwright.sync_api import sync_playwright
from urllib.parse import urlparse, parse_qs

FIXTURES = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures")

BASE = "http://127.0.0.1:8899/index.html"
passed = failed = 0
def ok(name, cond, extra=""):
    global passed, failed
    if cond: print(f"  ✓ {name}"); passed += 1
    else: print(f"  ✗ {name} {extra}"); failed += 1

LUNATV = json.load(open(os.path.join(FIXTURES, "f0.json")))    # api_site 对象 69 条
OMNIBOX = json.load(open(os.path.join(FIXTURES, "omni.json"))) # sites 数组 49 条

with sync_playwright() as p:
    b = p.chromium.launch(headless=True, args=["--no-sandbox"])
    ctx = b.new_context()
    pg = ctx.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))

    state = {"sub_body": json.dumps(LUNATV), "sub_status": 200, "ctype": "application/json"}
    def handle(route):
        url = route.request.url
        if "sub.mock.test" in url:
            route.fulfill(status=state["sub_status"], content_type=state["ctype"], body=state["sub_body"])
            return
        q = parse_qs(urlparse(url).query)
        if "ac" in q:
            ac = q["ac"][0]
            body = {"class": [{"type_id":1,"type_pid":0,"type_name":"电影"}], "list": []} if ac=="list" else {"pagecount":1,"total":1,"list":[]}
            route.fulfill(status=200, content_type="application/json", body=json.dumps(body)); return
        route.continue_()

    pg.add_init_script("""if(!localStorage.getItem('nc_sources_v1')){
      localStorage.setItem('nc_sources_v1',JSON.stringify([{id:'manual1',name:'我的手动线路',api:'https://my.com/api.php/provide/vod/',enabled:true,origin:'manual',status:'正常',tags:[]}]));
      localStorage.setItem('nc_active_source_v1',JSON.stringify('manual1'));
    }""")
    pg.route("**/*", handle)
    pg.goto(BASE, wait_until="domcontentloaded"); pg.wait_for_timeout(1000)
    pg.locator("#sourceManageBtn").click(); pg.wait_for_timeout(300)

    print("\n[H] 订阅导入：LunaTV api_site 对象")
    pg.locator("#smSubName").fill("LunaTV订阅")
    pg.locator("#smSubUrl").fill("https://sub.mock.test/luna.json")
    pg.locator("#smAddSub").click()
    pg.wait_for_timeout(1500)
    n = pg.evaluate("()=>SourceManager.getSources().filter(s=>s.origin==='subscription').length")
    ok("导入 api_site 线路(约69条)", n >= 60, f"导入 {n} 条")
    ok("结果统计显示", pg.locator("#smSubResult").is_visible())
    result_txt = pg.locator("#smSubResult").inner_text()
    ok("统计含新增数量", "新增" in result_txt)
    ok("格式标注 api_site", "api_site" in result_txt)

    print("\n[I] 增量更新：手动资源不被覆盖/删除")
    manual = pg.evaluate("()=>SourceManager.getSources().find(s=>s.id==='manual1')")
    ok("手动线路保留", manual is not None and manual["name"]=="我的手动线路")

    print("\n[J] 切换订阅内容为 OmniBox sites 后更新 → 增量删除旧源")
    sub_id = pg.evaluate("()=>JSON.parse(localStorage.getItem('nc_subscriptions_v1'))[0].id")
    state["sub_body"] = json.dumps(OMNIBOX)
    pg.evaluate(f"""()=>{{
      const s=JSON.parse(localStorage.getItem('nc_subscriptions_v1'));
      s[0].url='https://sub.mock.test/omni.json';
      localStorage.setItem('nc_subscriptions_v1',JSON.stringify(s));
    }}""")
    # 通过 UI 点击更新（重新打开使 URL 生效需 reload）
    pg.reload(wait_until="domcontentloaded"); pg.wait_for_timeout(900)
    pg.locator("#sourceManageBtn").click(); pg.wait_for_timeout(300)
    # 复用同一订阅 id：改 URL 后点更新
    pg.evaluate(f"""()=>{{
      const s=JSON.parse(localStorage.getItem('nc_subscriptions_v1'));
      s[0].url='https://sub.mock.test/omni.json';
      localStorage.setItem('nc_subscriptions_v1',JSON.stringify(s));
    }}""")
    pg.reload(wait_until="domcontentloaded"); pg.wait_for_timeout(900)
    pg.locator("#sourceManageBtn").click(); pg.wait_for_timeout(300)
    pg.locator(f'[data-sub-act="update"][data-id="{sub_id}"]').click()
    pg.wait_for_timeout(1500)
    sub_n = pg.evaluate("()=>SourceManager.getSources().filter(s=>s.subscriptionId==='%s').length" % sub_id)
    ok("OmniBox 订阅更新为 49 条", sub_n == 49, f"实际 {sub_n} 条")
    ok("手动线路仍在", pg.evaluate("()=>SourceManager.getSources().some(s=>s.id==='manual1')"))

    print("\n[K] 订阅错误处理：HTML 响应不误判为空、不删旧资源")
    state["sub_status"] = 200; state["ctype"] = "text/html"; state["sub_body"] = "<!DOCTYPE html><html>登录</html>"
    before = pg.evaluate("()=>SourceManager.getSources().length")
    pg.locator(f'[data-sub-act="update"][data-id="{sub_id}"]').click()
    pg.wait_for_timeout(1200)
    after = pg.evaluate("()=>SourceManager.getSources().length")
    ok("HTML 响应不删旧资源", after == before, f"before={before} after={after}")

    print("\n[L] TVBox 格式明确拒绝")
    state["ctype"] = "application/json"
    state["sub_body"] = json.dumps({"urls":[{"url":"http://x","name":"x"}],"parses":[{"type":1,"url":"http://y"}]})
    pg.locator(f'[data-sub-act="update"][data-id="{sub_id}"]').click(); pg.wait_for_timeout(1200)
    last = pg.evaluate("()=>JSON.parse(localStorage.getItem('nc_subscriptions_v1'))[0].lastResult||''")
    ok("TVBox 提示不支持", "TVBox" in last or "不支持" in last, f"lastResult={last}")

    print("\n[M] JS 错误")
    real = [e for e in errs if "net::ERR" not in e]
    ok("无运行时错误", len(real)==0, str(real[:3]))

    b.close()

print("\n========================================")
print(f"通过 {passed} / 失败 {failed}")
print("========================================")
sys.exit(1 if failed else 0)
