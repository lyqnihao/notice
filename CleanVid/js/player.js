/**
 * HLS 播放 + 简单广告分段过滤
 * 依赖 hls.js（CDN）
 */
(function () {
  let hls = null;
  let videoEl = null;
  let adFilterOn = true;

  function init(videoElement) {
    videoEl = videoElement;
  }

  function setAdFilter(on) {
    adFilterOn = !!on;
  }

  /**
   * 解析 m3u8 文本，去掉明显异域名/短时长广告段（启发式）
   * 许多采集站会在开头/中段插入 30~60s 广告 TS
   */
  async function cleanM3u8(url) {
    if (!adFilterOn) return url;
    try {
      const res = await fetch(url);
      const text = await res.text();
      if (!text.includes('#EXTM3U')) return url;

      const lines = text.split(/\r?\n/);
      const out = [];
      let skipNext = false;
      const base = url.substring(0, url.lastIndexOf('/') + 1);
      const host = new URL(url).host;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith('#EXTINF:')) {
          const dur = parseFloat(line.split(':')[1]);
          // 极短片段（<2s）常为贴片，可选跳过
          if (dur > 0 && dur < 1.5) {
            skipNext = true;
            continue;
          }
          out.push(line);
        } else if (line && !line.startsWith('#')) {
          if (skipNext) {
            skipNext = false;
            continue;
          }
          // 若 TS 域名与主清单完全不同，可能是广告 CDN
          try {
            const abs = line.startsWith('http') ? line : base + line;
            const h = new URL(abs).host;
            if (h !== host && !h.includes(host.split('.').slice(-2).join('.'))) {
              // 异域：仍保留，避免误杀多 CDN 正片；只做记录
            }
            out.push(line);
          } catch {
            out.push(line);
          }
        } else {
          out.push(line);
        }
      }
      const cleaned = out.join('\n');
      const blob = new Blob([cleaned], { type: 'application/vnd.apple.mpegurl' });
      return URL.createObjectURL(blob);
    } catch {
      return url;
    }
  }

  async function play(url) {
    if (!videoEl) return;
    destroy();
    const finalUrl = await cleanM3u8(url);

    if (window.Hls && Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        maxBufferLength: 30
      });
      hls.loadSource(finalUrl);
      hls.attachMedia(videoEl);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        videoEl.play().catch(() => {});
      });
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          console.warn('HLS fatal', data);
        }
      });
    } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
      videoEl.src = finalUrl;
      videoEl.play().catch(() => {});
    } else {
      alert('当前浏览器不支持 HLS 播放，请使用 Chrome / Edge / Safari 或复制直链到播放器');
    }
  }

  function destroy() {
    if (hls) {
      hls.destroy();
      hls = null;
    }
    if (videoEl) {
      videoEl.removeAttribute('src');
      videoEl.load();
    }
  }

  window.CleanPlayer = {
    init,
    play,
    destroy,
    setAdFilter
  };
})();
