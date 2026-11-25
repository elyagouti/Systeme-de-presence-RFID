'use strict';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function api(action, body = null, query = '') {
  const res = await fetch(`api.php?action=${action}${query}`, {
    method: body ? 'POST' : 'GET',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({ ok: false, error: 'Réponse invalide du serveur.' }));
  if (res.status === 401 && action !== 'login' && action !== 'session') showLogin();
  if (!res.ok) throw new Error(data.error || 'Erreur');
  return data;
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ---------- Connexion ---------- */
function showLogin() { $('#login').hidden = false; $('#app').hidden = true; stopPolling(); }
function showApp() { $('#login').hidden = true; $('#app').hidden = false; switchTab('dashboard'); startPolling(); }

async function doLogin() {
  $('#l-err').textContent = '';
  try {
    await api('login', { username: $('#l-user').value, password: $('#l-pass').value });
    $('#l-pass').value = '';
    showApp();
  } catch (e) { $('#l-err').textContent = e.message; }
}
$('#l-btn').onclick = doLogin;
$('#l-pass').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
$('#logout').onclick = async () => { await api('logout', {}); showLogin(); };

/* ---------- Onglets ---------- */
let currentTab = 'dashboard';
function switchTab(name) {
  currentTab = name;
  $$('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  $$('.tab').forEach(s => s.hidden = s.id !== 'tab-' + name);
  ({ dashboard: loadDashboard, users: loadUsers, logs: initLogs, devices: loadDevices })[name]();
}
$$('#tabs button').forEach(b => b.onclick = () => switchTab(b.dataset.tab));

/* ---------- Tableau de bord ---------- */
const fmtTime = t => (t || '').slice(0, 5);
function duration(a, b) {
  if (!a || !b) return '';
  const [h1, m1] = a.split(':').map(Number), [h2, m2] = b.split(':').map(Number);
  const mins = (h2 * 60 + m2) - (h1 * 60 + m1);
  return mins < 0 ? '' : `${Math.floor(mins / 60)} h ${String(mins % 60).padStart(2, '0')}`;
}

let lastEventKey = '';
let resetTimer;
function renderReader(ev) {
  const r = $('#reader');
  if (!ev || !ev.event_at) return;
  const key = ev.event_at + ev.event + ev.card_uid;
  if (key === lastEventKey) return;
  lastEventKey = key;

  const when = new Date(ev.event_at.replace(' ', 'T'));
  const fresh = Date.now() - when.getTime() < 8000;
  const msg = {
    login:   [`${ev.user_name} est entré(e)`, 'Entrée enregistrée.'],
    logout:  [`${ev.user_name} est sorti(e)`, 'Sortie enregistrée.'],
    unknown: ['Badge inconnu', `UID ${ev.card_uid} : ajoutez-le dans l’onglet Utilisateurs.`],
    enroll:  [ev.user_name ? 'Badge déjà attribué' : 'Nouveau badge lu',
              ev.user_name ? `Attribué à ${ev.user_name}.` : `UID ${ev.card_uid} prêt à être attribué.`],
  }[ev.event];
  if (!msg) return;
  r.dataset.state = ev.event;
  $('#r-title').textContent = msg[0];
  $('#r-sub').textContent = msg[1];
  $('#r-time').textContent = when.toLocaleTimeString('fr-FR');
  clearTimeout(resetTimer);
  if (fresh) {
    resetTimer = setTimeout(() => {
      r.dataset.state = 'idle';
      $('#r-title').textContent = 'En attente d’un badge';
      $('#r-sub').textContent = 'Passez un badge devant le lecteur.';
    }, 8000);
  }
}

async function loadDashboard() {
  const s = await api('stats');
  $('#s-users').textContent = s.users;
  $('#s-present').textContent = s.present;
  $('#s-inside').textContent = s.inside;
  $('#s-absent').textContent = s.absent;
  renderReader(s.last);

  const today = s.server_time.slice(0, 10);
  const rows = await api('logs', null, `&from=${today}&to=${today}`);
  $('#t-today tbody').innerHTML = rows.length ? rows.map(l => `
    <tr><td>${esc(l.name)}</td><td>${fmtTime(l.time_in)}</td>
    <td>${l.time_out ? fmtTime(l.time_out) : '<span class="pill in">Présent(e)</span>'}</td>
    <td>${duration(l.time_in, l.time_out)}</td></tr>`).join('')
    : '<tr><td colspan="4" class="empty">Aucun passage aujourd’hui.</td></tr>';
}

/* ---------- Utilisateurs ---------- */
let usersCache = [];
async function loadUsers() {
  usersCache = await api('users');
  $('#t-users tbody').innerHTML = usersCache.length ? usersCache.map(u => `
    <tr><td>${esc(u.name)}</td><td>${esc(u.serial_no)}</td><td>${esc(u.email)}</td>
    <td>${u.card_uid ? `<code>${esc(u.card_uid)}</code>` : '<span class="muted">Aucun</span>'}</td>
    <td class="actions">
      <button class="btn small" data-edit="${u.id}">Modifier</button>
      <button class="btn small danger" data-del="${u.id}">Supprimer</button></td></tr>`).join('')
    : '<tr><td colspan="5" class="empty">Aucun utilisateur. Ajoutez-en un pour commencer.</td></tr>';
}
$('#t-users').addEventListener('click', async e => {
  const edit = e.target.closest('[data-edit]'), del = e.target.closest('[data-del]');
  if (edit) openUserDialog(usersCache.find(u => u.id == edit.dataset.edit));
  if (del && confirm('Supprimer cet utilisateur et tout son historique de présence ?')) {
    await api('user_delete', { id: del.dataset.del });
    toast('Utilisateur supprimé'); loadUsers();
  }
});

/* Fenêtre d'ajout / modification */
let scanTimer = null, scanDeviceId = null;
function openUserDialog(u = null) {
  $('#du-title').textContent = u ? 'Modifier l’utilisateur' : 'Ajouter un utilisateur';
  $('#f-userform').dataset.id = u ? u.id : '';
  $('#du-name').value = u?.name ?? '';
  $('#du-serial').value = u?.serial_no ?? '';
  $('#du-email').value = u?.email ?? '';
  $('#du-uid').value = u?.card_uid ?? '';
  $('#du-err').textContent = ''; $('#du-hint').textContent = '';
  $('#dlg-user').showModal();
}
$('#u-new').onclick = () => openUserDialog();

async function stopScan() {
  clearInterval(scanTimer); scanTimer = null;
  $('#du-scan').textContent = 'Lire un badge';
  if (scanDeviceId) {
    await api('device_mode', { id: scanDeviceId, mode: 'attendance' }).catch(() => {});
    scanDeviceId = null;
  }
}
$('#du-scan').onclick = async () => {
  if (scanTimer) return stopScan();
  const devices = await api('devices');
  if (!devices.length) { $('#du-hint').textContent = 'Aucun appareil enregistré.'; return; }
  scanDeviceId = devices[0].id;
  await api('device_mode', { id: scanDeviceId, mode: 'enroll' });
  await api('scan_clear', {});
  $('#du-hint').textContent = `Passez le badge devant « ${devices[0].name} »…`;
  $('#du-scan').textContent = 'Annuler la lecture';
  scanTimer = setInterval(async () => {
    const s = await api('last_scan');
    if (s.card_uid) {
      $('#du-uid').value = s.card_uid;
      $('#du-hint').textContent = 'Badge lu.';
      stopScan();
    }
  }, 1200);
};
$('#du-cancel').onclick = async () => { await stopScan(); $('#dlg-user').close(); };
$('#dlg-user').addEventListener('close', stopScan);

$('#f-userform').addEventListener('submit', async e => {
  e.preventDefault();
  $('#du-err').textContent = '';
  try {
    await stopScan();
    await api('user_save', {
      id: $('#f-userform').dataset.id || null,
      name: $('#du-name').value, serial_no: $('#du-serial').value,
      email: $('#du-email').value, card_uid: $('#du-uid').value,
    });
    $('#dlg-user').close();
    toast('Utilisateur enregistré');
    loadUsers();
  } catch (err) { $('#du-err').textContent = err.message; }
});

/* ---------- Présences ---------- */
function initLogs() {
  const today = new Date().toISOString().slice(0, 10);
  if (!$('#f-from').value) { $('#f-from').value = today; $('#f-to').value = today; }
  api('users').then(us => {
    const cur = $('#f-user').value;
    $('#f-user').innerHTML = '<option value="0">Toutes</option>' +
      us.map(u => `<option value="${u.id}">${esc(u.name)}</option>`).join('');
    $('#f-user').value = cur || '0';
  });
  loadLogs();
}
let logsCache = [];
async function loadLogs() {
  const q = `&from=${$('#f-from').value}&to=${$('#f-to').value}&user_id=${$('#f-user').value}`;
  logsCache = await api('logs', null, q);
  $('#t-logs tbody').innerHTML = logsCache.length ? logsCache.map(l => `
    <tr><td>${l.log_date}</td><td>${esc(l.name)}</td><td>${esc(l.serial_no)}</td>
    <td>${fmtTime(l.time_in)}</td><td>${fmtTime(l.time_out)}</td><td>${esc(l.device)}</td>
    <td class="actions"><button class="btn small danger" data-del="${l.id}">Supprimer</button></td></tr>`).join('')
    : '<tr><td colspan="7" class="empty">Aucune présence sur cette période.</td></tr>';
}
$('#f-apply').onclick = loadLogs;
$('#t-logs').addEventListener('click', async e => {
  const del = e.target.closest('[data-del]');
  if (del && confirm('Supprimer cette ligne ?')) { await api('log_delete', { id: del.dataset.del }); loadLogs(); }
});
$('#l-export').onclick = () => {
  const head = ['Date', 'Nom', 'Matricule', 'Entrée', 'Sortie', 'Appareil'];
  const cell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [head, ...logsCache.map(l => [l.log_date, l.name, l.serial_no, l.time_in, l.time_out, l.device])]
    .map(r => r.map(cell).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `presences_${$('#f-from').value}_${$('#f-to').value}.csv`;
  a.click();
};

/* ---------- Appareils ---------- */
async function loadDevices() {
  const ds = await api('devices');
  $('#t-devices tbody').innerHTML = ds.length ? ds.map(d => `
    <tr><td>${esc(d.name)}</td><td><code>${esc(d.device_token)}</code></td>
    <td>${d.last_seen ?? '<span class="muted">Jamais</span>'}</td>
    <td><select data-mode="${d.id}">
      <option value="attendance" ${d.mode === 'attendance' ? 'selected' : ''}>Présence</option>
      <option value="enroll" ${d.mode === 'enroll' ? 'selected' : ''}>Enregistrement</option></select></td>
    <td class="actions"><button class="btn small danger" data-del="${d.id}">Supprimer</button></td></tr>`).join('')
    : '<tr><td colspan="5" class="empty">Aucun appareil.</td></tr>';
}
$('#t-devices').addEventListener('change', async e => {
  const sel = e.target.closest('[data-mode]');
  if (sel) { await api('device_mode', { id: sel.dataset.mode, mode: sel.value }); toast('Mode mis à jour'); }
});
$('#t-devices').addEventListener('click', async e => {
  const del = e.target.closest('[data-del]');
  if (del && confirm('Supprimer cet appareil ?')) { await api('device_delete', { id: del.dataset.del }); loadDevices(); }
});
$('#d-new').onclick = async () => {
  const name = prompt('Nom de l’appareil (ex. Salle B12) :');
  if (!name) return;
  const r = await api('device_add', { name });
  alert(`Appareil créé.\n\nÀ mettre dans le sketch Arduino :\nconst char* device_token = "${r.token}";`);
  loadDevices();
};

/* ---------- Rafraîchissement automatique ---------- */
let poll = null, polling = false;
function startPolling() {
  stopPolling();
  poll = setInterval(async () => {
    if (polling || document.hidden) return;   // évite les requêtes qui se chevauchent
    polling = true;
    try {
      if (currentTab === 'dashboard') await loadDashboard();
      else if (currentTab === 'logs') await loadLogs();
      else if (currentTab === 'users' && !$('#dlg-user').open) await loadUsers();
      else if (currentTab === 'devices' && document.activeElement?.tagName !== 'SELECT') await loadDevices();
    } catch (e) { /* on réessaie au prochain tour */ }
    polling = false;
  }, 1000);
}
function stopPolling() { clearInterval(poll); poll = null; }

/* ---------- Démarrage ---------- */
api('session').then(s => s.ok ? showApp() : showLogin()).catch(showLogin);
