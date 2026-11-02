# -*- coding: utf-8 -*-
# Korean BJ (kbj.im) - 韩国女主播录播
# 列表/标签分类/搜索均为站内 HTML；AB 线路(abyssplayer)本地解密 datas 拼直链，BI 线路走嗅探。

import re
import json
import base64
import hashlib

# ---------- 纯 Python AES（CTR 只需加密方向），支持 128/192/256 密钥扩展 ----------
_SBOX = (
    0x63,0x7c,0x77,0x7b,0xf2,0x6b,0x6f,0xc5,0x30,0x01,0x67,0x2b,0xfe,0xd7,0xab,0x76,
    0xca,0x82,0xc9,0x7d,0xfa,0x59,0x47,0xf0,0xad,0xd4,0xa2,0xaf,0x9c,0xa4,0x72,0xc0,
    0xb7,0xfd,0x93,0x26,0x36,0x3f,0xf7,0xcc,0x34,0xa5,0xe5,0xf1,0x71,0xd8,0x31,0x15,
    0x04,0xc7,0x23,0xc3,0x18,0x96,0x05,0x9a,0x07,0x12,0x80,0xe2,0xeb,0x27,0xb2,0x75,
    0x09,0x83,0x2c,0x1a,0x1b,0x6e,0x5a,0xa0,0x52,0x3b,0xd6,0xb3,0x29,0xe3,0x2f,0x84,
    0x53,0xd1,0x00,0xed,0x20,0xfc,0xb1,0x5b,0x6a,0xcb,0xbe,0x39,0x4a,0x4c,0x58,0xcf,
    0xd0,0xef,0xaa,0xfb,0x43,0x4d,0x33,0x85,0x45,0xf9,0x02,0x7f,0x50,0x3c,0x9f,0xa8,
    0x51,0xa3,0x40,0x8f,0x92,0x9d,0x38,0xf5,0xbc,0xb6,0xda,0x21,0x10,0xff,0xf3,0xd2,
    0xcd,0x0c,0x13,0xec,0x5f,0x97,0x44,0x17,0xc4,0xa7,0x7e,0x3d,0x64,0x5d,0x19,0x73,
    0x60,0x81,0x4f,0xdc,0x22,0x2a,0x90,0x88,0x46,0xee,0xb8,0x14,0xde,0x5e,0x0b,0xdb,
    0xe0,0x32,0x3a,0x0a,0x49,0x06,0x24,0x5c,0xc2,0xd3,0xac,0x62,0x91,0x95,0xe4,0x79,
    0xe7,0xc8,0x37,0x6d,0x8d,0xd5,0x4e,0xa9,0x6c,0x56,0xf4,0xea,0x65,0x7a,0xae,0x08,
    0xba,0x78,0x25,0x2e,0x1c,0xa6,0xb4,0xc6,0xe8,0xdd,0x74,0x1f,0x4b,0xbd,0x8b,0x8a,
    0x70,0x3e,0xb5,0x66,0x48,0x03,0xf6,0x0e,0x61,0x35,0x57,0xb9,0x86,0xc1,0x1d,0x9e,
    0xe1,0xf8,0x98,0x11,0x69,0xd9,0x8e,0x94,0x9b,0x1e,0x87,0xe9,0xce,0x55,0x28,0xdf,
    0x8c,0xa1,0x89,0x0d,0xbf,0xe6,0x42,0x68,0x41,0x99,0x2d,0x0f,0xb0,0x54,0xbb,0x16,
)
_RCON = (0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36, 0x6c, 0xd8, 0xab, 0x4d)


def _expand_key(key):
    nk = len(key) // 4
    nr = nk + 6
    w = list(key)
    for i in range(nk, 4 * (nr + 1)):
        t = w[4 * (i - 1):4 * i]
        if i % nk == 0:
            t = [_SBOX[t[1]] ^ _RCON[i // nk - 1], _SBOX[t[2]], _SBOX[t[3]], _SBOX[t[0]]]
        elif nk > 6 and i % nk == 4:
            t = [_SBOX[b] for b in t]
        w.extend(w[4 * (i - nk) + j] ^ t[j] for j in range(4))
    return w, nr


def _xtime(a):
    return ((a << 1) ^ 0x1b) & 0xff if a & 0x80 else (a << 1) & 0xff


def _aes_block(key, block, w, nr):
    s = [block[i] ^ w[i] for i in range(16)]

    def sub_shift(st):
        st = [_SBOX[b] for b in st]
        return [st[(i % 4) + 4 * ((i // 4 + i % 4) % 4)] for i in range(16)]

    for rnd in range(1, nr):
        s = sub_shift(s)
        mixed = [0] * 16
        for c in range(4):
            a = s[4 * c:4 * c + 4]
            mixed[4 * c + 0] = _xtime(a[0]) ^ (_xtime(a[1]) ^ a[1]) ^ a[2] ^ a[3]
            mixed[4 * c + 1] = a[0] ^ _xtime(a[1]) ^ (_xtime(a[2]) ^ a[2]) ^ a[3]
            mixed[4 * c + 2] = a[0] ^ a[1] ^ _xtime(a[2]) ^ (_xtime(a[3]) ^ a[3])
            mixed[4 * c + 3] = (_xtime(a[0]) ^ a[0]) ^ a[1] ^ a[2] ^ _xtime(a[3])
        s = [mixed[i] ^ w[16 * rnd + i] for i in range(16)]
    s = sub_shift(s)
    return bytes(s[i] ^ w[16 * nr + i] for i in range(16))


def _aes_ctr(key, data):
    # Abyss 约定：counter 初值 = key 的前 16 字节，128 位整体递增
    w, nr = _expand_key(key)
    out = bytearray()
    ctr = int.from_bytes(key[:16], "big")
    for off in range(0, len(data), 16):
        stream = _aes_block(key, ctr.to_bytes(16, "big"), w, nr)
        chunk = data[off:off + 16]
        out.extend(b ^ stream[i] for i, b in enumerate(chunk))
        ctr += 1
    return bytes(out)


def _aes_ctr_at(key, data, abs_start):
    # 从文件绝对偏移 abs_start 处开始的 CTR 解密（counter 按块推进）
    w, nr = _expand_key(key)
    out = bytearray()
    base = int.from_bytes(key[:16], "big")
    skip = abs_start % 16
    ctr = base + abs_start // 16
    buf = data
    if skip:
        stream = _aes_block(key, ctr.to_bytes(16, "big"), w, nr)
        take = min(16 - skip, len(buf))
        out.extend(buf[i] ^ stream[skip + i] for i in range(take))
        buf = buf[take:]
        ctr += 1
    for off in range(0, len(buf), 16):
        stream = _aes_block(key, ctr.to_bytes(16, "big"), w, nr)
        chunk = buf[off:off + 16]
        out.extend(b ^ stream[i] for i, b in enumerate(chunk))
        ctr += 1
    return bytes(out)


def _abyss_key(text):
    # 播放器 expandKey：md5(输入) 的十六进制文本本身作密钥（32 字节 ASCII）
    return hashlib.md5(text.encode("utf-8")).hexdigest().encode("ascii")


try:
    from base.spider import Spider as SpiderBase
except ImportError:
    class SpiderBase(object):
        def getCache(self, key):
            return None

        def setCache(self, key, value):
            return "fail"

        def delCache(self, key):
            return "fail"


class Spider(SpiderBase):
    def __init__(self):
        super(Spider, self).__init__()
        self.host = "https://kbj.im"
        self.ua = ("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) "
                   "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 "
                   "Mobile/15E148 Safari/604.1")
        self.headers = {
            "User-Agent": self.ua,
            "Referer": self.host + "/",
            "Accept-Language": "zh-CN,zh;q=0.9,ko;q=0.8",
        }

    def getName(self):
        return "Korean BJ"

    def init(self, extend=""):
        pass

    # ---------- 基础请求 ----------
    def _fetch(self, url):
        import requests
        last = None
        for _ in range(3):
            try:
                r = requests.get(url, headers=self.headers, timeout=15, verify=False)
                if r.status_code == 200 and r.text:
                    r.encoding = "utf-8"
                    return r.text
                last = Exception("HTTP %s" % r.status_code)
            except Exception as e:
                last = e
        raise last if last else Exception("fetch failed")

    # ---------- 列表解析 ----------
    def _parse_list(self, html):
        # 条目结构：封面链接(img) + <time>日期 + 标题链接(h2)
        pat = re.compile(
            r'href="(https://kbj\.im/posts/[a-z0-9]+)"[^>]*>\s*'
            r'<img[^>]*src="([^"]+)"[^>]*alt="([^"]*)".*?'
            r'<time datetime="([^"]*)"',
            re.S)
        vods, seen = [], set()
        for url, pic, title, date in pat.findall(html or ""):
            if url in seen:
                continue
            seen.add(url)
            # 封面统一用原站直链（wp 图床地址剥掉前缀）
            pic = re.sub(r'^https://i\d\.wp\.com/', 'https://', pic)
            vods.append({
                "vod_id": url,
                "vod_name": title.strip(),
                "vod_pic": pic,
                "vod_remarks": date,
            })
        return vods

    # ---------- 接口 ----------
    def homeContent(self, filter=False):
        html = self._fetch(self.host + "/")
        classes = [{"type_id": "", "type_name": "最新"}]
        seen = set()
        for tag in re.findall(r'href="https://kbj\.im/tags/([^"/]+)"', html):
            tag = tag.strip()
            if tag and tag not in seen:
                seen.add(tag)
                classes.append({"type_id": tag, "type_name": tag})
        return {"class": classes, "list": self._parse_list(html)}

    def categoryContent(self, tid, pg, filter, extend):
        pg = int(pg) if str(pg).isdigit() else 1
        if tid:
            url = "%s/tags/%s?page=%d" % (self.host, tid, pg)
        else:
            url = "%s/?page=%d" % (self.host, pg)
        html = self._fetch(url)
        vods = self._parse_list(html)
        return {
            "list": vods,
            "page": pg,
            "pagecount": pg + 1 if vods else pg,
            "limit": len(vods),
            "total": 9999,
        }

    def detailContent(self, ids):
        url = ids[0]
        html = self._fetch(url)
        title = ""
        m = re.search(r'<title>([^<]+)\|\s*Korean BJ</title>', html)
        if m:
            title = m.group(1).strip()
        if not title:
            m = re.search(r'<h1[^>]*>([^<]+)</h1>', html)
            title = m.group(1).strip() if m else url
        pic = ""
        m = re.search(r'https://kbj\.im/images/[a-z0-9]+\.jpg', html)
        if m:
            pic = m.group(0)
        date = ""
        m = re.search(r'<time datetime="([^"]*)"', html)
        if m:
            date = m.group(1)
        # 播放源：详情页 data-url 外链播放器；站内叫法 AB=abyssplayer、BI=bysetayico
        embeds = []
        for e in re.findall(r'data-url="(https?://[^"]+)"', html):
            if e not in embeds:
                embeds.append(e)
        embeds.sort(key=lambda e: 0 if "abyssplayer" in e else 1)
        play_from, play_url = [], []
        for e in embeds:
            play_from.append("AB" if "abyssplayer" in e else "BI")
            play_url.append("播放$%s" % e)
        vod = {
            "vod_id": url,
            "vod_name": title,
            "vod_pic": pic,
            "vod_remarks": date,
            "vod_content": title,
            "vod_play_from": "$$$".join(play_from),
            "vod_play_url": "$$$".join(play_url),
        }
        return {"list": [vod]}

    def searchContent(self, key, quick, pg="1"):
        pg = int(pg) if str(pg).isdigit() else 1
        from urllib.parse import quote
        url = "%s/search/%s?page=%d" % (self.host, quote(key), pg)
        html = self._fetch(url)
        return {"list": self._parse_list(html), "page": pg}

    # ---------- Abyss 播放器解析（解密 datas 的 media，拿真实文件地址） ----------
    def _abyss_source(self, embed):
        html = self._fetch(embed)
        m = re.search(r"""datas\s*=\s*["']([A-Za-z0-9+/=]+)["']""", html)
        if not m:
            raise Exception("datas 未找到")
        datas = json.loads(base64.b64decode(m.group(1)).decode("latin-1"))
        slug = str(datas["slug"])
        md5_id = str(datas["md5_id"])
        user_id = str(datas["user_id"])
        media = datas["media"]
        media_bytes = bytes(ord(c) & 0xff for c in media)
        plain = _aes_ctr(_abyss_key("%s:%s:%s" % (user_id, slug, md5_id)), media_bytes)
        mp4 = json.loads(plain.decode("utf-8"))["mp4"]
        sources = [x for x in mp4.get("sources", []) if x.get("status") and x.get("url") and x.get("path")]
        if not sources:
            raise Exception("无可用清晰度")
        pref = {"720p": 0, "1080p": 1, "480p": 2}
        sources.sort(key=lambda x: (pref.get(x.get("label"), 3), -(x.get("res_id") or 0)))
        src = sources[0]
        return src["url"].rstrip("/") + "/" + src["path"]

    # ---------- 本地流服务：拉 CDN 流，仅解密文件头 16KB（Abyss 的加密方式） ----------
    def _ensure_server(self):
        if getattr(self, "_port", 0):
            return self._port
        import threading
        from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
        from urllib.parse import urlparse, parse_qs
        spider = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def do_GET(self):
                q = parse_qs(urlparse(self.path).query)
                target = (q.get("u") or [""])[0]
                if not target:
                    self.send_response(404)
                    self.end_headers()
                    return
                tail = target.rsplit("/", 1)[-1]
                key = _abyss_key(tail)
                rng = self.headers.get("Range") or ""
                start = 0
                m2 = re.match(r"bytes=(\d+)-", rng)
                if m2:
                    start = int(m2.group(1))
                import requests
                uh = {"User-Agent": spider.ua, "Referer": "https://abyssplayer.com/"}
                if rng:
                    uh["Range"] = rng
                try:
                    up = requests.get(target, headers=uh, timeout=30, verify=False, stream=True)
                except Exception:
                    self.send_response(502)
                    self.end_headers()
                    return
                self.send_response(up.status_code)
                for h in ("Content-Type", "Content-Length", "Content-Range", "Accept-Ranges"):
                    if up.headers.get(h):
                        self.send_header(h, up.headers[h])
                if "Content-Type" not in up.headers:
                    self.send_header("Content-Type", "video/mp4")
                self.end_headers()
                pos = start
                try:
                    for chunk in up.iter_content(65536):
                        if not chunk:
                            continue
                        if pos < 16384:  # 与加密区有交叠的部分才解密
                            n = min(len(chunk), 16384 - pos)
                            chunk = _aes_ctr_at(key, chunk[:n], pos) + chunk[n:]
                        self.wfile.write(chunk)
                        pos += len(chunk)
                except Exception:
                    pass
                finally:
                    up.close()

        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self._port = server.server_address[1]
        t = threading.Thread(target=server.serve_forever, daemon=True)
        t.start()
        return self._port

    def playerContent(self, flag, id, vipFlags):
        if flag == "AB" or "abyssplayer" in id:
            try:
                full = self._abyss_source(id)
                port = self._ensure_server()
                from urllib.parse import quote
                return {
                    "parse": 0,
                    "url": "http://127.0.0.1:%d/play?u=%s" % (port, quote(full, safe="")),
                    "header": {"User-Agent": self.ua},
                }
            except Exception:
                pass  # 解析失败回退嗅探，不返回空
        return {
            "parse": 1,
            "url": id,
            "header": {"User-Agent": self.ua, "Referer": self.host + "/"},
        }

    def localProxy(self, param):
        return None

    def isVideoFormat(self, url):
        return False

    def manualVideoCheck(self):
        return False

    def destroy(self):
        pass
