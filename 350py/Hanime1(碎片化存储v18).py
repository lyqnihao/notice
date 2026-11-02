# coding=utf-8
import sys
import re
import json
import base64
import urllib.request
import urllib.parse
import http.cookiejar
import gzip
import zlib
import ssl
import html as html_lib
import time
import concurrent.futures

try:
    from base.spider import Spider as SpiderBase
except ImportError:
    class SpiderBase(object):
        def getCache(self, key): return None
        def setCache(self, key, value): return "fail"
        def delCache(self, key): return "fail"

class Spider(SpiderBase):
    
    def __init__(self):
        super(Spider, self).__init__()
        self.navUrls = ["https://x99dh.cc/", "https://x99dh.one/"]
        self.siteName = "Hanime1"
        
        # V18 缓存架构 (全新碎片化隔离键名)
        self.cacheKey = "h1_current_v18"    
        self.poolKey = "h1_pool_v18"        
        self.scorePrefix = "h1_score_v18_"  
        
        self.defaultPool = [
            "https://www.hanime999.cc",
            "https://www.hanime123.org",
            "https://www.hanime2.one"
        ]
        self.siteUrl = self.defaultPool[0]
        
        self._ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"

        self.ctx = ssl.create_default_context()
        self.ctx.check_hostname = False
        self.ctx.verify_mode = ssl.CERT_NONE
        try:
            self.ctx.set_ciphers("DEFAULT@SECLEVEL=1")
        except Exception:
            pass

        self.cj = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(self.cj),
            urllib.request.HTTPSHandler(context=self.ctx)
        )

    def getName(self):
        return "Hanime1(碎片化存储v18)"

    def init(self, extend=""):
        self._clean_dead_nodes_on_startup()
        cached_site = self.getCache(self.cacheKey)
        if cached_site and str(cached_site).startswith("http"):
            self.siteUrl = str(cached_site).strip().rstrip("/")
        else:
            self.siteUrl = self.defaultPool[0]
        return True

    # =======================================================
    # 波段计分
    # =======================================================
    def _get_node_key(self, url):
        return self.scorePrefix + urllib.parse.urlparse(url).netloc.replace(".", "_").replace(":", "_")

    def _get_score(self, url):
        try:
            val = self.getCache(self._get_node_key(url))
            return int(val) if val else 0
        except Exception: return 0

    def _update_score(self, url, delta, force_set=False):
        try:
            current = self._get_score(url)
            if force_set:
                new_score = delta
            else:
                if delta > 0 and current < 0: current = 0 
                new_score = current + delta
                
            if new_score > 99: new_score = 99
            if new_score < -15: new_score = -15
            self.setCache(self._get_node_key(url), str(new_score))
        except Exception: pass

    # =======================================================
    # V18 核心修复：彻底抛弃 JSON 的“碎片化”连接池
    # =======================================================
    def _get_active_pool(self):
        try:
            # 读取池子里的总数
            count_str = self.getCache(self.poolKey + "_count")
            if not count_str or not count_str.isdigit():
                self._save_active_pool(self.defaultPool)
                return list(self.defaultPool)
            
            count = int(count_str)
            pool = []
            # 碎片化读取：逐个去数据库里拿域名，完美避开长度限制
            for i in range(count):
                val = self.getCache(f"{self.poolKey}_{i}")
                if val and str(val).startswith("http"):
                    pool.append(str(val).strip())
                    
            if not pool:
                return list(self.defaultPool)
            return pool
        except Exception: 
            return list(self.defaultPool)

    def _save_active_pool(self, pool):
        try:
            # 碎片化写入：先写总数，再逐条存入短字符串
            self.setCache(self.poolKey + "_count", str(len(pool)))
            for i, url in enumerate(pool):
                self.setCache(f"{self.poolKey}_{i}", url)
        except Exception:
            pass

    def _clean_dead_nodes_on_startup(self):
        try:
            pool = self._get_active_pool()
            alive_pool = [u for u in pool if self._get_score(u) > -15]
            if not alive_pool: alive_pool = list(self.defaultPool)
            if len(alive_pool) != len(pool):
                self._save_active_pool(alive_pool)
        except Exception: pass

    # =======================================================
    # 并发测速与扩容雷达
    # =======================================================
    def _speed_test_one(self, domain):
        url = f"{domain}/status.html"
        req = urllib.request.Request(url, headers={"User-Agent": self._ua})
        start_t = time.time()
        try:
            resp = urllib.request.urlopen(req, context=self.ctx, timeout=3.0)
            if resp.getcode() == 200 and b'ok' in resp.read(100).lower():
                return domain, int((time.time() - start_t) * 1000)
        except Exception: pass
        return domain, 9999

    def _manual_sniff_and_replenish(self):
        cand_urls = []
        headers = {"User-Agent": self._ua}
        
        for nav in self.navUrls:
            req = urllib.request.Request(nav, headers=headers)
            html = ""
            try:
                resp = urllib.request.urlopen(req, context=self.ctx, timeout=10)
                html = resp.read().decode("utf-8", errors="ignore")
            except urllib.error.HTTPError as e:
                html = e.read().decode("utf-8", errors="ignore")
            except Exception:
                continue
                
            if html:
                blocks = re.findall(r'["\']([A-Za-z0-9+/=]{200,})["\']', html)
                for b in blocks:
                    try:
                        decoded = base64.b64decode(b).decode("utf-8", errors="ignore")
                        unquoted = urllib.parse.unquote(decoded)
                        if 'hanime' in unquoted.lower():
                            urls = re.findall(r'https?://[^\s"\'<>]+', unquoted)
                            for u in urls:
                                if 'hanime' in u.lower():
                                    base_url_match = re.match(r'https?://[^/]+', u)
                                    if base_url_match:
                                        base_url = base_url_match.group(0)
                                        if base_url not in cand_urls: 
                                            cand_urls.append(base_url)
                    except Exception: pass
            if cand_urls: break
            
        if not cand_urls:
            return 0, "⚠️ 抓取被拦截，未获取到新节点"

        results = []
        try:
            with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
                future_to_url = {executor.submit(self._speed_test_one, u): u for u in cand_urls}
                for future in concurrent.futures.as_completed(future_to_url):
                    results.append(future.result())
        except Exception as e:
            return 0, f"⚠️ 测速异常: {str(e)[:15]}"

        valid_results = [r for r in results if r[1] < 9999]
        valid_results.sort(key=lambda x: x[1])

        if not valid_results:
            return 0, "⚠️ 节点抓取成功，但测速全部超时"

        added_count = 0
        pool = self._get_active_pool()
        for url, delay in valid_results[:10]:
            if url not in pool and self._get_score(url) > -15:
                pool.append(url)
                # 注射 80 分，让它霸榜
                self._update_score(url, 80, force_set=True)
                added_count += 1
                
        if added_count > 0:
            self._save_active_pool(pool)
            
        return added_count, f"✅ 成功洗牌！新增 {added_count} 条极速节点"

    # =======================================================
    # 极简断流请求
    # =======================================================
    def _fetch(self, target_url, referer=""):
        if not target_url: return {"code": 0, "text": ""}
        if target_url.startswith("//"): target_url = "https:" + target_url
        elif target_url.startswith("/"): target_url = self.siteUrl + target_url

        headers = {"User-Agent": self._ua, "Referer": referer if referer else (self.siteUrl + "/"), "Accept-Encoding": "gzip, deflate"}
        try:
            req = urllib.request.Request(target_url, headers=headers)
            with self.opener.open(req, timeout=3.5) as resp:
                raw = resp.read()
                enc = getattr(resp, "headers", {}).get("Content-Encoding", "")
                if raw.startswith(b"\x1f\x8b") or enc == "gzip": raw = gzip.decompress(raw)
                elif enc == "deflate":
                    try: raw = zlib.decompress(raw)
                    except Exception: raw = zlib.decompress(raw, -zlib.MAX_WBITS)
                try: text = raw.decode("utf-8")
                except Exception: text = raw.decode("latin1", errors="ignore")
                return {"code": resp.getcode(), "text": text}
        except urllib.error.HTTPError as e:
            return {"code": getattr(e, 'code', -1), "text": ""}
        except Exception:
            return {"code": -1, "text": ""}

    # =======================================================
    # UI 与菜单：透视眼镜模式
    # =======================================================
    def homeContent(self, filter):
        result = {}
        classes = [
            {"type_name": "里番", "type_id": "裏番"}, {"type_name": "泡面番", "type_id": "泡麵番"},
            {"type_name": "Motion Anime", "type_id": "Motion Anime"}, {"type_name": "3DCG", "type_id": "3DCG"},
            {"type_name": "2.5D", "type_id": "2.5D"}, {"type_name": "AI生成", "type_id": "AI生成"},
            {"type_name": "MMD", "type_id": "MMD"}, {"type_name": "Cosplay", "type_id": "Cosplay"},
            {"type_name": "新番预告", "type_id": "新番預告"}, {"type_name": "2D动画", "type_id": "2D動畫"}
        ]
        
        sort_filter = {
            "key": "sort", "name": "排序方式",
            "value": [
                {"n": "最新上传", "v": ""}, {"n": "本日排行", "v": "本日排行"},
                {"n": "本週排行", "v": "本週排行"}, {"n": "本月排行", "v": "本月排行"}
            ]
        }
        
        pool = self._get_active_pool()
        if self.siteUrl not in pool:
            pool.append(self.siteUrl)
            
        sorted_pool = sorted(pool, key=lambda x: self._get_score(x), reverse=True)
        if self.siteUrl in sorted_pool:
            sorted_pool.remove(self.siteUrl)
        sorted_pool.insert(0, self.siteUrl)

        node_choices = [
            {"n": "自动优选(默认)", "v": ""},
            {"n": "🚀 更新线路", "v": "ACTION_MANUAL_SNIFF"}
        ]
        
        for idx, url in enumerate(sorted_pool):
            score = self._get_score(url)
            mark = "★ " if url == self.siteUrl else ""
            node_choices.append({"n": f"{mark}线路 {idx + 1} ({score}分)", "v": url})
            
        node_filter = {
            "key": "node",
            "name": f"切换线路(存活{len(sorted_pool)}条)",
            "value": node_choices
        }
        
        result['class'] = classes
        result['filters'] = {c["type_id"]: [sort_filter, node_filter] for c in classes}
        return result

    def categoryContent(self, tid, pg, filter, extend):
        page_num = int(pg) if str(pg).isdigit() else 1
        
        target_node = extend.get("node", "")
        if target_node == "ACTION_MANUAL_SNIFF":
            added_count, log_msg = self._manual_sniff_and_replenish()
            return {
                "list": [{"vod_id": "empty", "vod_name": "✅ 扩容执行完毕！请退回上级重进查看结果", "vod_pic": "", "vod_remarks": log_msg}],
                "page": 1, "pagecount": 1, "limit": 40, "total": 1
            }
            
        if target_node and target_node.startswith("http"):
            if target_node != self.siteUrl:
                self.siteUrl = target_node

        query_params = {"genre": tid, "page": str(page_num)}
        if extend.get("sort"): query_params["sort"] = extend.get("sort")
        target_url = f"/search?{urllib.parse.urlencode(query_params)}"
        res = self._fetch(target_url)
        html = res.get("text", "")
        
        videos = []
        seen_ids = set()
        
        if res.get("code") == 200 and html:
            blocks = html.split('/watch?v=')
            for block in blocks[1:]:
                id_match = re.match(r'^([^"&]+)', block)
                if not id_match: continue
                vod_id = id_match.group(1)
                
                if vod_id in seen_ids: continue
                seen_ids.add(vod_id)
                
                chunk = block[:1200]
                pic_match = re.search(r'<img[^>]+src=["\']([^"\']+)["\']', chunk, re.IGNORECASE)
                pic = pic_match.group(1) if pic_match else ""
                
                title = "未知标题"
                t_match_b = re.search(r'home-rows-videos-title[^>]*>\s*([^<]+)', chunk)
                if t_match_b: title = t_match_b.group(1).strip()
                else:
                    t_match_a = re.search(r'class="title"[^>]*>\s*([^<]+)', chunk)
                    if t_match_a: title = t_match_a.group(1).strip()

                remarks_list = []
                duration_match = re.search(r'class="duration"[^>]*>\s*([^<]+)\s*</div>', chunk)
                if duration_match: remarks_list.append(duration_match.group(1).strip())
                    
                views_match = re.search(r'class="stat-item">\s*([0-9\.]+万?次)\s*</div>', chunk)
                if views_match: remarks_list.append(views_match.group(1).strip())
                    
                packed_id = f"{vod_id}@@@{title}@@@{pic}"
                videos.append({
                    "vod_id": packed_id, "vod_name": title, "vod_pic": pic, "vod_remarks": " | ".join(remarks_list)
                })

        if videos:
            self.setCache(self.cacheKey, self.siteUrl) 
            self._update_score(self.siteUrl, 5) 
        else:
            self._update_score(self.siteUrl, -5)
            
            safe_node = self.getCache(self.cacheKey)
            if safe_node and str(safe_node).startswith("http"):
                self.siteUrl = str(safe_node).strip()
            else:
                self.siteUrl = self.defaultPool[0]
                
            videos.append({"vod_id": "empty_error", "vod_name": "⚠️ 节点失效，请退回列表重新选择线路", "vod_pic": "", "vod_remarks": "提示"})

        return {"list": videos, "page": page_num, "pagecount": page_num + 1 if len(videos) >= 30 else page_num, "limit": 40, "total": 999999}

    def detailContent(self, array):
        raw_id = array[0] if isinstance(array, list) else str(array)
        if "empty_error" in raw_id:
            return {'list': [{"vod_id": "empty_error", "vod_name": "⚠️ 节点连接失败", "vod_pic": "", "vod_content": "请退回上一层列表，并切换至其他存活的备用线路。", "vod_play_from": "提示", "vod_play_url": "点此无用$http://error.mp4"}]}
            
        passed_title = ""
        passed_pic = ""
        if "@@@" in raw_id:
            parts = raw_id.split("@@@")
            vod_id = parts[0]
            if len(parts) > 1: passed_title = parts[1]
            if len(parts) > 2: passed_pic = parts[2]
        else: vod_id = raw_id
            
        res = self._fetch(f"/watch?v={vod_id}")
        html = res.get("text", "")

        title = passed_title
        if not title:
            title_match = re.search(r'<title>(.*?)</title>', html)
            title = re.split(r'&nbsp;-|-', title_match.group(1))[0].strip() if title_match else vod_id

        pic = passed_pic
        if not pic:
            pic_match = re.search(r'<meta property="og:image" content="([^"]+)"', html)
            pic = pic_match.group(1) if pic_match else ""

        desc_m = re.search(r'<meta[^>]*property=["\']og:description["\'][^>]*content=["\']([^"\']+)["\']', html, re.IGNORECASE)
        if not desc_m: desc_m = re.search(r'<meta[^>]*name=["\']description["\'][^>]*content=["\']([^"\']+)["\']', html, re.IGNORECASE)
        raw_desc = html_lib.unescape(desc_m.group(1).strip()) if desc_m else "Hanime 动漫原画精品"
        
        full_desc = f"【当前极速优选节点: {self.siteUrl}】\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n{raw_desc}"

        source_matches = re.findall(r'<source[^>]+src=["\']([^"\']+)["\']', html, re.IGNORECASE)
        parsed_links = []
        for link in set(source_matches):
            res_match = re.search(r'(\d+p)', link, re.IGNORECASE)
            if res_match: parsed_links.append((int(res_match.group(1)[:-1]), res_match.group(1).upper(), link))
            else: parsed_links.append((0, "默认画质", link))
            
        parsed_links.sort(key=lambda x: x[0], reverse=True)
        play_url = "#".join([f"{item[1]}${item[2]}" for item in parsed_links]) if parsed_links else "解析失败$http://错误.mp4"
        play_from = "🎬 原画直连 (秒播)"

        seen_eps = set([str(vod_id)])
        related_list = []
        ep_counter = 1
        
        for block in html.split('/watch?v=')[1:]:
            id_match = re.match(r'^([^"&]+)', block)
            if not id_match: continue
            r_id = id_match.group(1)
            if r_id in seen_eps: continue
            seen_eps.add(r_id)
            
            chunk = block[:1200]
            clean_name = ""
            t_match_b = re.search(r'home-rows-videos-title[^>]*>\s*([^<]+)', chunk)
            if t_match_b: clean_name = t_match_b.group(1).strip()
            else:
                t_match_a = re.search(r'class="title"[^>]*>\s*([^<]+)', chunk)
                if t_match_a: clean_name = t_match_a.group(1).strip()
                    
            if not clean_name:
                alt_match = re.search(r'(?:title|alt)=["\']([^"\']+)["\']', chunk, re.I)
                if alt_match: clean_name = alt_match.group(1).strip()
                    
            if clean_name.lower() in ["", "thumb", "thum", "img"]: clean_name = f"推荐 {ep_counter:02d}"
                
            related_list.append(f"{html_lib.unescape(clean_name)}$/watch?v={r_id}")
            ep_counter += 1
            if len(related_list) >= 30: break

        if related_list:
            play_from += "$$$📺 相关推荐 (连播)"
            play_url += "$$$" + "#".join(related_list)

        return {'list': [{"vod_id": vod_id, "vod_name": title, "vod_pic": pic, "vod_type": "通用分类", "vod_remarks": "高清", "vod_director": "YJ-Gemini", "vod_content": full_desc.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"), "vod_play_from": play_from, "vod_play_url": play_url}]}

    def searchContent(self, key, quick, pg="1"):
        page_num = int(pg) if str(pg).isdigit() else 1
        target_url = f"/search?query={urllib.parse.quote(key)}&page={page_num}"
        res = self._fetch(target_url)
        html = res.get("text", "")
        
        videos = []
        seen_ids = set()
        for block in html.split('/watch?v=')[1:]:
            id_match = re.match(r'^([^"&]+)', block)
            if not id_match: continue
            vod_id = id_match.group(1)
            if vod_id in seen_ids: continue
            seen_ids.add(vod_id)
            
            chunk = block[:1200]
            pic_match = re.search(r'<img[^>]+src=["\']([^"\']+)["\']', chunk, re.IGNORECASE)
            pic = pic_match.group(1) if pic_match else ""
            
            title = "未知标题"
            t_match_b = re.search(r'home-rows-videos-title[^>]*>\s*([^<]+)', chunk)
            if t_match_b: title = t_match_b.group(1).strip()
            else:
                t_match_a = re.search(r'class="title"[^>]*>\s*([^<]+)', chunk)
                if t_match_a: title = t_match_a.group(1).strip()

            videos.append({"vod_id": f"{vod_id}@@@{title}@@@{pic}", "vod_name": title, "vod_pic": pic, "vod_remarks": "相关结果"})
            
        if not videos: videos.append({"vod_id": "empty_error", "vod_name": "未找到或节点失效", "vod_pic": "", "vod_remarks": "请重试"})
        return {"list": videos, "page": page_num, "pagecount": page_num + 1 if len(videos) >= 30 else page_num, "limit": 40, "total": 999999}

    def playerContent(self, flag, id, vipFlags):
        play_url = id
        if id.startswith('/watch?v='):
            res = self._fetch(id)
            html = res.get("text", "")
            src_matches = re.findall(r'<source[^>]*src=["\']([^"\']+)["\']', html, re.I)
            if src_matches:
                p1080 = [u for u in src_matches if "1080p" in u.lower()]
                play_url = p1080[0] if p1080 else src_matches[0]
            else:
                all_mp4 = re.findall(r'["\'](https?:[^"\']+\.mp4[^"\']*)["\']', html, re.I)
                if all_mp4: play_url = all_mp4[0]
                
        return {"parse": 0, "playUrl": "", "url": play_url, "header": {"User-Agent": self._ua, "Referer": self.siteUrl + "/"}}
