export const IMAGE_TYPES = ['jpg', 'png', 'gif', 'webp', 'svg', 'bmp', 'avif', 'ico'];

export const DEFAULT_CONFIG = {
  configured: false,
  baseFolder: 'MediaDownloader',
  organizeByDomain: true,
  imageTypes: {
    jpg: true,
    png: true,
    gif: true,
    webp: true,
    svg: true,
    bmp: true,
    avif: true,
    ico: false
  }
};

export async function getConfig() {
  const data = await chrome.storage.sync.get('config');
  const stored = data.config || {};
  return {
    ...DEFAULT_CONFIG,
    ...stored,
    imageTypes: { ...DEFAULT_CONFIG.imageTypes, ...(stored.imageTypes || {}) }
  };
}

export async function setConfig(config) {
  await chrome.storage.sync.set({ config });
}
