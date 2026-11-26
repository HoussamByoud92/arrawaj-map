const github = require('./_github');
const auth = require('./_auth');
const secure = require('./_secure');

const CMS_PATH = 'data/site-content.json';
const DEFAULTS = { requests: [], stories: [], sections: [], content: {}, settings: { showTestimonials: true, showMap: true }, updatedAt: 0 };

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body);
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

function publicData(data) {
  const { requests, ...publicContent } = data;
  return publicContent;
}

function sanitizeUser(user) {
  const { salt, passwordHash, ...safe } = user;
  return safe;
}

function imageExtension(mime) {
  return ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif' })[mime] || null;
}

function imageMatchesType(bytes, mime) {
  if (mime === 'image/png') return bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mime === 'image/jpeg') return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === 'image/webp') return bytes.length > 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  if (mime === 'image/avif') return bytes.length > 12 && bytes.toString('ascii', 4, 8) === 'ftyp' && /^(avif|avis)$/.test(bytes.toString('ascii', 8, 12));
  return false;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    const [record, user] = await Promise.all([github.readJson(CMS_PATH, null), auth.currentUser(req)]);
    const stored = secure.open(record.value, DEFAULTS);
    const data = { ...DEFAULTS, ...stored };
    if (req.method === 'GET') {
      if (!user) res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=600');
      let users = null;
      if (user && auth.hasPermission(user, 'users')) {
        const usersRecord = await auth.loadUsers();
        users = (usersRecord.value.users || []).map(sanitizeUser);
      }
      let visibleData = user ? { ...data } : publicData(data);
      if (user && !auth.hasPermission(user, 'stories')) visibleData = { ...visibleData, requests: [], stories: [] };
      if (user && !auth.hasPermission(user, 'content')) visibleData = { ...visibleData, content: {}, sections: [] };
      if (user && !auth.hasPermission(user, 'settings')) visibleData = { ...visibleData, settings: { showTestimonials: true, showMap: true } };
      res.status(200).json({ data: visibleData, user: user ? sanitizeUser(user) : null, users });
      return;
    }
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      res.status(405).json({ error: 'Method not allowed.' });
      return;
    }
    if (!user) {
      res.status(401).json({ error: 'Session expirée. Reconnectez-vous.' });
      return;
    }

    const body = await readBody(req);
    if (body.action === 'upload-image') {
      if (!auth.hasPermission(user, body.area === 'content' ? 'content' : 'stories')) {
        res.status(403).json({ error: 'Vous n’avez pas la permission d’importer ce média.' });
        return;
      }
      const extension = imageExtension(body.mime);
      const bytes = Buffer.from(String(body.base64 || ''), 'base64');
      if (!extension || !imageMatchesType(bytes, body.mime) || bytes.length > 3 * 1024 * 1024) {
        res.status(400).json({ error: 'Choisissez une image PNG, JPEG, WebP ou AVIF de 3 Mo maximum.' });
        return;
      }
      const baseName = String(body.name || 'client-image').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 55) || 'media';
      const filePath = `images/${baseName}-${Date.now()}.${extension}`;
      await github.writeFile(filePath, bytes, null, `Add image ${baseName}`);
      res.status(200).json({ path: `/${filePath}` });
      return;
    }

    if (body.action === 'save') {
      const next = { ...DEFAULTS, ...(body.data || {}), updatedAt: Date.now() };
      if (!auth.hasPermission(user, 'stories')) { next.stories=data.stories; next.requests=data.requests; }
      if (!auth.hasPermission(user, 'content')) { next.content=data.content; next.sections=data.sections; }
      if (!auth.hasPermission(user, 'settings')) next.settings=data.settings;
      await github.writeJson(CMS_PATH, secure.seal(next), record.sha, `Update Arrawaj ${user.username} content`);
      res.status(200).json({ ok: true, updatedAt: next.updatedAt });
      return;
    }

    if (body.action === 'save-profile') {
      const usersRecord = await auth.loadUsers();
      const users = usersRecord.value.users || [];
      const index = users.findIndex((item) => item.id === user.id);
      if (index < 0) { res.status(404).json({ error: 'Compte introuvable.' }); return; }
      const username = String(body.username || users[index].username).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(username)) { res.status(400).json({ error: 'Saisissez une adresse e-mail valide.' }); return; }
      if (users.some((item, i) => i !== index && item.username.toLowerCase() === username)) { res.status(409).json({ error: 'Cette adresse e-mail est déjà utilisée.' }); return; }
      const updated = { ...users[index], username, displayName: String(body.displayName || '').trim().slice(0, 80) || users[index].displayName };
      if (body.password) {
        if (String(body.password).length < 12) { res.status(400).json({ error: 'Le mot de passe doit contenir au moins 12 caractères.' }); return; }
        Object.assign(updated, await auth.makePasswordHash(String(body.password)));
      }
      users[index] = updated;
      await auth.writeUsers(users, usersRecord.sha, `Update admin profile ${user.username}`);
      res.status(200).json({ user: sanitizeUser(updated) });
      return;
    }

    if (body.action === 'save-user') {
      if (!auth.hasPermission(user, 'users')) { res.status(403).json({ error: 'Vous ne pouvez pas gérer les comptes.' }); return; }
      const usersRecord = await auth.loadUsers();
      const users = usersRecord.value.users || [];
      const input = body.user || {};
      const id = String(input.id || '');
      const username = String(input.username || '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(username)) { res.status(400).json({ error: 'Saisissez une adresse e-mail valide.' }); return; }
      if (!['admin', 'editor', 'viewer'].includes(input.role)) { res.status(400).json({ error: 'Rôle invalide.' }); return; }
      if (id === 'owner') { res.status(403).json({ error: 'Le compte principal ne peut pas être modifié ici.' }); return; }
      const index = id ? users.findIndex((item) => item.id === id) : -1;
      if (index < 0 && !input.password) { res.status(400).json({ error: 'Un mot de passe est requis pour créer un compte.' }); return; }
      if (input.password && String(input.password).length < 12) { res.status(400).json({ error: 'Le mot de passe doit contenir au moins 12 caractères.' }); return; }
      if (users.some((item, i) => i !== index && item.username.toLowerCase() === username)) { res.status(409).json({ error: 'Cette adresse e-mail est déjà utilisée.' }); return; }
      const permissions = Object.fromEntries(['stories', 'content', 'users', 'settings'].map((key) => [key, input.permissions?.[key] === true]));
      const updated = { ...(index >= 0 ? users[index] : {}), id: index >= 0 ? id : `user-${Date.now().toString(36)}`, username, displayName: String(input.displayName || '').trim().slice(0, 80), role: input.role, permissions, active: input.active !== false };
      if (input.password) Object.assign(updated, await auth.makePasswordHash(String(input.password)));
      if (index >= 0) users[index] = updated; else users.push(updated);
      await auth.writeUsers(users, usersRecord.sha, `Manage Arrawaj admin user ${username}`);
      res.status(200).json({ user: sanitizeUser(updated) });
      return;
    }

    if (body.action === 'delete-user') {
      if (!auth.hasPermission(user, 'users')) { res.status(403).json({ error: 'Vous ne pouvez pas gérer les comptes.' }); return; }
      const usersRecord = await auth.loadUsers();
      const users = usersRecord.value.users || [];
      const target = users.find((item) => item.id === body.id);
      if (!target || target.id === 'owner') { res.status(400).json({ error: 'Ce compte ne peut pas être supprimé.' }); return; }
      target.active = false;
      await auth.writeUsers(users, usersRecord.sha, `Deactivate Arrawaj admin user ${target.username}`);
      res.status(200).json({ ok: true });
      return;
    }

    res.status(400).json({ error: 'Action inconnue.' });
  } catch (error) {
    res.status(503).json({ error: error.message || 'Le stockage partagé est indisponible.' });
  }
};
