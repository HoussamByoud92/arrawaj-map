const fs = require('fs');
const path = require('path');
const { createHmac, timingSafeEqual } = require('crypto');

const COOKIE = 'arrawaj_admin_session';
const SESSION_SECONDS = 8 * 60 * 60;

function equalSecret(candidate, expected) {
  const a = Buffer.from(String(candidate), 'utf8');
  const b = Buffer.from(String(expected), 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

function sessionToken(username, password, expires) {
  const secret = createHmac('sha256', password).update(`arrawaj-admin:${username}`).digest();
  const payload = String(expires);
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function validSession(req, username, password) {
  const cookies = (req.headers.cookie || '').split(';').map((part) => part.trim());
  const raw = cookies.find((part) => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (!raw) return false;
  const [expiresText, signature] = raw.split('.');
  const expires = Number(expiresText);
  if (!Number.isSafeInteger(expires) || expires <= Math.floor(Date.now() / 1000) || !signature) return false;
  return equalSecret(signature, sessionToken(username, password, expires).split('.')[1]);
}

function loginPage(message = '') {
  const safeMessage = message.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>Connexion · Fondation Arrawaj</title><style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(ellipse at 15% 10%,#e5f4e9 0,transparent 36%),radial-gradient(ellipse at 90% 85%,#e7f1e9 0,transparent 34%),#f6f8f6;color:#17231a;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}.card{width:min(100%,440px);background:#fff;border:1px solid #e4ebe5;border-radius:24px;padding:40px;box-shadow:0 24px 70px #16331d12}.brand{display:flex;align-items:center;gap:12px;margin-bottom:34px}.mark{display:grid;place-items:center;width:44px;height:44px;border-radius:14px;background:#188f3e;color:white;font-size:20px;font-weight:800}.brand small{display:block;color:#718074;font-size:11px;letter-spacing:.13em;text-transform:uppercase;font-weight:750}.brand strong{font-size:15px}.eyebrow{color:#188f3e;font-size:12px;text-transform:uppercase;letter-spacing:.12em;font-weight:800}h1{font-size:29px;letter-spacing:-.04em;margin:8px 0}p{color:#6c786e;line-height:1.55;margin:0 0 26px;font-size:14px}label{display:block;font-size:13px;font-weight:700;margin:17px 0 8px}.field{position:relative}.field input{display:block;width:100%;height:49px;border:1px solid #dce5dd;border-radius:11px;padding:0 14px;font:inherit;outline:none;transition:border .15s,box-shadow .15s}.field input:focus{border-color:#249348;box-shadow:0 0 0 4px #188f3e18}button{width:100%;height:50px;margin-top:24px;border:0;border-radius:11px;background:#111915;color:#fff;font:inherit;font-weight:750;cursor:pointer;transition:transform .15s,background .15s}button:hover{background:#188f3e;transform:translateY(-1px)}button:disabled{opacity:.65;cursor:wait;transform:none}.error{min-height:20px;margin:12px 0 0;color:#b42318;font-size:13px}.foot{margin:23px 0 0;text-align:center;color:#9aa49b;font-size:12px}.back{display:block;margin-top:18px;color:#657468;text-align:center;text-decoration:none;font-size:13px}.back:hover{color:#188f3e}@media(max-width:480px){.card{padding:28px 23px;border-radius:19px}h1{font-size:26px}}
</style></head><body><main class="card"><div class="brand"><div class="mark" aria-hidden="true">A</div><div><small>Fondation Arrawaj</small><strong>Espace de gestion</strong></div></div><div class="eyebrow">Administration</div><h1>Bon retour</h1><p>Connectez-vous pour gérer les témoignages et le contenu de la plateforme.</p><form id="login"><label for="username">Adresse e-mail</label><div class="field"><input id="username" name="username" type="text" autocomplete="username" required autofocus></div><label for="password">Mot de passe</label><div class="field"><input id="password" name="password" type="password" autocomplete="current-password" required></div><div class="error" id="error" role="alert">${safeMessage}</div><button id="submit" type="submit">Se connecter <span aria-hidden="true">→</span></button></form><a class="back" href="/">← Retour au site</a><div class="foot">Accès réservé à l’équipe autorisée</div></main><script>
document.getElementById('login').addEventListener('submit',async function(event){event.preventDefault();const button=document.getElementById('submit'),error=document.getElementById('error');button.disabled=true;button.textContent='Connexion…';error.textContent='';try{const response=await fetch('/api/admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:document.getElementById('username').value,password:document.getElementById('password').value})});const result=await response.json();if(!response.ok)throw new Error(result.error||'Identifiants incorrects.');window.location.assign('/admin')}catch(e){error.textContent=e.message||'Connexion impossible. Réessayez.';button.disabled=false;button.innerHTML='Se connecter <span aria-hidden="true">→</span>'}});
</script></body></html>`;
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body);
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

module.exports = async (req, res) => {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (!username || !password) {
    res.status(503).setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(loginPage('La connexion admin n’est pas configurée. Vérifiez ADMIN_USERNAME et ADMIN_PASSWORD dans Vercel, puis redéployez.'));
    return;
  }

  if (req.method === 'POST') {
    let body;
    try { body = await readBody(req); } catch {
      res.status(400).json({ error: 'Requête invalide.' });
      return;
    }
    if (body.action === 'logout') {
      res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
      res.status(200).json({ ok: true });
      return;
    }
    if (!equalSecret(body.username || '', username) || !equalSecret(body.password || '', password)) {
      res.status(401).json({ error: 'Adresse e-mail ou mot de passe incorrect.' });
      return;
    }
    const expires = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
    res.setHeader('Set-Cookie', `${COOKIE}=${sessionToken(username, password, expires)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_SECONDS}`);
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD, POST');
    res.status(405).send('Method not allowed.');
    return;
  }

  if (!validSession(req, username, password)) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(req.method === 'HEAD' ? '' : loginPage());
    return;
  }

  try {
    const html = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(req.method === 'HEAD' ? '' : html);
  } catch {
    res.status(500).send('Admin page is unavailable.');
  }
};
