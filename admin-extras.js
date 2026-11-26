/* Shared CMS controls: profiles, team accounts, page sections, and client photos. */
(() => {
  const style = document.createElement('style');
  style.textContent = `.extra-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.extra-list{display:grid;gap:10px;margin-top:14px}.extra-row{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:14px;border:1px solid #e4ebe5;border-radius:12px;background:#fff}.extra-row p{margin:4px 0 0;color:#6c786e;font-size:13px}.extra-perms{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:12px 0}.extra-perms label{display:flex;align-items:center;gap:8px}.extra-perms input{width:auto}.extra-photo{display:flex;align-items:center;gap:14px}.extra-photo img{width:62px;height:62px;border-radius:50%;object-fit:cover;background:#eef3ef}.extra-note{padding:11px 13px;border-radius:10px;background:#f0f6f1;color:#536157;font-size:13px;line-height:1.5}.extra-media-preview{max-width:180px;max-height:120px;border-radius:10px;object-fit:cover}.extra-inline-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}@media(max-width:620px){.extra-grid{grid-template-columns:1fr}.extra-row{align-items:flex-start;flex-direction:column}.extra-perms{grid-template-columns:1fr}}`;
  document.head.append(style);

  const content = document.getElementById('content');
  let currentUser = null;
  let managedUsers = [];
  let editingUserId = '';
  let editingSectionId = '';
  const baseRender = window.render;
  const baseSave = window.save;

  async function api(action, extra = {}) {
    const response = await fetch('/api/cms', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...extra }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'La modification n’a pas pu être enregistrée.');
    return result;
  }

  async function reloadShared() {
    const response = await fetch('/api/cms', { cache: 'no-store' });
    if (!response.ok) throw new Error('Impossible de charger les données partagées.');
    const result = await response.json();
    currentUser = result.user;
    managedUsers = result.users || [];
    if (result.data) {
      const shared = result.data;
      const hasSharedVersion=Number(shared.updatedAt||0)>0;
      if (hasSharedVersion && Array.isArray(shared.stories)) data.stories = shared.stories;
      if (hasSharedVersion || Array.isArray(shared.requests)&&shared.requests.length) data.requests = shared.requests || [];
      if (hasSharedVersion) data.content = { ...data.content, ...(shared.content || {}) };
      data.sections = hasSharedVersion ? (shared.sections || []) : (data.sections || []);
      data.settings = { ...data.settings, ...(shared.settings || {}) };
      data.updatedAt = shared.updatedAt || 0;
      if(!hasSharedVersion&&currentUser?.id==='owner'){
        const seeded=await api('save',{data});data.updatedAt=seeded.updatedAt||Date.now();
      }
    }
    localStorage.setItem(KEY, JSON.stringify(data));
    return result;
  }

  function save(message = 'Modifications enregistrées', type = 'success') {
    baseSave('', type);
    api('save', { data }).then(() => {
      if (message) notify('Enregistré', 'Les modifications sont partagées avec le site.', 'success');
    }).catch((error) => notify('Synchronisation impossible', error.message, 'error'));
  }

  function addTab(id, label, icon) {
    const nav = document.querySelector('.sidebar nav');
    if (nav.querySelector(`[data-tab="${id}"]`)) return;
    const button = document.createElement('button');
    button.dataset.tab = id;
    button.innerHTML = `<span class="side-icon">${icon}</span>${label}`;
    button.addEventListener('click', () => { tab = id; render(); });
    nav.append(button);
  }

  function photoUploadMarkup(story) {
    const src = story.photo || '';
    return `<div class="extra-photo"><img id="storyPhotoPreview" src="${esc(src)}" alt="Photo du client" style="${src ? '' : 'display:none'}"><label>Photo du client<input id="storyPhotoUpload" type="file" accept="image/png,image/jpeg,image/webp,image/avif"><small>PNG, JPEG, WebP ou AVIF · 3 Mo maximum · enregistrée dans /images</small></label><input type="hidden" data-k="photo" id="storyPhotoPath" value="${esc(src)}"></div>`;
  }

  const baseEditorForm = editorForm;
  editorForm = function (story) {
    return baseEditorForm(story).replace('<div class="grid">', `<div class="grid">${photoUploadMarkup(story)}`);
  };

  async function uploadImage(file, area) {
    if (!file || !file.type.startsWith('image/')) throw new Error('Choisissez un fichier image.');
    if (file.size > 3 * 1024 * 1024) throw new Error('L’image doit faire 3 Mo maximum.');
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    const result = await api('upload-image', { area, name: file.name.replace(/\.[^.]+$/, ''), mime: file.type, base64: btoa(binary) });
    return result.path;
  }

  document.addEventListener('change', async (event) => {
    if (event.target.id === 'storyPhotoUpload') {
      const file = event.target.files?.[0]; if (!file) return;
      try {
        const path = await uploadImage(file, 'stories');
        document.getElementById('storyPhotoPath').value = path;
        const preview = document.getElementById('storyPhotoPreview'); preview.src = path; preview.style.display = '';
        notify('Image importée', 'La photo a été ajoutée au dossier /images. Enregistrez le témoignage pour l’associer au client.');
      } catch (error) { notify('Import impossible', error.message, 'error'); }
    }
    if (event.target.id === 'sectionImageUpload') {
      const file = event.target.files?.[0]; if (!file) return;
      try {
        const path = await uploadImage(file, 'content');
        document.getElementById('sectionMedia').value = path;
        document.getElementById('sectionImagePreview').src = path;
        document.getElementById('sectionImagePreview').hidden = false;
        notify('Image importée', 'Le média a été ajouté au dossier /images. Enregistrez la section pour le publier.');
      } catch (error) { notify('Import impossible', error.message, 'error'); }
    }
  });

  function renderSections() {
    const sections = [...(data.sections || [])].sort((a, b) => (Number(a.position) || 0) - (Number(b.position) || 0));
    content.insertAdjacentHTML('beforeend', `<div class="card"><h2>Sections supplémentaires</h2><p class="muted">Ajoutez des sections bilingues et placez-les avant une section existante.</p><form id="sectionForm"><div class="extra-grid"><label>Titre — Français<input id="sectionTitle" required></label><label class="arabic-field" dir="rtl">العنوان — العربية<input id="sectionTitleAr" required></label><label>Description — Français<textarea id="sectionBody"></textarea></label><label class="arabic-field" dir="rtl">الوصف — العربية<textarea id="sectionBodyAr" dir="rtl"></textarea></label><label>Position sur la page<select id="sectionPosition">${Array.from({length:4},(_,i)=>`<option value="${i}">${i===0?'Avant la carte':i===1?'Après la carte':i===2?'Après les témoignages':'Avant le pied de page'}</option>`).join('')}</select></label><label>Type de média<select id="sectionMediaType"><option value="image">Image du dossier /images</option><option value="video">Vidéo (URL directe)</option><option value="youtube">YouTube</option></select></label><label>URL vidéo / YouTube<input id="sectionMedia" placeholder="https://…"></label><label>Importer une image<input id="sectionImageUpload" type="file" accept="image/png,image/jpeg,image/webp,image/avif"><img id="sectionImagePreview" class="extra-media-preview" hidden alt="Aperçu du média"></label></div><div class="actions"><button type="submit">${editingSectionId?'Enregistrer la section':'Ajouter la section'}</button><button type="button" class="secondary" id="sectionCancel">Annuler</button></div></form><div class="extra-list">${sections.map((section,index)=>`<div class="extra-row"><div><strong>${esc(section.title||'Sans titre')}</strong> · <span dir="rtl">${esc(section.titleAr||'')}</span><p>Position ${index+1} · ${esc(section.mediaType||'image')}</p></div><div class="extra-inline-actions"><button class="secondary" data-section-edit="${esc(section.id)}">Modifier</button><button class="secondary" data-section-up="${esc(section.id)}" ${index===0?'disabled':''}>↑</button><button class="secondary" data-section-down="${esc(section.id)}" ${index===sections.length-1?'disabled':''}>↓</button><button class="danger" data-section-delete="${esc(section.id)}">Supprimer</button></div></div>`).join('') || '<p class="empty">Aucune section supplémentaire.</p>'}</div></div>`);
    const form = document.getElementById('sectionForm');
    document.getElementById('sectionCancel').onclick = () => { editingSectionId = ''; render(); };
    if (editingSectionId) {
      const item = sections.find(section => section.id === editingSectionId);
      if (item) {
        document.getElementById('sectionTitle').value = item.title || '';
        document.getElementById('sectionTitleAr').value = item.titleAr || '';
        document.getElementById('sectionBody').value = item.body || '';
        document.getElementById('sectionBodyAr').value = item.bodyAr || '';
        document.getElementById('sectionPosition').value = String(item.position || 0);
        document.getElementById('sectionMediaType').value = item.mediaType || 'image';
        document.getElementById('sectionMedia').value = item.media || '';
        if (item.mediaType === 'image' && item.media) { const preview=document.getElementById('sectionImagePreview');preview.src=item.media;preview.hidden=false; }
      }
    }
    form.onsubmit = (event) => {
      event.preventDefault();
      const old = sections.find(section => section.id === editingSectionId);
      const next = { id: editingSectionId || `section-${Date.now().toString(36)}`, title: document.getElementById('sectionTitle').value.trim(), titleAr: document.getElementById('sectionTitleAr').value.trim(), body: document.getElementById('sectionBody').value.trim(), bodyAr: document.getElementById('sectionBodyAr').value.trim(), position: Number(document.getElementById('sectionPosition').value), mediaType: document.getElementById('sectionMediaType').value, media: document.getElementById('sectionMedia').value.trim(), active: old?.active !== false };
      const current = data.sections || [];
      if (old) data.sections = current.map(section => section.id === old.id ? next : section); else data.sections = [...current, next];
      editingSectionId = ''; save(old ? 'La section a été modifiée.' : 'La section a été ajoutée.');
    };
    content.querySelectorAll('[data-section-edit]').forEach(button => button.onclick = () => { editingSectionId=button.dataset.sectionEdit;render(); });
    content.querySelectorAll('[data-section-delete]').forEach(button => button.onclick = () => { data.sections=data.sections.filter(item=>item.id!==button.dataset.sectionDelete);save('La section a été supprimée.'); });
    content.querySelectorAll('[data-section-up],[data-section-down]').forEach(button => button.onclick = () => {
      const list=[...(data.sections||[])].sort((a,b)=>(Number(a.position)||0)-(Number(b.position)||0)),i=list.findIndex(item=>item.id===button.dataset.sectionUp||item.id===button.dataset.sectionDown),j=i+(button.hasAttribute('data-section-up')?-1:1);
      if(i<0||j<0||j>=list.length)return;[list[i],list[j]]=[list[j],list[i]];list.forEach((item,index)=>item.position=index);data.sections=list;save('L’ordre des sections a été modifié.');
    });
  }

  function renderProfile() {
    content.innerHTML = `<div class="card"><h2>Mon profil</h2><p class="muted">Compte : ${esc(currentUser?.username||'')}</p><form id="profileForm"><label>Nom affiché<input id="profileName" value="${esc(currentUser?.displayName||'')}" maxlength="80"></label><label>Adresse e-mail<input id="profileEmail" type="email" value="${esc(currentUser?.username||'')}" required></label><label>Nouveau mot de passe<input id="profilePassword" type="password" autocomplete="new-password" minlength="12" placeholder="Laisser vide pour ne pas le modifier"></label><p class="extra-note">Le nouveau mot de passe doit contenir au moins 12 caractères. Il remplace celui de ce compte dans le stockage partagé.</p><button type="submit">Enregistrer mon profil</button></form></div>`;
    document.getElementById('profileForm').onsubmit = async event => {
      event.preventDefault();
      try { const result=await api('save-profile',{displayName:document.getElementById('profileName').value,username:document.getElementById('profileEmail').value,password:document.getElementById('profilePassword').value});currentUser=result.user;document.getElementById('profilePassword').value='';notify('Profil enregistré','Vos informations ont été mises à jour.');render(); }
      catch(error){notify('Enregistrement impossible',error.message,'error')}
    };
  }

  function renderUsers() {
    if (!currentUser?.permissions?.users && currentUser?.id !== 'owner') { content.innerHTML='<div class="card"><h2>Accès non autorisé</h2><p>Votre compte ne peut pas gérer les utilisateurs.</p></div>'; return; }
    const editing=managedUsers.find(user=>user.id===editingUserId);
    content.innerHTML = `<div class="card"><h2>Comptes de l’équipe</h2><p class="muted">Créez des comptes et choisissez précisément leurs droits.</p><form id="userForm"><input id="userId" type="hidden" value="${esc(editing?.id||'')}"><div class="extra-grid"><label>Nom affiché<input id="userName" value="${esc(editing?.displayName||'')}" required></label><label>Adresse e-mail<input id="userEmail" type="email" value="${esc(editing?.username||'')}" required></label><label>Rôle<select id="userRole"><option value="admin">Administrateur</option><option value="editor">Éditeur</option><option value="viewer">Consultation</option></select></label><label>Mot de passe<input id="userPassword" type="password" minlength="12" ${editing?'':'required'} placeholder="${editing?'Laisser vide pour ne pas le modifier':'12 caractères minimum'}"></label></div><div class="extra-perms">${[['stories','Gérer les témoignages'],['content','Gérer le contenu et les sections'],['users','Gérer les comptes'],['settings','Modifier les paramètres']].map(([key,label])=>`<label><input type="checkbox" id="perm-${key}" ${editing?.permissions?.[key]?'checked':''}>${label}</label>`).join('')}</div><label class="toggle"><input type="checkbox" id="userActive" ${editing?.active===false?'':'checked'}>Compte actif</label><div class="actions"><button type="submit">${editing?'Enregistrer le compte':'Créer le compte'}</button><button type="button" class="secondary" id="userCancel">Annuler</button></div></form></div><div class="card"><h3>Utilisateurs existants</h3><div class="extra-list">${managedUsers.map(user=>`<div class="extra-row"><div><strong>${esc(user.displayName||user.username)}</strong><p>${esc(user.username)} · ${esc(user.role)}${user.id==='owner'?' · compte principal':''}</p></div><div class="extra-inline-actions">${user.id==='owner'?'<span class="pill">Protégé</span>':`<button class="secondary" data-user-edit="${esc(user.id)}">Modifier</button><button class="danger" data-user-disable="${esc(user.id)}">${user.active===false?'Désactivé':'Désactiver'}</button>`}</div></div>`).join('')}</div></div>`;
    if(editing)document.getElementById('userRole').value=editing.role;
    document.getElementById('userRole').onchange=()=>{
      const preset={admin:{stories:true,content:true,users:true,settings:true},editor:{stories:true,content:true,users:false,settings:false},viewer:{stories:false,content:false,users:false,settings:false}}[document.getElementById('userRole').value];
      Object.entries(preset).forEach(([key,value])=>document.getElementById(`perm-${key}`).checked=value);
    };
    document.getElementById('userCancel').onclick=()=>{editingUserId='';render()};
    document.getElementById('userForm').onsubmit=async event=>{
      event.preventDefault();const input={id:document.getElementById('userId').value,displayName:document.getElementById('userName').value,username:document.getElementById('userEmail').value,role:document.getElementById('userRole').value,password:document.getElementById('userPassword').value,active:document.getElementById('userActive').checked,permissions:Object.fromEntries(['stories','content','users','settings'].map(key=>[key,document.getElementById(`perm-${key}`).checked]))};
      try{await api('save-user',{user:input});editingUserId='';await reloadShared();render();notify('Compte enregistré','Les accès ont été mis à jour.')}catch(error){notify('Enregistrement impossible',error.message,'error')}
    };
    content.querySelectorAll('[data-user-edit]').forEach(button=>button.onclick=()=>{editingUserId=button.dataset.userEdit;render()});
    content.querySelectorAll('[data-user-disable]').forEach(button=>button.onclick=async()=>{try{await api('delete-user',{id:button.dataset.userDisable});await reloadShared();render();notify('Compte désactivé','Cet utilisateur ne peut plus se connecter.')}catch(error){notify('Action impossible',error.message,'error')}});
  }

  function render() {
    if (tab === 'profile') { renderProfile(); document.querySelectorAll('[data-tab]').forEach(button=>button.classList.toggle('active',button.dataset.tab===tab)); return; }
    if (tab === 'users') { renderUsers(); document.querySelectorAll('[data-tab]').forEach(button=>button.classList.toggle('active',button.dataset.tab===tab)); return; }
    const permission={requests:'stories',stories:'stories',page:'content',settings:'settings'}[tab];
    if(permission&&!currentUser?.permissions?.[permission]&&currentUser?.id!=='owner'){content.innerHTML='<div class="card"><h2>Accès non autorisé</h2><p>Votre compte ne dispose pas de cette permission.</p></div>';return;}
    baseRender();
    if (tab === 'page') renderSections();
  }

  window.render = render;
  window.save = save;
  addTab('profile', 'Mon profil', '◉');

  const nav = document.querySelector('.sidebar nav');
  const userTab = document.createElement('button');
  userTab.dataset.tab = 'users'; userTab.innerHTML = '<span class="side-icon">♙</span>Utilisateurs'; userTab.hidden = true;
  userTab.addEventListener('click', () => { tab='users';render(); }); nav.append(userTab);

  reloadShared().then(() => {
    const canManageUsers=currentUser?.id==='owner'||currentUser?.permissions?.users;
    userTab.hidden=!canManageUsers;
    document.querySelector('[data-tab="page"]').hidden=!(currentUser?.permissions?.content||currentUser?.id==='owner');
    document.querySelector('[data-tab="stories"]').hidden=!(currentUser?.permissions?.stories||currentUser?.id==='owner');
    document.querySelector('[data-tab="requests"]').hidden=!(currentUser?.permissions?.stories||currentUser?.id==='owner');
    document.querySelector('[data-tab="settings"]').hidden=!(currentUser?.permissions?.settings||currentUser?.id==='owner');
    render();
  }).catch(error=>{
    document.querySelector('[data-tab="profile"]').hidden=true;
    userTab.hidden=true;
    const notice=document.querySelector('.notice');
    if(notice)notice.innerHTML='<b>Configuration requise :</b> les comptes, images et contenus partagés nécessitent ADMIN_GITHUB_TOKEN et ADMIN_SESSION_SECRET dans Vercel, puis un redéploiement. Les modifications ne seront pas partagées avant cette configuration.';
    notify('Stockage partagé indisponible',error.message,'error');
  });

})();
