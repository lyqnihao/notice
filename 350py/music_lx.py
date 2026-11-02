# -*- coding: utf-8 -*-
"""
聚合音乐 · 壳端 py 源（自动加载 + 上/下一曲版）
===========================================================
对接本机（或局域网里某台设备）跑着的 LX 协议音乐服务，默认 :5566。
服务端就是 music_api-main 那套，接口前缀 /api/music/*。

-----------------------------------------------------------
这份解决两件事
-----------------------------------------------------------
【一】自动加载 —— 不用手填地址，进源就有内容

  地址三级递进，一级一级往下找：
    1. 文件顶部的「内置地址」SERVER_URL   → 填了就优先用它（写死一台最省事）
    2. 壳的配置里 ext 写了地址            → 没写内置时用它
    3. 内置候选表                          → 逐个探，谁先应答用谁
    4. 局域网自动扫描                      → 前面都不通，扫本机同网段的 :5566
                                             （壳在手机、服务在电脑时，这一步会自动找到）
  找到就缓存，之后不再重复探；壳被杀掉重进会自动重新找一遍。

【二】上一曲 / 下一曲 —— 播放器里能顺着歌单切

  点列表里任意一首 → 详情页把「整张歌单」按当前这首开头环绕铺开：
    当前这首排第一，后面是歌单里它后面的、再绕回前面。
  所以：点哪首就先播哪首，往后一直能切，切到尾自动回到开头（顺序播放）。
  每集的 id 自带「来源上下文」，壳重启、缓存过期都能把整张歌单重新拉回来，
  不靠内存，不靠运气。

-----------------------------------------------------------
壳端配置（ext 可以留空）
-----------------------------------------------------------
  {
    "key": "聚合音乐",
    "name": "🎵 聚合音乐",
    "type": 3,
    "api": "./py/music_lx.py",
    "searchable": 1,
    "quickSearch": 1,
    "filterable": 1,
    "ext": ""
  }
  同机(spy 和服务同设备)：ext 留空即可
  分机(壳在这台、服务在另一台)：ext 填 http://192.168.x.x:5566，
                                或者干脆留空让局域网自扫去找

依赖：纯标准库，无第三方包。
"""

import base64
import json
import socket
import threading
import time
import urllib.parse
import urllib.request

try:
    from base.spider import Spider as _BaseSpider
except Exception:
    _BaseSpider = object


# ==================== ★★★ 内置服务地址（要写死就改这一行）★★★ ====================
# 把你的 LX 音乐服务地址写在这里，壳里 ext 留空也能直接用（海阔这种没 ext 框的就靠它）。
#
#   服务跟壳在同一台设备  →  SERVER_URL = "http://127.0.0.1:5566"
#   服务在另一台设备(电脑/盒子/另一部手机)
#                        →  SERVER_URL = "http://192.168.1.100:5566"
#                           （把 192.168.1.100 换成跑服务那台的局域网 IP）
#
# 留空 = 不写死，自动找（先探候选表 → 再去扫局域网同网段），装完即用。
SERVER_URL = ""


# ==================== 可调项 ====================
DEFAULT_SITE = "http://127.0.0.1:5566"

# 备用候选表：SERVER_URL 留空或没探通时，按顺序往下试，谁先吐 JSON 用谁。
BASE_CANDIDATES = [
    "http://127.0.0.1:5566",
    "http://localhost:5566",
]

AUTO_SCAN = True          # 候选表都不通时，自动扫局域网同网段
SCAN_PORT = 5566          # 扫的端口
SCAN_TIMEOUT = 0.45       # 扫描时单个 IP 的探测超时(秒)
SCAN_THREADS = 48         # 扫描并发线程数
SCAN_COOLDOWN = 90        # 扫过一次没找到后，多少秒内不再扫(避免卡界面)
PROBE_TIMEOUT = 2.0       # 候选地址探测超时(秒)
RESOLVE_COOLDOWN = 30     # 地址没探通后，多少秒内不再重新探(避免每个请求都卡)

PLAY_AS_VIDEO = True      # True = 走壳内置播放器(有播放列表/下一集，也就是"下一曲")
                          # 若你的壳把它甩给外部播放器且没有列表，改成 False 再试

UA = "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
TIMEOUT = 8               # 单次业务请求超时(秒)
SHORT_TIMEOUT = 4         # 首页/榜单这类"能没有就别卡着"的请求超时

PAGE_SIZE = 30
MAX_EPISODES = 120        # 详情页最多铺多少集，防止列表过长拖壳

# 分类栏平台（顺序 = 显示顺序）
PLATFORMS = [
    ("kw", "酷我"),
    ("kg", "酷狗"),
    ("tx", "QQ音乐"),
    ("wy", "网易云"),
]
PLATFORM_NAME = dict(PLATFORMS)

# 搜索依次尝试的源
SEARCH_CHAIN = ["kw", "kg", "tx", "wy"]
# 已下线：这两路不许从分类/搜索/榜单/直链任何口子漏进来
DISABLED_SOURCES = ("mg", "qs")
FALLBACK_SOURCE = "kw"

BOARD_TTL = 1800          # 榜单目录缓存(秒)
PAGE_TTL = 600            # 某一页歌曲列表缓存(秒)
PAGE_CACHE_MAX = 40

DIAG_TID = "diag"         # 分类栏里的「服务自检」
NO_DATA_TID = "nodata"    # 列表拉不到时插的那条"点这里看原因"


# ==================== 小工具 ====================
def _b64(text):
    raw = base64.urlsafe_b64encode(text.encode("utf-8")).decode("ascii")
    return raw.rstrip("=")


def _unb64(text):
    raw = str(text)
    pad = (-len(raw)) % 4
    return base64.urlsafe_b64decode((raw + "=" * pad).encode("ascii")).decode("utf-8", "ignore")


def _singers(song):
    s = song.get("singer")
    if isinstance(s, list):
        out = []
        for x in s:
            if isinstance(x, dict):
                out.append(str(x.get("name") or ""))
            else:
                out.append(str(x))
        return "、".join([x for x in out if x])
    return str(s or "")


def _clean_name(text):
    # 剧集名里不能出现壳的分隔符
    return str(text or "").replace("$", " ").replace("#", " ").replace("|", " ").strip() or "音乐"


def _abs(site, url):
    if not url:
        return ""
    url = str(url).strip().replace(" ", "%20")
    if url.startswith("//"):
        return "http:" + url
    if url.startswith("/"):
        return site.rstrip("/") + url
    return url


def _local_ip():
    """拿到本机在某网段里的出口 IP（不发包，只做路由查找）"""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect(("223.5.5.5", 80))
            return s.getsockname()[0]
        finally:
            try:
                s.close()
            except Exception:
                pass
    except Exception:
        return ""


def _probe(host, timeout=None):
    """探一个地址是不是活着的音乐服务"""
    url = str(host).rstrip("/") + "/api/music/sources"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
        resp = urllib.request.urlopen(req, timeout=timeout or PROBE_TIMEOUT)
        try:
            raw = resp.read(65536)
        finally:
            try:
                resp.close()
            except Exception:
                pass
        if not raw:
            return False
        try:
            js = json.loads(raw.decode("utf-8", "ignore"))
        except Exception:
            return b"sources" in raw
        if isinstance(js, dict):
            data = js.get("data")
            if isinstance(data, dict) and data.get("sources"):
                return True
            if js.get("code") == 200:
                return True
        return False
    except Exception:
        return False


def _scan_lan(port=None, timeout=None):
    """扫本机同网段的 :5566，返回活着的服务地址（最多 2 个）"""
    port = port or SCAN_PORT
    timeout = timeout or SCAN_TIMEOUT
    ip = _local_ip()
    if not ip or "." not in ip:
        return []
    base = ip.rsplit(".", 1)[0] + "."
    hosts = [base + str(i) for i in range(1, 255)]
    found = []
    lock = threading.Lock()
    cursor = [0]

    def work():
        while True:
            with lock:
                if cursor[0] >= len(hosts) or len(found) >= 2:
                    return
                host = hosts[cursor[0]]
                cursor[0] += 1
            addr = "http://%s:%d" % (host, port)
            if _probe(addr, timeout):
                with lock:
                    if addr not in found:
                        found.append(addr)

    threads = []
    for _ in range(SCAN_THREADS):
        t = threading.Thread(target=work)
        t.daemon = True
        t.start()
        threads.append(t)
    deadline = time.time() + (timeout * 4 + 6)
    for t in threads:
        left = deadline - time.time()
        if left <= 0:
            break
        t.join(left)
    return found


# ==================== 主类 ====================
class Spider(_BaseSpider):

    def __init__(self):
        self.source = FALLBACK_SOURCE
        self.search_sources = list(SEARCH_CHAIN)
        self.timeout = TIMEOUT
        self._ext_site = ""            # 壳配置里明确给的地址
        self._site = ""                # 当前正在用的地址
        self._site_ok = False
        self._site_lock = threading.Lock()
        self._last_scan = 0.0
        self._resolve_cooldown_until = 0.0
        self._board_cache = {}
        self._page_cache = {}
        self._errs = []                # 最近几条错误，自检页用
        self._req_count = 0

    # ---------- 初始化 ----------

    def init(self, extend=""):
        ext = extend
        if isinstance(ext, (bytes, bytearray)):
            try:
                ext = ext.decode("utf-8", "ignore")
            except Exception:
                ext = ""
        if isinstance(ext, str):
            text = ext.strip()
            if text.startswith("{"):
                try:
                    ext = json.loads(text)
                except Exception:
                    ext = text
        if isinstance(ext, dict):
            site = ext.get("site") or ext.get("url") or ext.get("api") or ext.get("host") or ""
            if isinstance(site, str) and site.strip():
                self._ext_site = self._norm_site(site.strip())
            src = ext.get("source") or ext.get("class")
            if isinstance(src, str) and src.strip() and src.strip() not in DISABLED_SOURCES:
                self.source = src.strip()
            search = ext.get("search") or ext.get("searchSources")
            if isinstance(search, str):
                search = [s.strip() for s in search.split(",") if s.strip()]
            if isinstance(search, list) and search:
                self.search_sources = [str(s) for s in search if str(s) not in DISABLED_SOURCES]
        elif isinstance(ext, str) and ext.strip():
            self._ext_site = self._norm_site(ext.strip())

        if not self.search_sources:
            self.search_sources = list(SEARCH_CHAIN)
        if self.source in DISABLED_SOURCES:
            self.source = FALLBACK_SOURCE
        # 初始化时先把地址定下来（壳加载完立刻能用）。
        # 这一步只探候选表，不扫局域网 —— 免得壳启动被扫描卡住；
        # 局域网扫描在第一次真正取数据时自动补上。
        self._resolve_site(force=True, allow_scan=False)
        return self

    @staticmethod
    def _norm_site(site):
        site = str(site).strip().rstrip("/")
        if site and not site.startswith("http"):
            site = "http://" + site
        return site

    def _resolve_site(self, force=False, allow_scan=True):
        """把服务地址定下来：内置地址 > ext > 候选表 > 局域网自扫"""
        with self._site_lock:
            if self._site and self._site_ok and not force:
                return self._site
            # 刚试过不通：冷却期内直接返回上次结果，别让每个请求都卡几秒
            if not force and time.time() < self._resolve_cooldown_until:
                return self._site or DEFAULT_SITE

            order = []
            # 内置地址（文件顶部 SERVER_URL）填了就用它打头 —— 它才是"导入即用"那条
            builtin = self._norm_site(SERVER_URL) if SERVER_URL else ""
            if builtin:
                order.append(builtin)
            if self._ext_site:
                order.append(self._ext_site)
            for c in BASE_CANDIDATES:
                c = self._norm_site(c)
                if c and c not in order:
                    order.append(c)

            for cand in order:
                if _probe(cand, PROBE_TIMEOUT):
                    self._site = cand
                    self._site_ok = True
                    self._log("服务地址已确认: %s" % cand)
                    return self._site

            # 候选全不通 → 局域网自扫（带冷却，别把界面卡死）
            now = time.time()
            if allow_scan and AUTO_SCAN and (force or now - self._last_scan > SCAN_COOLDOWN):
                self._last_scan = now
                self._log("候选地址都不通，开始扫局域网 :%d ..." % SCAN_PORT)
                hits = _scan_lan()
                if hits:
                    self._site = hits[0]
                    self._site_ok = True
                    self._log("局域网扫到服务: %s" % self._site)
                    return self._site
                self._err("局域网扫描没扫到 :%d 的音乐服务" % SCAN_PORT)

            # 全都没戏：先占个位（保持后续请求有地址可拼），并标记不可用
            self._site = order[0] if order else DEFAULT_SITE
            self._site_ok = False
            if not force:
                self._resolve_cooldown_until = time.time() + RESOLVE_COOLDOWN
            self._err("服务地址没探通（试过: %s）" % (", ".join(order) if order else "无"))
            return self._site

    def _service_up(self):
        if self._site_ok:
            return True
        self._resolve_site()
        return self._site_ok

    # ---------- 壳要求的固定方法 ----------

    def getName(self):
        return "聚合音乐"

    def isVideoFormat(self, url):
        # True：交给壳内置播放器 —— 内置播放器能放音频，且带播放列表，
        # 播放界面的"下一集"就是"下一曲"。返回 False 有些壳会甩给外部播放器，就没有列表了。
        return bool(PLAY_AS_VIDEO)

    def manualVideoCheck(self):
        return False

    def destroy(self):
        return None

    def localProxy(self, param):
        return None

    # ---------- HTTP ----------

    def _get(self, path, params=None, timeout=None):
        base = self._resolve_site()
        url = base.rstrip("/") + path
        if params:
            clean = dict((k, v) for k, v in params.items() if v is not None and v != "")
            if clean:
                url = url + "?" + urllib.parse.urlencode(clean)
        return self._request(url, None, timeout)

    def _post(self, path, payload, timeout=None):
        base = self._resolve_site()
        url = base.rstrip("/") + path
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        return self._request(url, body, timeout)

    def _request(self, url, body, timeout=None):
        self._req_count += 1
        headers = {
            "User-Agent": UA,
            "Accept": "application/json, text/plain, */*",
        }
        if body is not None:
            headers["Content-Type"] = "application/json"
        req = urllib.request.Request(url, data=body, headers=headers)
        try:
            resp = urllib.request.urlopen(req, timeout=timeout or self.timeout)
        except Exception as e:
            self._err("请求失败 %s -> %s" % (url, e))
            return None
        try:
            raw = resp.read()
        finally:
            try:
                resp.close()
            except Exception:
                pass
        try:
            return json.loads(raw.decode("utf-8", "ignore"))
        except Exception as e:
            self._err("返回不是 JSON %s -> %s" % (url, e))
            return None

    def _log(self, msg):
        try:
            print("[music_lx] " + str(msg))
        except Exception:
            pass

    def _err(self, msg):
        try:
            self._errs.append("%s  %s" % (time.strftime("%H:%M:%S"), str(msg)))
            if len(self._errs) > 8:
                del self._errs[:-8]
        except Exception:
            pass
        self._log("ERR " + str(msg))

    # ---------- 数据整形 ----------

    def _list_of(self, resp, key="list"):
        if isinstance(resp, list):
            return resp
        if not isinstance(resp, dict):
            return []
        data = resp.get("data")
        if isinstance(data, list):
            return data
        if isinstance(data, dict):
            items = data.get(key)
            if isinstance(items, list):
                return items
            if isinstance(items, dict):
                for v in items.values():
                    if isinstance(v, list):
                        return v
        if isinstance(resp.get(key), list):
            return resp.get(key)
        return []

    @staticmethod
    def _total_of(resp):
        if isinstance(resp, dict):
            data = resp.get("data")
            if isinstance(data, dict):
                for k in ("total", "allPage", "totalCount"):
                    v = data.get(k)
                    if isinstance(v, int):
                        return v
        return None

    def _boards(self, source):
        now = time.time()
        hit = self._board_cache.get(source)
        if hit and now < hit[0]:
            return hit[1]
        resp = self._get("/api/music/leaderboard", {"source": source}, timeout=SHORT_TIMEOUT)
        boards = []
        for item in self._list_of(resp):
            if not isinstance(item, dict):
                continue
            if item.get("bangid"):
                boards.append(item)
        self._board_cache[source] = (now + BOARD_TTL, boards)
        if not boards:
            self._err("平台 %s 没拿到榜单目录" % source)
        return boards

    def _cache_get(self, key):
        hit = self._page_cache.get(key)
        if hit and time.time() < hit[0]:
            return hit[1]
        return None

    def _cache_put(self, key, songs):
        if len(self._page_cache) > PAGE_CACHE_MAX:
            now = time.time()
            for k in [k for k, v in list(self._page_cache.items()) if v[0] <= now]:
                self._page_cache.pop(k, None)
            if len(self._page_cache) > PAGE_CACHE_MAX:
                order = sorted(self._page_cache.items(), key=lambda kv: kv[1][0])
                for k, _v in order[: len(order) // 2]:
                    self._page_cache.pop(k, None)
        self._page_cache[key] = (time.time() + PAGE_TTL, songs)

    # ---------- 歌曲列表 ----------

    def _filter_songs(self, songs):
        out = []
        for s in songs or []:
            if not isinstance(s, dict):
                continue
            if str(s.get("source") or "") in DISABLED_SOURCES:
                continue
            if not s.get("songmid"):
                continue
            out.append(s)
        return out

    def _fetch_page(self, ctx):
        """按上下文拉一整页歌 —— 详情页/播放都靠它重建歌单"""
        ctx = ctx if isinstance(ctx, dict) else {}
        kind = ctx.get("y") or "b"
        source = ctx.get("s") or self.source
        if source in DISABLED_SOURCES:
            source = self.source
        try:
            page = int(ctx.get("p") or 1)
        except Exception:
            page = 1
        if kind == "s":
            keyword = ctx.get("k") or ""
            key = ("s", source, keyword, page)
            hit = self._cache_get(key)
            if hit is not None:
                return hit
            songs = self._search_one(source, keyword, page)
            songs = self._filter_songs(songs)
            self._cache_put(key, songs)
            return songs

        bangid = ctx.get("b")
        if not bangid:
            boards = self._boards(source)
            if boards:
                bangid = boards[0].get("bangid")
        if bangid:
            key = ("b", source, str(bangid), page)
            hit = self._cache_get(key)
            if hit is not None:
                return hit
            resp = self._get("/api/music/leaderboard/detail",
                             {"source": source, "bangid": bangid, "page": page},
                             timeout=SHORT_TIMEOUT)
            songs = self._filter_songs(self._list_of(resp))
            if songs:
                self._cache_put(key, songs)
                return songs
        # 榜单拿不到 → 退回歌单接口
        key = ("l", source, page)
        hit = self._cache_get(key)
        if hit is not None:
            return hit
        resp = self._get("/api/music/songlist", {"source": source, "page": page}, timeout=SHORT_TIMEOUT)
        songs = self._filter_songs(self._list_of(resp))
        self._cache_put(key, songs)
        return songs

    def _search_one(self, source, keyword, page):
        if not keyword or source in DISABLED_SOURCES:
            return []
        resp = self._get("/api/music/search",
                         {"source": source, "keyword": keyword, "page": page, "limit": PAGE_SIZE},
                         timeout=SHORT_TIMEOUT)
        return self._list_of(resp)

    # ---------- vid 编解码（自带来源上下文，壳重启也能重建歌单） ----------

    def _mk_vid(self, song, ctx, idx=0):
        payload = {
            "c": ctx or {},
            "i": idx,
            "m": song.get("songmid"),
            "s": song.get("source") or (ctx or {}).get("s") or self.source,
            "n": song.get("name") or "",
            "g": _singers(song),
            "p": song.get("img") or "",
        }
        return "s:" + _b64(json.dumps(payload, ensure_ascii=False))

    def _decode_vid(self, vid):
        if isinstance(vid, dict):
            return {"c": {}, "m": vid.get("songmid"), "s": vid.get("source"),
                    "n": vid.get("name"), "g": _singers(vid), "p": vid.get("img"), "_song": vid}
        text = "" if vid is None else str(vid)
        if not text:
            return None
        for prefix in ("s:", "p:"):
            if text.startswith(prefix):
                text = text[len(prefix):]
                break
        try:
            payload = json.loads(_unb64(text))
        except Exception:
            return None
        if not isinstance(payload, dict):
            return None
        # 兼容老版直接塞歌曲对象的写法
        if "songmid" in payload and "m" not in payload:
            payload = {"c": {}, "m": payload.get("songmid"), "s": payload.get("source"),
                       "n": payload.get("name"), "g": _singers(payload), "p": payload.get("img"),
                       "_song": payload}
        return payload

    def _find_song(self, payload):
        """拿着精简信息，尽量找回服务的原始歌曲对象（含源站需要的各种字段）"""
        if not payload:
            return None
        mid = payload.get("m")
        ctx = payload.get("c") or {}
        source = payload.get("s") or ctx.get("s") or self.source
        songs = []
        try:
            songs = self._fetch_page(ctx) or []
        except Exception:
            songs = []
        for s in songs:
            if isinstance(s, dict) and str(s.get("songmid")) == str(mid):
                return s
        raw = payload.get("_song")
        if isinstance(raw, dict) and raw.get("songmid"):
            return raw
        # 回落：用精简信息拼一个，多数源靠 songmid 就能取链
        return {
            "songmid": mid,
            "source": source,
            "name": payload.get("n") or "",
            "singer": payload.get("g") or "",
            "img": payload.get("p") or "",
        }

    def _play_url(self, song):
        if not isinstance(song, dict) or not song.get("songmid"):
            return ""
        source = song.get("source") or self.source
        if str(source) in DISABLED_SOURCES:
            return ""
        payload = {"source": source, "songmid": song.get("songmid"), "songInfo": song}
        data = self._post("/api/music/music-url", payload)
        urls = self._list_of(data)
        if not urls:
            data = self._get("/api/music/music-url",
                             {"source": source, "songmid": song.get("songmid")})
            urls = self._list_of(data)
        if not urls:
            self._err("取直链失败 source=%s songmid=%s" % (source, song.get("songmid")))
            return ""
        best = None
        for item in urls:
            if not isinstance(item, dict):
                continue
            if item.get("url"):
                if best is None:
                    best = item
                elif str(item.get("type") or "") in ("flac", "flac24bit", "320k"):
                    best = item
        if not best:
            return ""
        return _abs(self._resolve_site(), best.get("url"))

    # ---------- 自检报告 ----------

    def _diag_lines(self):
        lines = []
        lines.append("服务地址自检")
        lines.append("当前使用：" + (self._site or "未定"))
        lines.append("探测结果：" + ("已连上 ✅" if self._site_ok else "没连上 ❌"))
        lines.append("")
        lines.append("候选表：")
        order = []
        builtin = self._norm_site(SERVER_URL) if SERVER_URL else ""
        if builtin:
            order.append(("内置地址", builtin))
        else:
            lines.append("  ▫ 内置地址：没写（SERVER_URL 留空，走自动找）")
        if self._ext_site:
            order.append(("配置 ext", self._ext_site))
        for c in BASE_CANDIDATES:
            c = self._norm_site(c)
            if c:
                order.append(("内置候选", c))
        for label, cand in order:
            try:
                ok = _probe(cand, PROBE_TIMEOUT)
            except Exception:
                ok = False
            lines.append("  %s %s  %s" % ("✅" if ok else "❌", label, cand))
        lines.append("")
        lines.append("局域网自扫：%s（端口 %d）" % ("开" if AUTO_SCAN else "关", SCAN_PORT))
        if AUTO_SCAN and not self._site_ok:
            ip = _local_ip()
            lines.append("  本机出口网段：" + (ip.rsplit(".", 1)[0] + ".x" if ip else "取不到"))
            lines.append("  上次扫描：" + (time.strftime("%H:%M:%S", time.localtime(self._last_scan)) if self._last_scan else "未扫过"))
        lines.append("")
        lines.append("请求次数：%d" % self._req_count)
        if self._errs:
            lines.append("")
            lines.append("最近错误（新→旧）：")
            for e in reversed(self._errs):
                lines.append("  · " + e)
        lines.append("")
        lines.append("服务没起来怎么办：在跑服务那台设备上执行 node index.js，")
        lines.append("看到 [Server] 已启动 后，浏览器打开 地址+/api/music/sources 应出 JSON。")
        return lines

    # ---------- TVBox 接口 ----------

    def homeContent(self, filter=False):
        classes = [{"type_id": sid, "type_name": name} for sid, name in PLATFORMS]
        classes.append({"type_id": DIAG_TID, "type_name": "🩺 服务自检"})
        out = {"class": classes}
        if not self._service_up():
            return out
        filters = {}
        for sid, _name in PLATFORMS:
            boards = self._boards(sid)
            if not boards:
                continue
            values = []
            for b in boards[:40]:
                bid = b.get("bangid")
                if not bid:
                    continue
                values.append({"n": str(b.get("name") or "榜单"), "v": str(bid)})
            if values:
                filters[sid] = [{"key": "bangid", "name": "榜单", "value": values}]
        if filters:
            out["filters"] = filters
        return out

    def homeVideoContent(self):
        """进源就有内容：给默认平台第一个榜单的前 20 首"""
        source = self.source if self.source not in DISABLED_SOURCES else FALLBACK_SOURCE
        boards = self._boards(source)
        if not boards:
            return {"list": []}
        bangid = boards[0].get("bangid")
        ctx = {"y": "b", "s": source, "b": str(bangid), "p": 1}
        songs = self._fetch_page(ctx)
        return {"list": self._vods(songs[:20], ctx)}

    def categoryContent(self, tid, pg="1", filter=False, extend=None):
        tid = str(tid)
        try:
            page = int(pg)
        except Exception:
            page = 1

        if tid == DIAG_TID:
            body = "\n".join(self._diag_lines())
            return {"list": [{
                "vod_id": DIAG_TID,
                "vod_name": "🩺 服务自检报告",
                "vod_pic": "",
                "vod_remarks": "点开看明细",
                "vod_tag": "",
                "vod_douban_id": 0,
                "vod_content": body,
            }], "page": 1, "pagecount": 1, "limit": 20, "total": 1}

        if tid == NO_DATA_TID:
            body = "\n".join(self._diag_lines())
            return {"list": [{
                "vod_id": DIAG_TID,
                "vod_name": "❌ 拉不到数据",
                "vod_pic": "",
                "vod_remarks": "点这里看原因",
                "vod_tag": "",
                "vod_douban_id": 0,
                "vod_content": body,
            }], "page": 1, "pagecount": 1, "limit": 20, "total": 1}

        # 下线源（咪咕/汽水）：老壳里若还留着这两个分类，点进来给空列表
        if tid in DISABLED_SOURCES:
            return {"list": [], "page": 1, "pagecount": 1, "limit": PAGE_SIZE, "total": 0}

        source = tid if tid in PLATFORM_NAME else self.source
        if source in DISABLED_SOURCES:
            return {"list": [], "page": 1, "pagecount": 1, "limit": PAGE_SIZE, "total": 0}

        extend = extend if isinstance(extend, dict) else {}
        bangid = extend.get("bangid")
        if not bangid:
            boards = self._boards(source)
            if boards:
                bangid = boards[0].get("bangid")
        ctx = {"y": "b", "s": source, "b": str(bangid) if bangid else "", "p": page}
        songs = self._fetch_page(ctx)

        result = {"list": [], "page": page, "pagecount": 9999, "limit": PAGE_SIZE, "total": 999999}
        if songs:
            result["list"] = self._vods(songs, ctx)
            if len(songs) < PAGE_SIZE:
                result["pagecount"] = page
                result["total"] = (page - 1) * PAGE_SIZE + len(songs)
            return result

        # 真拉不到 → 不给空白，插一条能看原因的
        result["list"] = [{
            "vod_id": DIAG_TID,
            "vod_name": "❌ 拉不到数据",
            "vod_pic": "",
            "vod_remarks": "点这里看原因",
            "vod_tag": "",
            "vod_douban_id": 0,
            "vod_content": "\n".join(self._diag_lines()),
        }]
        result["pagecount"] = 1
        result["total"] = 1
        return result

    def _vods(self, songs, ctx=None):
        ctx = ctx or {"y": "b", "s": self.source, "b": "", "p": 1}
        out = []
        for i, s in enumerate(songs or []):
            if not isinstance(s, dict) or not s.get("songmid"):
                continue
            if str(s.get("source") or "") in DISABLED_SOURCES:
                continue
            name = s.get("name") or ""
            singer = _singers(s)
            remark = singer
            if s.get("interval"):
                remark = (singer + " · " + str(s.get("interval"))) if singer else str(s.get("interval"))
            out.append({
                "vod_id": self._mk_vid(s, ctx, i),
                "vod_name": name,
                "vod_pic": s.get("img") or "",
                "vod_remarks": remark,
                "vod_tag": "",
                "vod_douban_id": 0,
                "vod_content": ("歌手：" + (singer or "未知") +
                                "\n专辑：" + str(s.get("albumName") or "") +
                                "\n时长：" + str(s.get("interval") or "") +
                                "\n来源：" + PLATFORM_NAME.get(s.get("source"), str(s.get("source") or ""))),
            })
        return out

    def detailContent(self, array):
        vid = array[0] if isinstance(array, (list, tuple)) and array else array
        payload = self._decode_vid(vid)
        if not payload:
            return {"list": []}
        ctx = payload.get("c") or {}
        source = payload.get("s") or ctx.get("s") or self.source
        if str(source) in DISABLED_SOURCES:
            return {"list": []}

        songs = []
        try:
            songs = self._fetch_page(ctx) or []
        except Exception as e:
            self._err("详情页重建歌单失败 -> %s" % e)

        mid = str(payload.get("m") or "")
        start = 0
        for i, s in enumerate(songs):
            if str(s.get("songmid")) == mid:
                start = i
                break

        # 当前这首排第一，其余按原顺序环绕 —— 点哪首先播哪首，往后一直能切
        ordered = (songs[start:] + songs[:start]) if songs else []
        if not ordered:
            fallback = self._find_song(payload)
            ordered = [fallback] if fallback and fallback.get("songmid") else []
        ordered = [s for s in ordered if isinstance(s, dict) and s.get("songmid")]
        ordered = ordered[:MAX_EPISODES]

        episodes = []
        for i, s in enumerate(ordered):
            nm = _clean_name((s.get("name") or "音乐") + (" - " + _singers(s) if _singers(s) else ""))
            episodes.append("%s$%s" % (nm, self._mk_vid(s, ctx, i)))

        if not episodes:
            return {"list": []}

        first = ordered[0]
        vod = {
            "vod_id": str(vid),
            "vod_name": first.get("name") or "音乐",
            "vod_pic": first.get("img") or "",
            "vod_remarks": "%d 首" % len(episodes),
            "vod_year": "",
            "vod_area": "",
            "vod_actor": _singers(first),
            "vod_director": "",
            "vod_content": "点任意一集播放；播放器里的「下一集」就是下一曲。",
            "vod_play_from": "音乐",
            "vod_play_url": "#".join(episodes),
        }
        return {"list": [vod]}

    def playerContent(self, flag, id, vipFlags=None):
        url = ""
        if isinstance(id, str) and (id.startswith("http://") or id.startswith("https://")):
            url = id
        else:
            payload = self._decode_vid(id)
            song = self._find_song(payload) if payload else None
            if song:
                url = self._play_url(song)
        return {
            "parse": 0,
            "playUrl": "",
            "url": url or "",
            "header": {"User-Agent": UA, "Referer": self._resolve_site().rstrip("/") + "/"},
        }

    def searchContent(self, key, quick=False, pg="1"):
        try:
            page = int(pg)
        except Exception:
            page = 1
        keyword = key or ""
        songs = []
        used = ""
        for source in (self.search_sources or SEARCH_CHAIN):
            if source in DISABLED_SOURCES:
                continue
            got = self._filter_songs(self._search_one(source, keyword, page))
            if got:
                songs = got
                used = source
                self._cache_put(("s", source, keyword, page), got)
                break
        if not songs:
            return {"list": []}
        ctx = {"y": "s", "s": used, "k": keyword, "p": page}
        return {"list": self._vods(songs, ctx)}


if __name__ == "__main__":
    sp = Spider()
    sp.init("")
    print(json.dumps(sp.homeContent(True), ensure_ascii=False)[:600])
