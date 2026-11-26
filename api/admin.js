const fs = require('fs');
const path = require('path');
const { createHmac, timingSafeEqual } = require('crypto');
const auth = require('./_auth');

const LEGACY_COOKIE = 'arrawaj_admin_legacy';
function legacySession(req) {
  const raw = (req.headers.cookie || '').split(';').map(part=>part.trim()).find(part=>part.startsWith(`${LEGACY_COOKIE}=`))?.slice(LEGACY_COOKIE.length+1)||'';
  const [expiresText,signature]=raw.split('.');const expires=Number(expiresText);
  if(!Number.isSafeInteger(expires)||expires<=Math.floor(Date.now()/1000)||!signature)return false;
  const expected=createHmac('sha256',process.env.ADMIN_PASSWORD||'').update(expiresText).digest('base64url');
  const a=Buffer.from(signature),b=Buffer.from(expected);return a.length===b.length&&timingSafeEqual(a,b);
}
function setLegacySession(res) {
  const expires=Math.floor(Date.now()/1000)+8*60*60;
  const signature=createHmac('sha256',process.env.ADMIN_PASSWORD).update(String(expires)).digest('base64url');
  res.setHeader('Set-Cookie',`${LEGACY_COOKIE}=${expires}.${signature}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`);
}

function loginPage(message = '') {
  const safeMessage = message.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>Connexion · Fondation Arrawaj</title><style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(ellipse at 15% 10%,#e5f4e9 0,transparent 36%),radial-gradient(ellipse at 90% 85%,#e7f1e9 0,transparent 34%),#f6f8f6;color:#17231a;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}.card{width:min(100%,440px);background:#fff;border:1px solid #e4ebe5;border-radius:24px;padding:40px;box-shadow:0 24px 70px #16331d12}.brand{display:flex;align-items:center;gap:12px;margin-bottom:34px}.mark{display:grid;place-items:center;width:44px;height:44px;border-radius:14px;background:#188f3e;color:white;font-size:20px;font-weight:800}.brand small{display:block;color:#718074;font-size:11px;letter-spacing:.13em;text-transform:uppercase;font-weight:750}.brand strong{font-size:15px}.eyebrow{color:#188f3e;font-size:12px;text-transform:uppercase;letter-spacing:.12em;font-weight:800}h1{font-size:29px;letter-spacing:-.04em;margin:8px 0}p{color:#6c786e;line-height:1.55;margin:0 0 26px;font-size:14px}label{display:block;font-size:13px;font-weight:700;margin:17px 0 8px}.field input{display:block;width:100%;height:49px;border:1px solid #dce5dd;border-radius:11px;padding:0 14px;font:inherit;outline:none}.field input:focus{border-color:#249348;box-shadow:0 0 0 4px #188f3e18}button{width:100%;height:50px;margin-top:24px;border:0;border-radius:11px;background:#111915;color:#fff;font:inherit;font-weight:750;cursor:pointer}button:hover{background:#188f3e}button:disabled{opacity:.65;cursor:wait}.error{min-height:20px;margin:12px 0 0;color:#b42318;font-size:13px}.foot{margin:23px 0 0;text-align:center;color:#9aa49b;font-size:12px}.back{display:block;margin-top:18px;color:#657468;text-align:center;text-decoration:none;font-size:13px}@media(max-width:480px){.card{padding:28px 23px}}
</style></head><body><main class="card"><div class="brand"><div class="mark">A</div><div><small>Fondation Arrawaj</small><strong>Espace de gestion</strong></div></div><div class="eyebrow">Administration</div><h1>Bon retour</h1><p>Connectez-vous pour gérer le contenu de la plateforme.</p><form id="login"><label for="username">Adresse e-mail</label><div class="field"><input id="username" autocomplete="username" required autofocus></div><label for="password">Mot de passe</label><div class="field"><input id="password" type="password" autocomplete="current-password" required></div><div class="error" id="error" role="alert">${safeMessage}</div><button id="submit">Se connecter <span aria-hidden="true">→</span></button></form><a class="back" href="/">← Retour au site</a><div class="foot">Accès réservé à l’équipe autorisée</div></main><script>
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
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD) {
    res.status(503).setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(loginPage('Les identifiants admin ne sont pas configurés dans Vercel.'));
    return;
  }
  const sharedStorageReady=!!process.env.ADMIN_GITHUB_TOKEN&&!!process.env.ADMIN_SESSION_SECRET&&process.env.ADMIN_SESSION_SECRET.length>=32;

  if (req.method === 'POST') {
    let body;
    try { body = await readBody(req); } catch {
      res.status(400).json({ error: 'Requête invalide.' });
      return;
    }
    if (body.action === 'logout') {
      res.setHeader('Set-Cookie', [`${auth.COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`,`${LEGACY_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`]);
      res.status(200).json({ ok: true });
      return;
    }
    if(!sharedStorageReady){
      if(body.username!==process.env.ADMIN_USERNAME||body.password!==process.env.ADMIN_PASSWORD){res.status(401).json({error:'Adresse e-mail ou mot de passe incorrect.'});return;}
      setLegacySession(res);res.status(200).json({ok:true,sharedStorageReady:false});return;
    }
    try {
      const record = await auth.loadUsers();
      const users = record.value.users || [];
      let user = users.find((item) => item.username.toLowerCase() === String(body.username || '').trim().toLowerCase() && item.active !== false);
      if (!users.some((item) => item.id === 'owner') && body.username === process.env.ADMIN_USERNAME && body.password === process.env.ADMIN_PASSWORD) {
        const { salt, passwordHash } = await auth.makePasswordHash(process.env.ADMIN_PASSWORD);
        user = { id: 'owner', username: process.env.ADMIN_USERNAME, displayName: 'Administrateur principal', role: 'owner', active: true, permissions: auth.ALL_PERMISSIONS, salt, passwordHash };
        users.push(user);
        await auth.writeUsers(users, record.sha, 'Initialize Arrawaj administrator account');
      } else if (user && !(await auth.checkPassword(String(body.password || ''), user))) {
        user = null;
      }
      if (!user) {
        res.status(401).json({ error: 'Adresse e-mail ou mot de passe incorrect.' });
        return;
      }
      const session = auth.createSession(user.id);
      res.setHeader('Set-Cookie', `${auth.COOKIE}=${session.value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${auth.SESSION_SECONDS}`);
      res.status(200).json({ ok: true });
    } catch (error) {
      res.status(503).json({ error: error.message || 'Le stockage partagé est indisponible.' });
    }
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD, POST');
    res.status(405).send('Method not allowed.');
    return;
  }
  if(!sharedStorageReady){
    if(!legacySession(req)){res.setHeader('Content-Type','text/html; charset=utf-8');res.status(200).send(req.method==='HEAD'?'':loginPage('Le stockage partagé doit être configuré pour activer les fonctions collaboratives.'));return;}
    const html=fs.readFileSync(path.join(__dirname,'..','admin.html'),'utf8');res.setHeader('Content-Type','text/html; charset=utf-8');res.status(200).send(req.method==='HEAD'?'':html);return;
  }
  try {
    const user = await auth.currentUser(req);
    if (!user) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.status(200).send(req.method === 'HEAD' ? '' : loginPage());
      return;
    }
    const html = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(req.method === 'HEAD' ? '' : html);
  } catch (error) {
    res.status(503).send(error.message || 'Admin page is unavailable.');
  }
};
