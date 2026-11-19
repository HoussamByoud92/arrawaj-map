const fs = require('fs');
const path = require('path');
const { timingSafeEqual } = require('crypto');

function equalSecret(candidate, expected) {
  const a = Buffer.from(candidate, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

module.exports = (req, res) => {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(503).send('Admin authentication is not configured.');
    return;
  }

  const header = req.headers.authorization || '';
  const encoded = header.match(/^Basic\s+(.+)$/i)?.[1];
  let suppliedUser = '';
  let suppliedPassword = '';
  if (encoded) {
    try {
      const decoded = Buffer.from(encoded, 'base64').toString('utf8');
      const colon = decoded.indexOf(':');
      if (colon >= 0) {
        suppliedUser = decoded.slice(0, colon);
        suppliedPassword = decoded.slice(colon + 1);
      }
    } catch {}
  }

  if (!equalSecret(suppliedUser, username) || !equalSecret(suppliedPassword, password)) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Arrawaj Admin", charset="UTF-8"');
    res.setHeader('Cache-Control', 'no-store');
    res.status(401).send('Authentication required.');
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    res.status(405).send('Method not allowed.');
    return;
  }

  try {
    const html = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.status(200).send(req.method === 'HEAD' ? '' : html);
  } catch {
    res.status(500).send('Admin page is unavailable.');
  }
};
