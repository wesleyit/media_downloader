const MIME_EXT = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/pjpeg': 'jpg',
  'image/png': 'png',
  'image/apng': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/bmp': 'bmp',
  'image/x-ms-bmp': 'bmp',
  'image/avif': 'avif',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico'
};

export function normalizeExt(ext) {
  ext = (ext || '').toLowerCase().replace(/^\./, '');
  if (ext === 'jpeg' || ext === 'jfif' || ext === 'pjpeg') ext = 'jpg';
  return ext;
}

export function extFromMime(mime) {
  if (!mime) return '';
  mime = mime.split(';')[0].trim().toLowerCase();
  return MIME_EXT[mime] || '';
}

export function extFromUrl(url) {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/\.([a-z0-9]{2,5})$/i);
    return m ? normalizeExt(m[1]) : '';
  } catch {
    return '';
  }
}

export function sanitize(name) {
  return (
    (name || '')
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^[_.]+|[_.]+$/g, '')
      .slice(0, 120) || 'image'
  );
}

export function baseNameFromUrl(url) {
  try {
    const u = new URL(url);
    let base = decodeURIComponent((u.pathname.split('/').pop() || '').trim());
    base = base.replace(/\.[a-z0-9]{2,5}$/i, '');
    return sanitize(base || 'image');
  } catch {
    return 'image';
  }
}

export function isEnabledType(ext, types) {
  return !!types[normalizeExt(ext)];
}

export function buildPath(baseFolder, organizeByDomain, host, filename) {
  const parts = [sanitize(baseFolder || 'MediaDownloader')];
  if (organizeByDomain) parts.push(sanitize(host || 'unknown'));
  parts.push(filename);
  return parts.join('/');
}
