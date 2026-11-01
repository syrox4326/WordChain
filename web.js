'use strict';

// Statik dosyalar, güvenlik başlıkları, sıkıştırma ve paylaşım önizlemesi (HTML şablonu).

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.apk': 'application/vnd.android.package-archive',
};
const COMPRESSIBLE = new Set(['.html', '.css', '.js', '.json', '.webmanifest', '.svg', '.txt']);

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self' ws: wss:",
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

function securityHeaders(req) {
  const h = {
    'Content-Security-Policy': CSP,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    'X-Frame-Options': 'DENY',
  };
  if (String(req.headers['x-forwarded-proto'] || '').split(',')[0] === 'https') {
    h['Strict-Transport-Security'] = 'max-age=15552000';
  }
  return h;
}

function cacheControlFor(rel, ext) {
  if (ext === '.woff2') return 'public, max-age=31536000, immutable';
  if (rel.startsWith('avatars/') || rel.startsWith('icons/')) return 'public, max-age=86400';
  return 'no-cache'; // css, js, manifest, sw.js, indeks: her seferinde ETag ile sor
}

function originOf(req) {
  const proto = String(req.headers['x-forwarded-proto'] || (req.socket.encrypted ? 'https' : 'http')).split(',')[0].trim();
  let host = String(req.headers.host || 'localhost');
  if (!/^[a-z0-9.:-]+$/i.test(host)) host = 'localhost';
  return (proto === 'https' ? 'https' : 'http') + '://' + host;
}

function create(opts) {
  const publicDir = opts.publicDir;
  const rooms = opts.rooms;
  const avatars = opts.avatars;
  const gz = new Map(); // dosya -> { etag, buf }

  function send(req, res, status, headers, body) {
    const all = Object.assign({}, securityHeaders(req), headers);
    const accept = String(req.headers['accept-encoding'] || '');
    if (body && all['Content-Type'] && /^(text\/|application\/(json|manifest)|image\/svg)/.test(all['Content-Type']) && /\bgzip\b/.test(accept) && body.length > 512) {
      body = zlib.gzipSync(body);
      all['Content-Encoding'] = 'gzip';
      all.Vary = 'Accept-Encoding';
    }
    if (body) all['Content-Length'] = Buffer.byteLength(body);
    res.writeHead(status, all);
    res.end(req.method === 'HEAD' ? undefined : body);
  }

  function notFound(req, res) {
    const page = '<!doctype html><html lang="tr"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<meta name="robots" content="noindex"><meta name="theme-color" content="#46178F">' +
      '<title>Sayfa bulunamadı · WordChain</title><link rel="icon" href="/icons/icon.svg" type="image/svg+xml">' +
      '<link rel="stylesheet" href="/style.css"></head><body>' +
      '<div class="bg" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>' +
      '<main class="screen"><h1 class="wordmark" aria-label="404"><span>4</span><span>0</span><span>4</span></h1>' +
      '<p class="tagline">Aradığın sayfa bulunamadı.</p>' +
      '<a class="btn green linkbtn" href="/">Ana sayfaya dön</a></main></body></html>';
    send(req, res, 404, { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-cache' }, Buffer.from(page));
  }

  function indexPage(req, res, query) {
    fs.readFile(path.join(publicDir, 'index.html'), 'utf8', (err, html) => {
      if (err) return send(req, res, 500, { 'Content-Type': 'text/plain; charset=utf-8' }, Buffer.from('Sayfa yüklenemedi'));
      const origin = originOf(req);
      let title = 'WordChain';
      let desc = 'Arkadaşlarınla oynayacağın ücretsiz, reklamsız online oyunlar: Kelime Zinciri ve 20 TL Challenge.';
      let url = origin + '/';
      const code = String(query.get('oda') || '').toUpperCase();
      if (/^[A-Z0-9]{5}$/.test(code)) {
        url = origin + '/?oda=' + code;
        const room = rooms.get(code);
        if (room && room.status === 'lobby') {
          title = room.game === 'challenge' ? '20 TL Challenge odasına davetlisin' : 'WordChain odasına davetlisin';
          desc = 'Oda ' + code + ' · ' + room.players.length + '/' + room.max + ' kişi. Linke dokun, adını yaz ve oyuna katıl.';
        }
      }
      const out = html.split('%ORIGIN%').join(origin).split('%OG_TITLE%').join(title).split('%OG_DESC%').join(desc).split('%OG_URL%').join(url);
      send(req, res, 200, { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-cache' }, Buffer.from(out));
    });
  }

  function staticFile(req, res, pathname) {
    let rel;
    try { rel = decodeURIComponent(pathname).replace(/^\/+/, ''); } catch (e) { return notFound(req, res); }
    const parts = rel.split('/');
    if (rel.includes('\0') || parts.some((p, i) => p === '..' || p === '' || (p.startsWith('.') && !(i === 0 && p === '.well-known')))) {
      return notFound(req, res);
    }
    const ext = path.extname(rel).toLowerCase();
    if (!TYPES[ext]) return notFound(req, res);
    const file = path.join(publicDir, rel);
    if (!file.startsWith(publicDir + path.sep)) return notFound(req, res);
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) return notFound(req, res);
      const etag = 'W/"' + st.size.toString(16) + '-' + Math.floor(st.mtimeMs).toString(16) + '"';
      const headers = {
        'Content-Type': TYPES[ext],
        'Cache-Control': cacheControlFor(rel, ext),
        ETag: etag,
      };
      if (rel === 'sw.js') headers['Service-Worker-Allowed'] = '/';
      if (ext === '.apk') headers['Content-Disposition'] = 'attachment; filename="WordChain.apk"';
      if (req.headers['if-none-match'] === etag) {
        res.writeHead(304, Object.assign({}, securityHeaders(req), { ETag: etag, 'Cache-Control': headers['Cache-Control'] }));
        return res.end();
      }
      if (COMPRESSIBLE.has(ext) && st.size < 1024 * 1024) {
        return fs.readFile(file, (e2, buf) => send(req, res, e2 ? 500 : 200, headers, e2 ? Buffer.from('Hata') : buf));
      }
      headers['Content-Length'] = st.size;
      res.writeHead(200, Object.assign({}, securityHeaders(req), headers));
      if (req.method === 'HEAD') return res.end();
      const stream = fs.createReadStream(file);
      stream.on('error', () => res.destroy());
      stream.pipe(res);
    });
  }

  return function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return send(req, res, 405, { Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' }, Buffer.from('İzin verilmiyor'));
    }
    let u;
    try { u = new URL(req.url || '/', 'http://localhost'); } catch (e) { return notFound(req, res); }
    const p = u.pathname;
    if (p === '/healthz') return send(req, res, 200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }, Buffer.from('ok'));
    if (p === '/' || p === '/index.html') return indexPage(req, res, u.searchParams);
    if (p === '/avatars.json') {
      return send(req, res, 200, { 'Content-Type': TYPES['.json'], 'Cache-Control': 'no-cache' }, Buffer.from(JSON.stringify(avatars)));
    }
    if (p === '/topics.json') {
      return send(req, res, 200, { 'Content-Type': TYPES['.json'], 'Cache-Control': 'no-cache' }, Buffer.from(JSON.stringify(opts.topics())));
    }
    if (p === '/app-info.json') {
      return fs.stat(path.join(publicDir, 'downloads', 'WordChain.apk'), (err, st) => {
        const info = err || !st.isFile() ? { apk: false } : { apk: true, size: st.size };
        send(req, res, 200, { 'Content-Type': TYPES['.json'], 'Cache-Control': 'no-cache' }, Buffer.from(JSON.stringify(info)));
      });
    }
    if (p === '/credits') return staticFile(req, res, '/credits.html');
    if (p === '/favicon.ico') return staticFile(req, res, '/icons/favicon.ico');
    return staticFile(req, res, p);
  };
}

module.exports = { create };
