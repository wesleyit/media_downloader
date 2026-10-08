const toggle = document.getElementById('toggle');
const countEl = document.getElementById('count');
const messageEl = document.getElementById('message');
const settingsBtn = document.getElementById('settings');

let activeTabId = null;

function showMessage(text) {
  if (!text) {
    messageEl.hidden = true;
    messageEl.textContent = '';
    return;
  }
  messageEl.hidden = false;
  messageEl.textContent = text;
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function render(state) {
  if (!state) return;
  toggle.checked = !!state.enabled;
  countEl.textContent = state.savedCount ?? 0;
}

async function refresh() {
  const tab = await getActiveTab();
  if (!tab) return;
  activeTabId = tab.id;
  const state = await chrome.runtime.sendMessage({
    type: 'getState',
    tabId: tab.id
  });
  render(state);
}

toggle.addEventListener('change', async () => {
  showMessage('');
  const enable = toggle.checked;
  const res = await chrome.runtime.sendMessage({
    type: 'toggle',
    tabId: activeTabId,
    enable
  });

  if (res?.needsConfig) {
    toggle.checked = false;
    showMessage('Configure a extensão para começar.');
    return;
  }
  if (res?.error === 'unsupported') {
    toggle.checked = false;
    showMessage('Esta página não permite captura de imagens.');
    return;
  }
  if (res?.error) {
    toggle.checked = false;
    showMessage('Não foi possível iniciar a captura nesta aba.');
    return;
  }
  render(res);
});

settingsBtn.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'stateUpdate' && msg.tabId === activeTabId) {
    countEl.textContent = msg.savedCount ?? 0;
    toggle.checked = !!msg.enabled;
  }
});

refresh();
