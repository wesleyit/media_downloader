// Injetado após extractors.js. Varre o DOM, observa mudanças e envia mídias
// ao service worker. Guardas evitam reinicialização em reinjeções.
(function () {
  if (window.__mediaDownloaderInit) return;
  window.__mediaDownloaderInit = true;

  const seen = new Set();
  let observer = null;
  let running = false;
  let scrollHandler = null;

  function keyOf(item) {
    return item.url || (item.dataUrl ? item.dataUrl.slice(0, 256) : '');
  }

  function collectNew() {
    const all = globalThis.MediaExtractors
      ? globalThis.MediaExtractors.collectAll()
      : [];
    const fresh = [];
    for (const item of all) {
      const key = keyOf(item);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      fresh.push(item);
    }
    return fresh;
  }

  function scan() {
    const items = collectNew();
    if (!items.length) return;
    try {
      chrome.runtime.sendMessage({ type: 'media', items });
    } catch {
      // service worker pode estar reiniciando; próxima varredura reenvia
    }
  }

  function debounce(fn, wait) {
    let timer;
    return () => {
      clearTimeout(timer);
      timer = setTimeout(fn, wait);
    };
  }

  const debouncedScan = debounce(scan, 400);

  function start() {
    if (running) return;
    running = true;
    scan();
    observer = new MutationObserver(debouncedScan);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'srcset', 'style', 'data-src', 'data-srcset', 'href']
    });
    scrollHandler = debounce(scan, 300);
    window.addEventListener('scroll', scrollHandler, { passive: true });
  }

  function stop() {
    running = false;
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    if (scrollHandler) {
      window.removeEventListener('scroll', scrollHandler);
      scrollHandler = null;
    }
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg) return;
    if (msg.type === 'start') start();
    else if (msg.type === 'stop') stop();
  });

  // A injeção só ocorre quando a aba está habilitada, então iniciamos direto.
  start();
})();
