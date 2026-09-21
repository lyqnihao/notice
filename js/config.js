/* =========================================================
 * 潮汐 TIDEFLOW · 全局配置
 * 普通视频聚合站：多源聚合 / 搜索 / 分类 / 直链播放 / 内容过滤
 * ========================================================= */
const CONFIG = {
  name: '潮汐 TIDEFLOW',
  slogan: '全网免费视频聚合 · 直链播放 · 零广告',
  version: '1.3.13',
  maxActive: 5,                // 同时启用的源上限（高速通道）
  storeKey: 'tideflow_sources_v1',
  filterKey: 'tideflow_filter_v1',
  currentKey: 'tideflow_current_v1',
  requestTimeout: 10000,
};

/* ---------- 成人内容过滤（安全模式，默认开启） ---------- */
const ADULT_KEYWORDS = [
  // 拉丁词：按单词边界匹配
  'porn', 'xxx', 'nsfw', 'adult', 'erotic', 'erotica', 'hentai',
  'sex', 'sexual', 'nude', 'naked', 'topless', 'bikini',
  // 中文：直接包含匹配
  '成人', '色情', '情色', '淫', '露点', '性爱', '裸体', '三级片', '18禁', 'av',
  '麻豆', '果冻', '91', '果豆', '蜜桃', '淫媒', '情欲', '约炮', '萝莉', '迷奸', '偷情'
].map((k) => k.toLowerCase());

const ADULT_SOURCE_HINT = /[🔞😈]|91md|麻豆|成人|情色|果冻|果豆|蜜桃|淫|av|xing|sex/i;

/* ---------- 推广 / 广告条目过滤（数据层） ---------- */
const PROMO_KEYWORDS = [
  '广告', '推广', '赞助', 'Sponsored', 'Promo', 'Casino', 'Betting',
  '澳门', '新葡京', '博彩', '抽奖', '中奖', '返利'
].map((k) => k.toLowerCase());

/* ---------- 分类体系 ---------- */
const CATEGORIES = ['全部', '太空', '地球', '科学', '技术', '动画', '自然', '科幻', '历史', '短片', '测试样片'];

/* NASA 关键词 → 分类推断 */
const NASA_CATEGORY_MAP = {
  '太空': ['space', 'iss', 'mars', 'moon', 'launch', 'rocket', 'orbit', 'satellite', 'sun', 'solar',
          'galaxy', 'universe', 'star', 'comet', 'asteroid', 'telescope', 'nasa', 'astronaut', 'jupiter', 'saturn'],
  '地球': ['earth', 'climate', 'weather', 'ocean', 'hurricane', 'atmosphere', 'globe', 'terrain', 'ice'],
  '科学': ['science', 'research', 'experiment', 'lab', 'physics', 'gravity', 'biology', 'chemistry', 'data', 'study'],
  '技术': ['technology', 'engineering', 'test', 'software', 'hardware', 'robotics', 'computer', '3d print', 'drone'],
  '历史': ['history', 'heritage', 'archive', 'apollo', 'anniversary', 'legacy'],
  '自然': ['wildlife', 'animal', 'nature', 'forest', 'ecosystem'],
};

/* ---------- 工具函数 ---------- */
function fetchWithTimeout(url, timeout) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout || CONFIG.requestTimeout);
  return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

function escapeReg(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* 是否命中成人内容：源名 / 标题 / 标签 / 描述 任一命中即过滤 */
function isAdultContent(item) {
  if (item.sourceId && ADULT_SOURCE_HINT.test(item.sourceId)) return true;
  if (item.source && ADULT_SOURCE_HINT.test(item.source)) return true;
  const hay = [item.title, item.desc, (item.tags || []).join(' '), (item.categories || []).join(' ')]
    .join(' ').toLowerCase();
  for (const k of ADULT_KEYWORDS) {
    if (/^[\x00-\x7f]+$/.test(k)) {
      if (new RegExp('\\b' + escapeReg(k) + '\\b').test(hay)) return true;
    } else if (hay.includes(k)) {
      return true;
    }
  }
  return false;
}

/* 是否命中推广条目 */
function isPromoContent(item) {
  const hay = [item.title, (item.tags || []).join(' ')].join(' ').toLowerCase();
  return PROMO_KEYWORDS.some((k) => hay.includes(k));
}

/* 从标题/标签推断分类（兜底） */
function inferCategory(item, fallback) {
  if (item.categories && item.categories.length) return item.categories;
  const hay = [item.title, (item.tags || []).join(' ')].join(' ').toLowerCase();
  const out = [];
  for (const [cat, words] of Object.entries(NASA_CATEGORY_MAP)) {
    if (words.some((w) => hay.includes(w))) out.push(cat);
  }
  return out.length ? out : (fallback ? [fallback] : ['短片']);
}

/* 秒数 → mm:ss */
function fmtDur(sec) {
  if (!sec) return '';
  const s = Math.round(sec);
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
