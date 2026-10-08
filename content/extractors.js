// Injetado antes de content.js no mesmo mundo isolado. Expõe MediaExtractors.
(function () {
  if (globalThis.MediaExtractors) return;

  // Evita reprocessar os mesmos elementos a cada varredura.
  const bgSeen = new WeakSet();
  const canvasSeen = new WeakSet();
  const svgSeen = new WeakSet();

  function extractCssUrls(cssValue) {
    const out = [];
    const re = /url\((['"]?)([^'")]+)\1\)/g;
    let m;
    while ((m = re.exec(cssValue))) {
      out.push(m[2]);
    }
    return out;
  }

  function toItem(raw, kind) {
    if (!raw) return null;
    if (raw.startsWith('data:')) return { dataUrl: raw, kind };
    try {
      return { url: new URL(raw, location.href).href, kind };
    } catch {
      return null;
    }
  }

  function collectImg() {
    const out = [];
    document.querySelectorAll('img').forEach((img) => {
      const src = img.currentSrc || img.src;
      const item = toItem(src, 'img');
      if (item) out.push(item);
    });
    return out;
  }

  function collectBackgrounds() {
    const out = [];
    document.querySelectorAll('*').forEach((el) => {
      if (bgSeen.has(el)) return;
      let bg;
      try {
        bg = getComputedStyle(el).backgroundImage;
      } catch {
        return;
      }
      if (bg && bg !== 'none') {
        const urls = extractCssUrls(bg);
        if (urls.length) {
          bgSeen.add(el);
          urls.forEach((u) => {
            const item = toItem(u, 'bg');
            if (item) out.push(item);
          });
        }
      }
    });
    return out;
  }

  function collectSvg() {
    const out = [];
    document.querySelectorAll('svg').forEach((svg) => {
      if (svgSeen.has(svg)) return;
      svgSeen.add(svg);
      try {
        const serialized = new XMLSerializer().serializeToString(svg);
        out.push({
          dataUrl:
            'data:image/svg+xml;charset=utf-8,' +
            encodeURIComponent(serialized),
          kind: 'svg'
        });
      } catch {
        // svg inválido para serializar
      }
    });
    return out;
  }

  function collectCanvas() {
    const out = [];
    document.querySelectorAll('canvas').forEach((canvas) => {
      if (canvasSeen.has(canvas)) return;
      canvasSeen.add(canvas);
      try {
        out.push({ dataUrl: canvas.toDataURL('image/png'), kind: 'canvas' });
      } catch {
        // canvas "tainted" (cross-origin sem CORS) não pode ser exportado
      }
    });
    return out;
  }

  globalThis.MediaExtractors = {
    collectAll() {
      return [
        ...collectImg(),
        ...collectBackgrounds(),
        ...collectSvg(),
        ...collectCanvas()
      ];
    }
  };
})();
