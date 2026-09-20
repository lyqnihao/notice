/* =========================================================
 * 潮汐 TIDEFLOW · 源池与各源适配器
 * 统一产出 normalized item：
 * { key, id, title, desc, thumb, direct, needResolve, assetRef,
 *   source, sourceId, categories[], tags[], actors[], studio,
 *   series, date, duration, width, height, mime }
 * ========================================================= */

/* ==================== 静态样片目录 ==================== */
/* 本地封面位于 assets/posters/，直链为公开可访问的免费样片 */
const STATIC_CATALOG = [
  { key: 'w3c:bunny', title: 'Big Buck Bunny 预告片（Blender 开源电影）', desc: 'Blender 基金会出品的开源动画电影预告片，一只大兔子的复仇记。',
    direct: 'https://media.w3.org/2010/05/bunny/trailer.mp4', thumb: 'assets/posters/bunny_trailer.jpg',
    source: 'W3C 影音', sourceId: 'w3c', categories: ['动画', '喜剧'], tags: ['开源电影', '动画', '喜剧'],
    actors: ['Blender 团队'], studio: 'Blender 基金会', series: 'Blender 开源电影', duration: 33, width: 1280, height: 720, date: '2008-01-01', mime: 'video/mp4' },
  { key: 'w3c:sintel', title: 'Sintel 预告片（Blender 开源电影）', desc: 'Blender 基金会第三部开源电影《Sintel》预告片，少女与幼龙的故事。',
    direct: 'https://media.w3.org/2010/05/sintel/trailer.webm', thumb: 'assets/posters/sintel_trailer.jpg',
    source: 'W3C 影音', sourceId: 'w3c', categories: ['动画', '奇幻'], tags: ['开源电影', '动画', '奇幻'],
    actors: ['Blender 团队'], studio: 'Blender 基金会', series: 'Blender 开源电影', duration: 52, width: 1280, height: 544, date: '2010-01-01', mime: 'video/webm' },
  { key: 'w3c:movie300', title: 'W3C 短片 movie_300（编码测试片）', desc: 'W3C 媒体标准测试短片，用于检验播放器编码兼容性。',
    direct: 'https://media.w3.org/2010/05/video/movie_300.mp4', thumb: 'assets/posters/movie_300.jpg',
    source: 'W3C 影音', sourceId: 'w3c', categories: ['短片', '测试样片'], tags: ['编码测试', '短片'],
    actors: [], studio: 'W3C', series: '媒体测试片', duration: 300, width: 1280, height: 720, date: '2010-01-01', mime: 'video/mp4' },
  { key: 'tv:bunny720', title: 'Big Buck Bunny 720p 10 秒样片', desc: 'Big Buck Bunny 720p 测试样片（10 秒 / 2MB）。',
    direct: 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_2MB.mp4', thumb: 'assets/posters/tv_bunny.jpg',
    source: 'TestVideos', sourceId: 'testvideos', categories: ['动画', '测试样片'], tags: ['720p', 'H.264', '样片'],
    actors: [], studio: 'test-videos.co.uk', series: '样片合集', duration: 10, width: 1280, height: 720, date: '2019-01-01', mime: 'video/mp4' },
  { key: 'tv:bunny1080', title: 'Big Buck Bunny 1080p 10 秒样片', desc: 'Big Buck Bunny 1080p 测试样片（10 秒 / 1MB）。',
    direct: 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/1080/Big_Buck_Bunny_1080_10s_1MB.mp4', thumb: 'assets/posters/tv_bunny1080.jpg',
    source: 'TestVideos', sourceId: 'testvideos', categories: ['动画', '测试样片'], tags: ['1080p', 'H.264', '样片'],
    actors: [], studio: 'test-videos.co.uk', series: '样片合集', duration: 10, width: 1920, height: 1080, date: '2019-01-01', mime: 'video/mp4' },
  { key: 'tv:jelly1080', title: '水母 Jellyfish 1080p 10 秒样片', desc: '水母游弋的 1080p 测试样片（10 秒 / 1MB），自然影像。',
    direct: 'https://test-videos.co.uk/vids/jellyfish/mp4/h264/1080/Jellyfish_1080_10s_1MB.mp4', thumb: 'assets/posters/tv_jelly.jpg',
    source: 'TestVideos', sourceId: 'testvideos', categories: ['自然', '测试样片'], tags: ['水母', '1080p', '自然'],
    actors: [], studio: 'test-videos.co.uk', series: '样片合集', duration: 10, width: 1920, height: 1080, date: '2019-01-01', mime: 'video/mp4' },
  { key: 'tv:jelly720', title: '水母 Jellyfish 720p 10 秒样片', desc: '水母游弋的 720p 测试样片（10 秒 / 2MB）。',
    direct: 'https://test-videos.co.uk/vids/jellyfish/mp4/h264/720/Jellyfish_720_10s_2MB.mp4', thumb: 'assets/posters/tv_jelly720.jpg',
    source: 'TestVideos', sourceId: 'testvideos', categories: ['自然', '测试样片'], tags: ['水母', '720p', '自然'],
    actors: [], studio: 'test-videos.co.uk', series: '样片合集', duration: 10, width: 1280, height: 720, date: '2019-01-01', mime: 'video/mp4' },
  { key: 'tv:sintel720', title: 'Sintel 720p 10 秒样片', desc: '《Sintel》720p 测试样片（10 秒 / 2MB）。',
    direct: 'https://test-videos.co.uk/vids/sintel/mp4/h264/720/Sintel_720_10s_2MB.mp4', thumb: 'assets/posters/tv_sintel.jpg',
    source: 'TestVideos', sourceId: 'testvideos', categories: ['动画', '奇幻', '测试样片'], tags: ['720p', 'H.264', '样片'],
    actors: [], studio: 'test-videos.co.uk', series: '样片合集', duration: 10, width: 1280, height: 720, date: '2019-01-01', mime: 'video/mp4' },
  { key: 'tv:sintel1080', title: 'Sintel 1080p 10 秒样片', desc: '《Sintel》1080p 测试样片（10 秒 / 1MB）。',
    direct: 'https://test-videos.co.uk/vids/sintel/mp4/h264/1080/Sintel_1080_10s_1MB.mp4', thumb: 'assets/posters/tv_sintel1080.jpg',
    source: 'TestVideos', sourceId: 'testvideos', categories: ['动画', '奇幻', '测试样片'], tags: ['1080p', 'H.264', '样片'],
    actors: [], studio: 'test-videos.co.uk', series: '样片合集', duration: 10, width: 1920, height: 1080, date: '2019-01-01', mime: 'video/mp4' },
  { key: 'fs:720', title: 'FileSamples 720p 样片', desc: '通用 1280x720 MP4 样片（约 1 秒循环内容，体积极小）。',
    direct: 'https://filesamples.com/samples/video/mp4/sample_1280x720.mp4', thumb: 'assets/posters/fs_720.jpg',
    source: 'FileSamples', sourceId: 'filesamples', categories: ['测试样片', '短片'], tags: ['720p', 'MP4'],
    actors: [], studio: 'filesamples.com', series: '格式样片', duration: 28, width: 1280, height: 720, date: '2020-01-01', mime: 'video/mp4' },
  { key: 'fs:360', title: 'FileSamples 360p 样片', desc: '通用 640x360 MP4 样片（约 1 秒循环内容，体积极小）。',
    direct: 'https://filesamples.com/samples/video/mp4/sample_640x360.mp4', thumb: 'assets/posters/fs_360.jpg',
    source: 'FileSamples', sourceId: 'filesamples', categories: ['测试样片', '短片'], tags: ['360p', 'MP4'],
    actors: [], studio: 'filesamples.com', series: '格式样片', duration: 13, width: 640, height: 360, date: '2020-01-01', mime: 'video/mp4' },
  { key: 'fs:540', title: 'FileSamples 540p 样片', desc: '通用 960x540 MP4 样片（约 1 秒循环内容，体积极小）。',
    direct: 'https://filesamples.com/samples/video/mp4/sample_960x540.mp4', thumb: 'assets/posters/fs_540.jpg',
    source: 'FileSamples', sourceId: 'filesamples', categories: ['测试样片', '短片'], tags: ['540p', 'MP4'],
    actors: [], studio: 'filesamples.com', series: '格式样片', duration: 13, width: 960, height: 540, date: '2020-01-01', mime: 'video/mp4' },
];

/* Google 示例库（候选源，封面走远程，失败自动降级占位图） */
const GOOGLE_SAMPLES = [
  { key: 'gs:bbb', title: 'Big Buck Bunny（Google 示例）', desc: 'Google GTV 官方示例视频：Big Buck Bunny。', direct: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4', thumb: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/BigBuckBunny.jpg', tags: ['动画', '示例'], sourceId: 'googlesamples', source: 'Google 示例', duration: 596, width: 1280, height: 720 },
  { key: 'gs:elephants', title: 'Elephants Dream（Google 示例）', desc: 'Google GTV 官方示例视频：Elephants Dream。', direct: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4', thumb: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/ElephantsDream.jpg', tags: ['动画', '示例'], sourceId: 'googlesamples', source: 'Google 示例', duration: 653, width: 1280, height: 720 },
  { key: 'gs:blazes', title: 'For Bigger Blazes（Google 示例）', desc: 'Google GTV 官方示例视频：For Bigger Blazes 广告短片。', direct: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4', thumb: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/ForBiggerBlazes.jpg', tags: ['短片', '示例'], sourceId: 'googlesamples', source: 'Google 示例', duration: 15, width: 1280, height: 720 },
  { key: 'gs:escapes', title: 'For Bigger Escapes（Google 示例）', desc: 'Google GTV 官方示例视频：For Bigger Escapes 广告短片。', direct: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4', thumb: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/ForBiggerEscapes.jpg', tags: ['短片', '示例'], sourceId: 'googlesamples', source: 'Google 示例', duration: 15, width: 1280, height: 720 },
  { key: 'gs:fun', title: 'For Bigger Fun（Google 示例）', desc: 'Google GTV 官方示例视频：For Bigger Fun 广告短片。', direct: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4', thumb: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/ForBiggerFun.jpg', tags: ['短片', '示例'], sourceId: 'googlesamples', source: 'Google 示例', duration: 60, width: 1280, height: 720 },
  { key: 'gs:joyrides', title: 'For Bigger Joyrides（Google 示例）', desc: 'Google GTV 官方示例视频：For Bigger Joyrides 广告短片。', direct: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4', thumb: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/ForBiggerJoyrides.jpg', tags: ['短片', '示例'], sourceId: 'googlesamples', source: 'Google 示例', duration: 15, width: 1280, height: 720 },
  { key: 'gs:meltdowns', title: 'For Bigger Meltdowns（Google 示例）', desc: 'Google GTV 官方示例视频：For Bigger Meltdowns 广告短片。', direct: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4', thumb: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/ForBiggerMeltdowns.jpg', tags: ['短片', '示例'], sourceId: 'googlesamples', source: 'Google 示例', duration: 15, width: 1280, height: 720 },
  { key: 'gs:sintel', title: 'Sintel（Google 示例）', desc: 'Google GTV 官方示例视频：Sintel 完整版。', direct: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4', thumb: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/Sintel.jpg', tags: ['动画', '示例'], sourceId: 'googlesamples', source: 'Google 示例', duration: 888, width: 1280, height: 720 },
  { key: 'gs:subaru', title: 'Subaru Outback 街拍（Google 示例）', desc: 'Google GTV 官方示例视频：Subaru Outback 户外试驾。', direct: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/SubaruOutbackOnStreetAndDirt.mp4', thumb: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/SubaruOutbackOnStreetAndDirt.jpg', tags: ['汽车', '示例'], sourceId: 'googlesamples', source: 'Google 示例', duration: 595, width: 1280, height: 720 },
  { key: 'gs:tears', title: 'Tears of Steel（Google 示例）', desc: 'Google GTV 官方示例视频：Tears of Steel 科幻短片。', direct: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4', thumb: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/TearsOfSteel.jpg', tags: ['科幻', '示例'], sourceId: 'googlesamples', source: 'Google 示例', duration: 734, width: 1280, height: 720 },
];

/* ==================== 各源适配器 ==================== */
const ADAPTERS = {

  /* ---------- NASA 影像库（API 源，元数据最全） ---------- */
  nasa: {
    type: 'api',
    async fetch(ctx) {
      const page = ctx.page || 1;
      let q = (ctx.query || '').trim();
      const catTerm = nasaCategoryTerm(ctx.category);
      if (catTerm) q = [q, catTerm].filter(Boolean).join(' ');
      if (!q) q = 'space';
      const url = 'https://images-api.nasa.gov/search?q=' + encodeURIComponent(q) +
        '&media_type=video&page=' + page + '&page_size=24';
      const res = await fetchWithTimeout(url, CONFIG.requestTimeout);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const coll = data.collection || {};
      const docs = coll.items || [];
      return docs.slice(0, 18).map((doc) => {
        const d = (doc.data && doc.data[0]) || {};
        const links = doc.links || [];
        const thumbLink = links.find((l) => l.rel === 'alternate' && l.render === 'image' && l.width >= 600) ||
          links.find((l) => l.rel === 'preview') || links[0];
        const tags = (d.keywords || []).slice(0, 10);
        const item = {
          key: 'nasa:' + d.nasa_id,
          id: d.nasa_id,
          title: d.title || '未命名 NASA 影像',
          desc: d.description || '',
          thumb: thumbLink ? thumbLink.href : '',
          direct: '',
          needResolve: true,
          assetRef: 'https://images-assets.nasa.gov/video/' + encodeURIComponent(d.nasa_id) + '/collection.json',
          source: 'NASA', sourceId: 'nasa',
          tags,
          actors: d.secondary_creator ? d.secondary_creator.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 3) : [],
          studio: d.center || '',
          series: d.album ? (Array.isArray(d.album) ? d.album[0] : d.album) : '',
          date: d.date_created ? d.date_created.slice(0, 10) : '',
          location: d.location || '',
          mime: 'video/mp4',
        };
        item.categories = inferCategory(item, '科学');
        return item;
      });
    },
    async test() {
      const t0 = performance.now();
      try {
        const res = await fetchWithTimeout(
          'https://images-api.nasa.gov/search?q=space&media_type=video&page=1&page_size=5', 10000);
        const data = await res.json();
        const total = (data.collection && data.collection.metadata) ? data.collection.metadata.total_hits : 0;
        let directOk = false;
        const first = data.collection && data.collection.items && data.collection.items[0];
        const id = first && first.data && first.data[0] && first.data[0].nasa_id;
        if (id) {
          for (const u of nasaCandidateUrls(id).slice(0, 3)) {
            if (await probeMediaUrl(u, 5000)) { directOk = true; break; }
          }
        }
        return { ok: true, latencyMs: Math.round(performance.now() - t0), count: total, directOk, note: directOk ? '接口与直链均可用' : '接口可用 · 直链探针未通过' };
      } catch (e) {
        return { ok: false, latencyMs: -1, count: 0, directOk: false, note: '接口不可达' };
      }
    },
  },

  /* ---------- W3C 影音（静态源） ---------- */
  w3c: staticAdapter('w3c', 'https://media.w3.org/2010/05/bunny/trailer.mp4'),
  testvideos: staticAdapter('testvideos', 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_2MB.mp4'),
  filesamples: staticAdapter('filesamples', 'https://filesamples.com/samples/video/mp4/sample_1280x720.mp4'),
  googlesamples: staticAdapter('googlesamples', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4'),

  /* ---------- Internet Archive 公版电影（API 源，候选） ---------- */
  archive: {
    type: 'api',
    async fetch(ctx) {
      const page = ctx.page || 1;
      const q = buildArchiveQuery(ctx);
      const params = new URLSearchParams();
      params.set('q', q);
      params.set('rows', '24');
      params.set('page', String(page));
      params.set('output', 'json');
      params.set('sort[]', 'downloads desc');
      ['identifier', 'title', 'date', 'subject', 'description', 'creator', 'collection'].forEach((f) => params.append('fl[]', f));
      const res = await fetchWithTimeout('https://archive.org/advancedsearch.php?' + params.toString(), CONFIG.requestTimeout);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const docs = (data.response && data.response.docs) || [];
      // 每页最多解析前 10 条的直接文件（避免请求过多）
      const batch = docs.slice(0, 10);
      const out = [];
      await Promise.all(batch.map(async (doc) => {
        try {
          const metaRes = await fetchWithTimeout('https://archive.org/metadata/' + encodeURIComponent(doc.identifier), 8000);
          const meta = await metaRes.json();
          const vfile = pickVideoFile(meta.files || []);
          if (!vfile) return;
          const tags = Array.isArray(doc.subject) ? doc.subject.slice(0, 8) : (doc.subject ? [doc.subject] : []);
          out.push({
            key: 'archive:' + doc.identifier,
            id: doc.identifier,
            title: doc.title || doc.identifier,
            desc: doc.description || '',
            thumb: 'https://archive.org/services/img/' + encodeURIComponent(doc.identifier),
            direct: 'https://archive.org/download/' + encodeURIComponent(doc.identifier) + '/' + encodeURIComponent(vfile.name),
            needResolve: false,
            source: 'Internet Archive', sourceId: 'archive',
            tags, actors: [],
            studio: Array.isArray(doc.creator) ? doc.creator[0] : (doc.creator || ''),
            series: Array.isArray(doc.collection) ? doc.collection[0] : (doc.collection || ''),
            date: doc.date || '',
            mime: vfile.name.endsWith('.webm') ? 'video/webm' : 'video/mp4',
            categories: ['电影', '纪录片'],
          });
        } catch (e) { /* 单条失败跳过 */ }
      }));
      return out;
    },
    async test() {
      const t0 = performance.now();
      try {
        const res = await fetchWithTimeout(
          'https://archive.org/advancedsearch.php?q=mediatype%3Amovies%20AND%20collection%3Afeature_films&rows=1&output=json', 10000);
        const data = await res.json();
        const num = (data.response && data.response.numFound) || 0;
        return { ok: true, latencyMs: Math.round(performance.now() - t0), count: num, directOk: false, note: '接口正常 · 直链需逐片解析' };
      } catch (e) {
        return { ok: false, latencyMs: -1, count: 0, directOk: false, note: '当前网络不可达（可加入源池后由体检判定）' };
      }
    },
  },

  /* ---------- Wikimedia Commons 精选（API 源，候选） ---------- */
  commons: {
    type: 'api',
    async fetch(ctx) {
      const page = ctx.page || 1;
      const api = 'https://commons.wikimedia.org/w/api.php';
      const params = new URLSearchParams();
      params.set('action', 'query');
      params.set('format', 'json');
      params.set('origin', '*');
      if (ctx.query) {
        params.set('generator', 'search');
        params.set('gsrsearch', ctx.query + ' filetype:video');
        params.set('gsrnamespace', '6');
        params.set('gsrlimit', '18');
        params.set('gsroffset', String((page - 1) * 18));
      } else {
        params.set('generator', 'categorymembers');
        params.set('gcmtitle', 'Category:Featured videos');
        params.set('gcmtype', 'file');
        params.set('gcmlimit', '18');
        params.set('gcmoffset', String((page - 1) * 18));
      }
      params.set('prop', 'videoinfo|imageinfo|categories');
      params.set('viprop', 'url|size|mime|derivatives');
      params.set('iiprop', 'url|thumburl|size');
      params.set('iiurlwidth', '640');
      params.set('cllimit', '8');
      const res = await fetchWithTimeout(api + '?' + params.toString(), CONFIG.requestTimeout);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const pages = data.query ? data.query.pages : {};
      const out = [];
      for (const p of Object.values(pages)) {
        const vi = (p.videoinfo && p.videoinfo[0]) || {};
        const ii = (p.imageinfo && p.imageinfo[0]) || {};
        if (!vi.url) continue;
        const derivs = vi.derivatives || [];
        const mp4 = derivs.filter((d) => /\.mp4$/i.test(d.src)).sort((a, b) => (b.width || 0) - (a.width || 0))[0];
        const webm = derivs.filter((d) => /\.webm$/i.test(d.src)).sort((a, b) => (b.width || 0) - (a.width || 0))[0];
        const direct = (mp4 || webm || {}).src || vi.url;
        const cats = (p.categories || []).map((c) => c.title.replace(/^Category:/, '')).slice(0, 5);
        out.push({
          key: 'commons:' + p.pageid,
          id: p.title,
          title: p.title.replace(/\.(webm|mp4|ogv|m4v)$/i, ''),
          desc: '',
          thumb: ii.thumburl || '',
          direct,
          needResolve: false,
          source: 'Wikimedia', sourceId: 'commons',
          tags: cats.length ? cats : ['Commons 精选'],
          actors: [], studio: 'Wikimedia Commons', series: '精选影像',
          date: '', width: (mp4 || webm || {}).width || vi.width || 0, height: (mp4 || webm || {}).height || vi.height || 0,
          mime: (mp4 || webm || {}).type || vi.mime || '',
          categories: ['纪录片', '短片'],
        });
      }
      return out;
    },
    async test() {
      const t0 = performance.now();
      try {
        const res = await fetchWithTimeout(
          'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=categorymembers&gcmtitle=Category%3AFeatured%20videos&gcmtype=file&gcmlimit=3&prop=videoinfo&viprop=url', 10000);
        const data = await res.json();
        const n = data.query ? Object.keys(data.query.pages).length : 0;
        return { ok: true, latencyMs: Math.round(performance.now() - t0), count: n, directOk: true, note: '接口正常 · 直链可用' };
      } catch (e) {
        return { ok: false, latencyMs: -1, count: 0, directOk: false, note: '当前网络不可达' };
      }
    },
  },
};

/* ==================== LunaTV 辅助函数 ==================== */
const LUNATV_CONFIG_URL = 'https://raw.githubusercontent.com/hafrey1/LunaTV-config/main/LunaTV-config.json';
const LUNATV_RELAY = 'https://pz.v88.qzz.io/?url=';
const LUNATV_CACHE_MS = 2 * 3600 * 1000;
const LUNATV_PROBE_MAX = 14;   // 启动时探活前 N 个候选子站
const LUNATV_URL_KEY = 'tideflow_config_url_v1';

let _lunaCfg = null, _lunaCfgAt = 0, _lunaCfgUrl = null, _lunaPool = null, _lunaPoolAt = 0;

function lunaRelay(url) { return LUNATV_RELAY + encodeURIComponent(url); }

function lunaActiveConfigUrl() {
  return localStorage.getItem(LUNATV_URL_KEY) || LUNATV_CONFIG_URL;
}

async function lunaLoadConfig() {
  const url = lunaActiveConfigUrl();
  if (_lunaCfg && _lunaCfgUrl === url && (Date.now() - _lunaCfgAt) < LUNATV_CACHE_MS) return _lunaCfg;
  const res = await fetchWithTimeout(url, 10000);
  if (!res.ok) throw new Error('配置 HTTP ' + res.status);
  const data = await res.json();
  const sites = (data && data.api_site) || {};
  // NSFW 内容由页面上的安全开关控制，不在源层面过滤
  _lunaCfg = Object.entries(sites)
    .map(([k, v]) => ({ key: k, name: String(v.name || k).replace(/[🎬\s\-–—]/g, ''), api: String(v.api || '') }))
    .filter((s) => s.api);
  _lunaCfgUrl = url;
  _lunaCfgAt = Date.now();
  return _lunaCfg;
}

async function lunaPickPool() {
  if (_lunaPool && (Date.now() - _lunaPoolAt) < LUNATV_CACHE_MS) return _lunaPool;
  const list = await lunaLoadConfig();
  const tested = await Promise.all(list.slice(0, LUNATV_PROBE_MAX).map(async (s) => {
    const t0 = performance.now();
    try {
      const res = await fetchWithTimeout(lunaRelay(s.api + '?ac=videolist&pg=1&limit=1'), 8000);
      const j = await res.json();
      const firstEps = lunaEpisodes(((j && j.list) || [])[0]);
      if (j && j.code === 1 && firstEps.length) {
        return Object.assign({}, s, { latencyMs: Math.round(performance.now() - t0) });
      }
    } catch (e) { /* 不可达跳过 */ }
    return null;
  }));
  _lunaPool = tested.filter(Boolean).sort((a, b) => a.latencyMs - b.latencyMs);
  _lunaPoolAt = Date.now();
  return _lunaPool;
}

/* 单个采集站适配器工厂 */
function lunaSiteAdapter(site) {
  async function fetchList(page, q) {
    let u = site.api + (site.api.includes('?') ? '&' : '?') + 'ac=videolist&pg=' + page + '&limit=15';
    if (q) u += '&wd=' + encodeURIComponent(q);
    const res = await fetchWithTimeout(lunaRelay(u), CONFIG.requestTimeout);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const j = await res.json();
    return { list: Array.isArray(j.list) ? j.list : [], total: Number(j.total) || 0 };
  }
  return {
    type: 'api',
    _api: site.api,
    async fetch(ctx) {
      const page = ctx.page || 1;
      const q = (ctx.query || '').trim();
      const r0 = await fetchList(page, q);
      this._total = r0.total;
      let list = r0.list;
      // 源分类筛选（tid）
      if (ctx.classId) {
        try {
          let uc = site.api + (site.api.includes('?') ? '&' : '?') + 'ac=videolist&pg=' + page + '&limit=15&tid=' + encodeURIComponent(ctx.classId);
          const rc = await fetchWithTimeout(lunaRelay(uc), CONFIG.requestTimeout);
          const jc = await rc.json();
          if (Array.isArray(jc.list) && jc.list.length) list = jc.list;
        } catch (e) { /* ignore */ }
      }
      // 演员名搜不到时，补一发 actor= 参数搜索并合并
      if (q && page === 1 && list.length === 0) {
        try {
          let u2 = site.api + (site.api.includes('?') ? '&' : '?') + 'ac=videolist&pg=1&limit=15&actor=' + encodeURIComponent(q);
          const res2 = await fetchWithTimeout(lunaRelay(u2), CONFIG.requestTimeout);
          const j2 = await res2.json();
          if (Array.isArray(j2.list) && j2.list.length) list = j2.list;
        } catch (e) { /* ignore */ }
      }
      const out = [];
      for (const v of list) {
        const eps = lunaEpisodes(v).slice(0, 40);
        if (!eps.length || !v.vod_name) continue;
        out.push({
          key: 'luna:' + site.key + ':' + v.vod_id,
          id: String(v.vod_id),
          title: v.vod_name,
          desc: lunaClean(v.vod_content || v.vod_blurb || '').slice(0, 200),
          thumb: String(v.vod_pic || '').replace(/^http:\/\//, 'https://'),
          direct: eps[0].url,
          needResolve: false,
          source: site.name, sourceId: 'luna:' + site.key,
          tags: [v.vod_class, String(v.vod_year || ''), v.vod_area, v.vod_remarks].filter(Boolean),
          actors: String(v.vod_actor || '').split(/[,，]/).map((s) => s.trim()).filter(Boolean).slice(0, 6),
          studio: site.name,
          series: v.vod_name || '',
          date: String(v.vod_year || ''),
          location: v.vod_area || '',
          duration: 0,
          episodes: eps,
          mime: 'video/mp4',
          categories: ['影视'],
        });
      }
      return out;
    },
    async test() {
      const t0 = performance.now();
      try {
        const { list, total } = await fetchList(1, '');
        const eps = list.length ? lunaEpisodes(list[0]) : [];
        let directOk = false;
        if (eps[0]) directOk = await probeMediaUrl(eps[0].url, 5000);
        return { ok: true, latencyMs: Math.round(performance.now() - t0), count: total, directOk, note: total ? '共 ' + fmtNum(total) + ' 部' : '直链待测' };
      } catch (e) {
        return { ok: false, latencyMs: -1, count: 0, directOk: false, note: '经中转不可达' };
      }
    },
  };
}

function fmtNum(n) {
  n = Number(n) || 0;
  if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, '') + ' 万';
  return String(n);
}

/* 启动后把全部子站注册进源池（独立可开关，候选状态需体检） */
window.__LUNA_READY__ = (async () => {
  try {
    const all = await lunaLoadConfig();
    for (const s of all) {
      const sid = 'luna:' + s.key;
      if (ADAPTERS[sid]) continue;
      SOURCES.push({
        id: sid, name: 'LunaTV · ' + s.name, type: 'api',
        desc: '影视采集站（自动更新配置）· ' + s.api.replace(/^https?:\/\//, ''),
        candidate: true,
      });
      ADAPTERS[sid] = lunaSiteAdapter(s);
    }
    // 快速探活前若干个，挑出最快的用于首次自动启用
    const fast = await lunaPickPool();
    window.__LUNA_FAST__ = fast.map((s) => 'luna:' + s.key);
  } catch (e) { /* 配置拉取失败：源池保持空 */ }
})();

/* 用自定义 URL 重新拉取配置并重新注册全部子站 */
window.__LUNA_RELOAD__ = async function (customUrl) {
  if (customUrl) localStorage.setItem(LUNATV_URL_KEY, customUrl);
  _lunaCfg = null; _lunaCfgAt = 0; _lunaCfgUrl = null;
  _lunaPool = null; _lunaPoolAt = 0;
  const all = await lunaLoadConfig();
  // 清掉旧的 luna 注册（保留 nasa 等内置）
  for (let i = SOURCES.length - 1; i >= 0; i--) {
    if (SOURCES[i].id.indexOf('luna:') === 0) SOURCES.splice(i, 1);
  }
  for (const s of all) {
    const sid = 'luna:' + s.key;
    if (ADAPTERS[sid]) continue;
    SOURCES.push({
      id: sid, name: 'LunaTV · ' + s.name, type: 'api',
      desc: '影视采集站 · ' + s.api.replace(/^https?:\/\//, ''),
      candidate: true,
    });
    ADAPTERS[sid] = lunaSiteAdapter(s);
  }
  return all.length;
};

function lunaClean(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#0?39;/g, "'")
    .replace(/\s+/g, ' ').trim();
}

function lunaLooksMedia(url) {
  return /\.(m3u8|mp4|webm|m4v|ts)(\?|#|$)/i.test(url);
}

function lunaEpisodes(vod) {
  const raw = String(vod && vod.vod_play_url || '');
  if (!raw) return [];
  const blocks = raw.split('$$$');
  const block = blocks.find((b) => b.includes('$')) || blocks[0] || '';
  return block.split('#')
    .map((seg) => {
      const i = seg.indexOf('$');
      if (i < 0) return null;
      const label = seg.slice(0, i).trim() || '正片';
      const url = seg.slice(i + 1).trim();
      return (/^https?:\/\//i.test(url) && lunaLooksMedia(url)) ? { label, url } : null;
    })
    .filter(Boolean);
}

function staticAdapter(sourceId, probeUrl) {
  return {
    type: 'static',
    async fetch(ctx) {
      const page = ctx.page || 1;
      let list = STATIC_CATALOG.filter((it) => it.sourceId === sourceId);
      if (sourceId === 'googlesamples') list = GOOGLE_SAMPLES;
      const q = (ctx.query || '').trim().toLowerCase();
      if (q) list = list.filter((it) => (it.title + ' ' + it.tags.join(' ')).toLowerCase().includes(q));
      if (ctx.category && ctx.category !== '全部') {
        list = list.filter((it) => (it.categories || []).includes(ctx.category));
      }
      const size = 12;
      return list.slice((page - 1) * size, page * size);
    },
    async test() {
      const t0 = performance.now();
      // 用媒体探针实测直链（video 加载不需要 CORS，能真实反映"能否播放"）
      const directOk = await probeMediaUrl(probeUrl, 8000);
      const list = sourceId === 'googlesamples' ? GOOGLE_SAMPLES : STATIC_CATALOG.filter((it) => it.sourceId === sourceId);
      return { ok: directOk, latencyMs: Math.round(performance.now() - t0), count: list.length, directOk, note: directOk ? '样片直链可达' : '样片直链当前网络不可达' };
    },
  };
}

function nasaCategoryTerm(category) {
  if (!category || category === '全部') return '';
  const map = {
    '太空': 'space OR iss OR mars OR moon OR launch OR rocket',
    '地球': 'earth OR climate OR ocean OR hurricane',
    '科学': 'science OR research OR physics OR biology',
    '技术': 'technology OR engineering OR robotics OR drone',
    '历史': 'history OR apollo OR anniversary',
    '自然': 'nature OR wildlife OR animals',
  };
  return map[category] || '';
}

function buildArchiveQuery(ctx) {
  if (ctx.query) {
    return 'mediatype:movies AND title:(' + ctx.query + ')';
  }
  if (ctx.category && ctx.category !== '全部') {
    const catMap = { '科幻': 'science fiction', '动画': 'animation', '纪录片': 'documentary', '历史': 'history', '自然': 'nature' };
    return 'mediatype:movies AND subject:(' + (catMap[ctx.category] || ctx.category) + ')';
  }
  return 'mediatype:movies AND collection:feature_films';
}

function pickVideoFile(files) {
  const vids = (files || []).filter((f) =>
    /\.(mp4|webm|m4v|ogv)$/i.test(f.name) && !/\.(srt|txt)$/i.test(f.name) && (f.size || 0) > 1e6);
  vids.sort((a, b) => (b.size || 0) - (a.size || 0));
  return vids[0] || null;
}

/* ---------- 媒体探针：跨域视频可用性检测（video 元素加载不需要 CORS） ---------- */
function probeMediaUrl(url, timeoutMs) {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') { resolve(false); return; }
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.muted = true;
    let settled = false;
    const timer = setTimeout(() => done(false), timeoutMs || 8000);
    function done(ok) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { v.removeAttribute('src'); v.load(); } catch (e) { /* ignore */ }
      resolve(ok);
    }
    v.onloadedmetadata = () => done(true);
    v.onerror = () => done(false);
    v.src = url;
  });
}

/* NASA 直链启发式候选（命名规则：{id}~large.mp4 等，无需读资产清单） */
function nasaCandidateUrls(nasaId) {
  const base = 'https://images-assets.nasa.gov/video/' + encodeURIComponent(nasaId) + '/' + encodeURIComponent(nasaId);
  return [base + '~large.mp4', base + '~medium.mp4', base + '~mobile.mp4', base + '~orig.mp4', base + '~preview.mp4'];
}

/* ---------- NASA 直链解析（播放页用） ----------
 * 1) 先尝试 CORS 读取资产清单（collection.json）
 * 2) 失败则按命名规则构造候选直链 + 媒体探针实测（兼容无 CORS 的资产域）
 */
async function resolveNasaAsset(assetRef, nasaId) {
  let mp4 = '';
  let via = 'collection';
  try {
    const res = await fetchWithTimeout(assetRef, 8000);
    if (res.ok) {
      const data = await res.json();
      const hrefs = (Array.isArray(data) ? data : ((data.collection && data.collection.items) || data.items || []))
        .map((x) => (typeof x === 'string' ? x : x.href)).filter(Boolean);
      const https = hrefs.map((u) => u.replace(/^http:\/\//, 'https://'));
      mp4 = https.find((u) => /~large\.mp4$/i.test(u)) ||
        https.find((u) => /~orig\.mp4$/i.test(u)) ||
        https.find((u) => /\.mp4$/i.test(u)) || '';
    }
  } catch (e) { /* CORS / 网络失败 → 走启发式 */ }
  if (mp4 && await probeMediaUrl(mp4, 6000)) return { mp4, via };
  via = 'heuristic';
  for (const url of nasaCandidateUrls(nasaId || '')) {
    if (await probeMediaUrl(url, 5000)) return { mp4: url, via };
  }
  if (mp4) return { mp4, via: 'collection-raw' };
  throw new Error('未解析到可播放的 NASA 直链');
}

/* ---------- 流级广告过滤：剔除播放列表中不属于正片目录的分段 ---------- */
function stripForeignSegments(text, baseUrl) {
  const base = new URL(baseUrl);
  const baseDir = base.pathname.substring(0, base.pathname.lastIndexOf('/') + 1);
  const origin = base.origin;
  const lines = text.split(/\r?\n/);
  // 先统计每个目录的分段数，只保留占多数的正片目录，避免把正常跨 CDN 源误删空
  const dirCount = {};
  const segIdx = [];
  lines.forEach((line, i) => {
    const t = line.trim();
    if (!t || t.startsWith('#')) return;
    segIdx.push(i);
    let full;
    try { full = new URL(t, origin + baseDir).href; } catch (e) { return; }
    const p = new URL(full).pathname;
    const dir = p.substring(0, p.lastIndexOf('/') + 1);
    dirCount[dir] = (dirCount[dir] || 0) + 1;
  });
  const total = segIdx.length;
  if (!total) return text;
  const mainDir = Object.keys(dirCount).sort((a, b) => dirCount[b] - dirCount[a])[0];
  // 多数目录占比过低（<60%）说明不是广告模式，原样返回
  if (dirCount[mainDir] < total * 0.6) return text;

  const out = [];
  let removed = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();
    if (!t || t.startsWith('#')) { out.push(line); continue; }
    let full;
    try { full = new URL(t, origin + baseDir).href; } catch (e) { out.push(line); continue; }
    const p = new URL(full).pathname;
    const dir = p.substring(0, p.lastIndexOf('/') + 1);
    if (dir === mainDir) {
      out.push(line);
    } else {
      removed++;
      // 同时丢掉前一行可能是它的 EXTINF
      if (out.length && /^#EXTINF:/.test(out[out.length - 1])) out.pop();
    }
  }
  return removed ? out.join('\n') : text;
}

function countRemovedSegments(orig, filtered) {
  const c = (t) => t.split(/\r?\n/).filter((l) => { const x = l.trim(); return x && !x.startsWith('#'); }).length;
  return c(orig) - c(filtered);
}

/* 把播放列表里的相对分段/密钥地址重写为绝对地址（blob 播放用） */
function absolutizeSegments(text, baseUrl) {
  return text.split(/\r?\n/).map((line) => {
    const t = line.trim();
    if (!t || t.startsWith('#')) {
      // #EXT-X-KEY:METHOD=AES-128,URI="..." 里的相对密钥地址也要重写
      return line.replace(/URI="([^"]+)"/g, (m, u) => {
        try { return 'URI="' + new URL(u, baseUrl).href + '"'; } catch (e) { return m; }
      });
    }
    try { return new URL(t, baseUrl).href; } catch (e) { return line; }
  }).join('\n');
}

/* ---------- 源池定义 ---------- */
const SOURCES = [
  { id: 'nasa', name: 'NASA 影像库', type: 'api', desc: '美国宇航局官方视频库 · 太空 / 地球 / 科学影像，元数据最全', candidate: false },
  /* LunaTV 全部子站在运行时由 __LUNA_READY__ 动态注册（独立可开关） */
];

const DEFAULT_ENABLED = ['nasa'];
