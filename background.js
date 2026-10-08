import { getConfig } from './lib/storage.js';
import {
  extFromMime,
  extFromUrl,
  baseNameFromUrl,
  isEnabledType,
  buildPath
} from './lib/filename.js';
import { sha256 } from './lib/dedup.js';

/**
 * Estado por aba mantido em memória. Perde-se se o service worker reiniciar,
 * por isso o conjunto de abas habilitadas também é espelhado em
 * chrome.storage.session (ver loadEnabled/saveEnabled).
 * tabState: Map<tabId, { enabled, injected, savedCount, seen:Set<string> }>
 */
const tabState = new Map();
const SESSION_KEY = 'enabledTabs';

function ensure(tabId) {
  if (!tabState.has(tabId)) {
    tabState.set(tabId, {
      enabled: false,
      injected: false,
      savedCount: 0,
      seen: new Set()
    });
  }
  return tabState.get(tabId);
}

async function loadEnabled() {
  const data = await chrome.storage.session.get(SESSION_KEY);
  return data[SESSION_KEY] || {};
}

async function saveEnabled(map) {
  await chrome.storage.session.set({ [SESSION_KEY]: map });
}

async function setEnabledPersisted(tabId, enabled) {
  const map = await loadEnabled();
  if (enabled) map[tabId] = true;
  else delete map[tabId];
  await saveEnabled(map);
}

function injectInto(tabId) {
  return chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    files: ['content/extractors.js', 'content/content.js']
  });
}

function sendToTab(tabId, message) {
  return chrome.tabs.sendMessage(tabId, message).catch(() => {});
}

function download(url, filename) {
  return new Promise((resolve, reject) => {
    chrome.downloads.download(
      { url, filename, saveAs: false, conflictAction: 'uniquify' },
      (id) => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve(id);
      }
    );
  });
}

async function detectExtFromNetwork(url) {
  try {
    const resp = await fetch(url, { method: 'GET', credentials: 'include' });
    return extFromMime(resp.headers.get('content-type'));
  } catch {
    return '';
  }
}

function hostOf(tabUrl) {
  try {
    return new URL(tabUrl).hostname || 'unknown';
  } catch {
    return 'unknown';
  }
}

async function handleItem(item, cfg, st, host) {
  let url = item.url;
  // Imagens com src data: são tratadas como conteúdo embutido.
  if (url && url.startsWith('data:')) {
    item.dataUrl = url;
    url = null;
  }

  if (item.dataUrl) {
    const mimeMatch = item.dataUrl.match(/^data:([^;,]+)/);
    const mime = mimeMatch ? mimeMatch[1] : '';
    const ext = extFromMime(mime) || (item.kind === 'svg' ? 'svg' : 'png');
    if (!isEnabledType(ext, cfg.imageTypes)) return;

    const key = await sha256(item.dataUrl);
    if (st.seen.has(key)) return;
    st.seen.add(key);

    const filename = buildPath(
      cfg.baseFolder,
      cfg.organizeByDomain,
      host,
      `${item.kind || 'image'}_${key.slice(0, 10)}.${ext}`
    );
    await download(item.dataUrl, filename);
    st.savedCount++;
    return;
  }

  if (!url) return;

  let ext = extFromUrl(url);
  if (ext) {
    if (!isEnabledType(ext, cfg.imageTypes)) return;
  } else {
    ext = await detectExtFromNetwork(url);
    if (!ext || !isEnabledType(ext, cfg.imageTypes)) return;
  }

  if (st.seen.has(url)) return;
  st.seen.add(url);

  const filename = buildPath(
    cfg.baseFolder,
    cfg.organizeByDomain,
    host,
    `${baseNameFromUrl(url)}.${ext}`
  );
  await download(url, filename);
  st.savedCount++;
}

function broadcastState(tabId, st) {
  chrome.runtime
    .sendMessage({
      type: 'stateUpdate',
      tabId,
      enabled: st.enabled,
      savedCount: st.savedCount
    })
    .catch(() => {});
}

async function handleMessage(msg, sender, sendResponse) {
  if (msg.type === 'getState') {
    const st = ensure(msg.tabId);
    if (!st.enabled) {
      const en = await loadEnabled();
      if (en[msg.tabId]) {
        st.enabled = true;
        st.injected = true;
      }
    }
    const cfg = await getConfig();
    sendResponse({
      enabled: st.enabled,
      savedCount: st.savedCount,
      configured: cfg.configured
    });
    return;
  }

  if (msg.type === 'toggle') {
    const st = ensure(msg.tabId);
    const cfg = await getConfig();

    if (msg.enable && !cfg.configured) {
      chrome.runtime.openOptionsPage();
      sendResponse({ needsConfig: true });
      return;
    }

    let tab;
    try {
      tab = await chrome.tabs.get(msg.tabId);
    } catch {
      sendResponse({ error: 'tab' });
      return;
    }

    if (msg.enable && !/^https?:/.test(tab.url || '')) {
      sendResponse({ error: 'unsupported' });
      return;
    }

    st.enabled = msg.enable;
    await setEnabledPersisted(msg.tabId, msg.enable);

    if (msg.enable) {
      if (!st.injected) {
        try {
          await injectInto(msg.tabId);
          st.injected = true;
        } catch (e) {
          st.enabled = false;
          await setEnabledPersisted(msg.tabId, false);
          sendResponse({ error: 'inject' });
          return;
        }
      } else {
        sendToTab(msg.tabId, { type: 'start' });
      }
    } else {
      sendToTab(msg.tabId, { type: 'stop' });
    }

    sendResponse({ enabled: st.enabled, savedCount: st.savedCount });
    return;
  }

  if (msg.type === 'media') {
    const tabId = sender.tab && sender.tab.id;
    if (tabId == null) {
      sendResponse({ ok: false });
      return;
    }
    const st = ensure(tabId);
    if (!st.enabled) {
      const en = await loadEnabled();
      if (en[tabId]) {
        st.enabled = true;
        st.injected = true;
      } else {
        sendResponse({ ok: false });
        return;
      }
    }
    const cfg = await getConfig();
    const host = hostOf(sender.tab.url);
    for (const item of msg.items) {
      try {
        await handleItem(item, cfg, st, host);
      } catch {
        // falha em um item não deve interromper os demais
      }
    }
    broadcastState(tabId, st);
    sendResponse({ ok: true, savedCount: st.savedCount });
    return;
  }

  sendResponse({ ok: false });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleMessage(msg, sender, sendResponse);
  return true; // resposta assíncrona
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  const st = tabState.get(tabId);
  if (!st) return;
  // Navegação destrói o content script injetado.
  if (changeInfo.status === 'loading') st.injected = false;
  if (changeInfo.status === 'complete' && st.enabled && !st.injected) {
    injectInto(tabId)
      .then(() => {
        st.injected = true;
      })
      .catch(() => {});
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabState.delete(tabId);
  setEnabledPersisted(tabId, false);
});
