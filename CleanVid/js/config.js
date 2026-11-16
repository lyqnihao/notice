/**
 * 清影 CleanVid 配置
 * 修改源池、过滤词、CORS 代理后刷新即可生效
 */
window.CLEANVID = {
  // 若资源站无 CORS，填入你的中转前缀，例如 'https://your-proxy.workers.dev/?url='
  // 留空则直接请求（多数浏览器会失败，需自建反代）
  CORS_PROXY: '',

  // 源池：name 显示名，api 为 MacCMS provide 根地址（不要带 ?）
  SOURCE_POOL: [
    {
      id: 'wujin',
      name: '无尽资源',
      api: 'https://api.wujinapi.me/api.php/provide/vod',
      priority: 10
    },
    {
      id: 'hongniu',
      name: '红牛资源',
      api: 'https://hongniuzy2.com/api.php/provide/vod',
      priority: 9
    },
    {
      id: 'lzi',
      name: '量子资源',
      api: 'https://cj.lziapi.com/api.php/provide/vod',
      priority: 8
    },
    {
      id: 'heimuer',
      name: '黑木耳',
      api: 'https://json.heimuer.xyz/api.php/provide/vod',
      priority: 7
    },
    {
      id: 'bfzy',
      name: '暴风资源',
      api: 'https://bfzyapi.com/api.php/provide/vod',
      priority: 6
    },
    {
      id: 'okzy',
      name: 'OK资源',
      api: 'https://api.okzyw.net/api.php/provide/vod',
      priority: 5
    }
  ],

  // 默认启用的源 id（最多同时用 3 条，避免过慢）
  ACTIVE_SOURCES: ['wujin', 'hongniu', 'lzi'],

  // 成人/色情过滤：分类名包含任意一项则丢弃
  ADULT_TYPE_KEYWORDS: [
    '伦理', '情色', '成人', 'AV', '色情', '三级', '限制级',
    '福利', '写真', '裸聊', '约炮', '性爱', '黄片', '里番'
  ],

  // 标题/演员/标签包含则丢弃
  ADULT_KEYWORDS: [
    '无码', '有码', '中文字幕', '骑兵', '步兵', '东京热', '一本道',
    '麻豆', '探花', '网红主播', '直播录播', '色情', '做爱', '口交',
    'AV女优', '日本AV', '欧美AV', '三级片', '限制级', '里番', 'H漫'
  ],

  // 每页条数
  PAGE_SIZE: 24,

  // 首页分类映射（type 关键字模糊匹配）
  CATEGORIES: [
    { id: 'all', name: '全部' },
    { id: 'movie', name: '电影', keywords: ['电影', '片'] },
    { id: 'tv', name: '电视剧', keywords: ['剧', '连续剧', '国产剧', '韩剧', '美剧', '日剧', '港剧', '台剧'] },
    { id: 'anime', name: '动漫', keywords: ['动漫', '动画', '番'] },
    { id: 'variety', name: '综艺', keywords: ['综艺', '真人秀'] }
  ],

  // 本地缓存 key
  STORAGE_KEY: 'cleanvid_v1'
};
