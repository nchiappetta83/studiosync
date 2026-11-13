/* StudioSync V2 — Phase 1 round 2 mockup. Clickable prototype, fictional data only.
   No persistence beyond harmless view preferences; nothing here touches V1.3. */
(() => {
  const D = DATA;
  const $app = document.getElementById('app');

  // ---------------------------------------------------------------- icons
  const P = {
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    mywork: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="m8 12 3 3 5-6"/>',
    calendar: '<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M3 10h18M8 2v4M16 2v4"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-6 6.5-6s6.5 2.5 6.5 6"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5c2 .7 3.5 2.6 3.5 5.5"/>',
    portfolio: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/>',
    folder: '<path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z"/>',
    office: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18"/>',
    flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    hourglass: '<path d="M6 3h12M6 21h12M7 3c0 5 5 6 5 9s-5 4-5 9M17 3c0 5-5 6-5 9s5 4 5 9"/>',
    alert: '<path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 10v4M12 17.5v.01"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    stack: '<rect x="3" y="8" width="14" height="12" rx="2"/><path d="M7 4h12a2 2 0 0 1 2 2v10"/>',
    circle: '<circle cx="12" cy="12" r="8"/>',
    'circle-half': '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16Z" fill="currentColor"/>',
    'circle-check': '<circle cx="12" cy="12" r="8"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
    square: '<rect x="4" y="4" width="16" height="16" rx="3"/>',
    'square-half': '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 4h5a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3h-5Z" fill="currentColor"/>',
    'square-pause': '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M10 9v6M14 9v6"/>',
    'square-check': '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
    grip: '<circle cx="9" cy="6" r="1.2"/><circle cx="15" cy="6" r="1.2"/><circle cx="9" cy="12" r="1.2"/><circle cx="15" cy="12" r="1.2"/><circle cx="9" cy="18" r="1.2"/><circle cx="15" cy="18" r="1.2"/>',
    sync: '<path d="M20 12a8 8 0 0 0-14-5.3L4 9M4 4v5h5M4 12a8 8 0 0 0 14 5.3L20 15M20 20v-5h-5"/>',
    cloudoff: '<path d="M3 3l18 18M9.5 5.5A8 8 0 0 1 20 11a4 4 0 0 1 1 7.8M6 18a4.5 4.5 0 0 1-1-8.8"/>',
    check: '<path d="m5 12 4 4 10-10"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    chevron: '<path d="m9 6 6 6-6 6"/>',
    message: '<path d="M4 5h16v11H9l-5 4V5Z"/>',
    list: '<path d="M10 6h10M10 12h10M10 18h10M3.5 6l1.5 1.5L7.5 5M3.5 12l1.5 1.5 2.5-2.5M3.5 18l1.5 1.5 2.5-2.5"/>',
    play: '<path d="M7 5v14l12-7Z"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    arrowdown: '<path d="M12 5v14M6 13l6 6 6-6"/>',
    target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/>',
    shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z"/>',
    send: '<path d="M22 2 11 13M22 2l-7 20-4-9-9-4Z"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
    print: '<path d="M6 9V3h12v6M6 18H4v-7h16v7h-2"/><rect x="6" y="14" width="12" height="7"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1"/>',
    panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>',
    sidebar: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
    keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.5-7 8-7s8 3 8 7"/>',
  };
  const ic = (n, c = '') => `<svg class="ic ${c}" viewBox="0 0 24 24" aria-hidden="true">${P[n] || ''}</svg>`;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------------------------------------------------------------- state
  const PERSONAS = {
    morgan: { id: 'morgan', role: 'Partner · Scheduling admin', schedule: true, cards: true, priv: true, nav: ['portfolio', 'mywork', 'schedule', 'projects', 'office'] },
    riley: { id: 'riley', role: 'Senior staff · Scheduling admin', schedule: true, cards: true, priv: false, nav: ['team', 'mywork', 'schedule', 'projects', 'office'] },
    avery: { id: 'avery', role: 'Staff', schedule: false, cards: false, priv: false, nav: ['mywork', 'projects'] },
  };
  const NAVDEF = {
    portfolio: ['Portfolio', 'portfolio', 'ph-portfolio'], team: ['Team', 'users', 'ph-team'], mywork: ['My Work', 'mywork', 'mywork'],
    schedule: ['Schedule', 'calendar', 'board'], projects: ['Projects', 'folder', 'ph-projects'], office: ['Office', 'office', 'ph-office'],
  };
  const SCHED_SCREENS = ['board', 'drag', 'search', 'rollover', 'shortcuts'];
  const lsGet = (k, d) => { try { return JSON.parse(localStorage.getItem('ss2-' + k)) ?? d; } catch { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem('ss2-' + k, JSON.stringify(v)); } catch { /* ignore */ } };

  const S = {
    screen: 'board', persona: 'morgan', density: lsGet('density', 'comfortable'), width: lsGet('width', 'fit'), theme: lsGet('theme', 'auto'),
    sync: 'synced', rollover: 'review', view: 'board', sel0: { type: 'task', id: 't1' }, mysel: { type: null, id: null }, itab: 'details',
    carryover: false, decisions: {}, projFilter: null, collapsed: {}, p1: lsGet('p1', 252), p3: lsGet('p3', 340),
    overlay: null, q: '', qSel: 0, popover: null, menu: null, toast: null, dragMode: 'pointer', insOpen: false, projOpen: false,
    navMin: lsGet('navMin', false), myProject: null, myFilter: 'open', myView: 'list', publishing: false,
  };
  // Schedule and My Work keep separate selections so moving between them never clobbers either one.
  Object.defineProperty(S, 'sel', { get() { return S.screen === 'mywork' ? S.mysel : S.sel0; }, set(v) { if (S.screen === 'mywork') S.mysel = v; else S.sel0 = v; } });
  const resetSel = () => { const own = D.tasks.find((t) => t.person === S.persona && t.status !== 'done'); S.sel0 = { type: 'task', id: 't1' }; S.mysel = own ? { type: 'task', id: own.id } : { type: null, id: null }; };
  const persona = () => PERSONAS[S.persona];
  const person = (id) => D.people.find((p) => p.id === id);
  const project = (id) => D.projects.find((p) => p.id === id);
  const task = (id) => D.tasks.find((t) => t.id === id);
  const card = (id) => D.cards.find((c) => c.id === id);
  const lanes = () => D.people.filter((p) => p.lane);

  // ---------------------------------------------------------------- formatting & domain
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dt = (iso) => new Date(iso + 'T12:00:00');
  const fmtDate = (iso) => (iso ? `${WD[dt(iso).getDay()]}, ${MO[dt(iso).getMonth()]} ${dt(iso).getDate()}` : 'No date');
  const dayShort = (iso) => `${WD[dt(iso).getDay()]} ${dt(iso).getDate()}`;
  const fmtH = (h) => { const r = Math.round(h * 10) / 10; return (Number.isInteger(r) ? r : r.toFixed(1)) + 'h'; };
  const isLate = (t) => t.status !== 'done' && t.due < D.TODAY;
  const openTasks = (pid) => D.tasks.filter((t) => t.person === pid && t.status !== 'done');

  function loadState(h, cap) {
    if (!h) return { key: 'none', label: 'No work', ratio: 0 };
    const r = h / cap;
    if (r < 0.5) return { key: 'available', label: 'Available', ratio: r };
    if (r <= 1) return { key: 'target', label: 'On target', ratio: r };
    return { key: 'over', label: 'Over capacity', ratio: r };
  }
  const weekHours = (pid) => D.cards.filter((c) => c.status !== 'done' && c.assignees.includes(pid)).reduce((a, c) => a + c.min, 0) / 60;
  function staffLoad(pid) {
    const projects = new Set(openTasks(pid).map((t) => t.project)).size;
    const h = weekHours(pid);
    if (!projects) return { key: 'none', label: 'No projects', ratio: 0, h, projects };
    if (!h) return { key: 'none', label: 'Unscheduled', ratio: 0, h, projects };
    return { ...loadState(h, D.CAPACITY.week), h, projects };
  }
  const workingDates = (s, e) => { const out = []; for (let d = dt(s); d <= dt(e); d.setDate(d.getDate() + 1)) { if (d.getDay() > 0 && d.getDay() < 6) out.push(d.toISOString().slice(0, 10)); } return out; };
  function dayHours(pid, date) {
    let h = 0;
    D.cards.filter((c) => c.status !== 'done' && c.assignees.includes(pid) && (c.start || c.end)).forEach((c) => {
      const all = workingDates(c.start || c.end, c.end || c.start);
      if (all.includes(date)) h += c.min / 60 / all.length;
    });
    return h;
  }
  const loadIcon = { none: 'minus', available: 'arrowdown', target: 'target', over: 'alert' };
  function loadHTML(l, hours, capH, opts = {}) {
    const on = hours ? Math.max(1, Math.min(8, Math.round(Math.min(1, l.ratio) * 8))) : 0;
    const segs = Array.from({ length: 8 }, (_, i) => `<i class="${i < on ? 'on' : ''}"></i>`).join('') + (l.key === 'over' ? '<i class="ov"></i>' : '');
    return `<span class="load ${l.key}" role="img" aria-label="${esc(`${fmtH(hours)} of ${fmtH(capH)} planned Work Card hours: ${l.label}`)}"><span class="segs" aria-hidden="true">${segs}</span><b>${fmtH(hours)} of ${fmtH(capH)}</b><span class="lbl">${ic(loadIcon[l.key], 'sm')}${esc(l.label)}</span></span>`;
  }
  const prioChip = (p) => (p === -1 ? `<span class="chip wait">${ic('hourglass', 'sm')}Waiting</span>` : `<span class="chip p${p}">${ic('flag', 'sm')}P${p}</span>`);
  const TS = { not_started: ['circle', 'Not started'], in_progress: ['circle-half', 'In progress'], done: ['circle-check', 'Done'] };
  const CS = { todo: ['square', 'To do'], in_progress: ['square-half', 'In progress'], paused: ['square-pause', 'Paused'], done: ['square-check', 'Done'] };
  const taskMk = (s) => `<span class="mk ${s}">${ic(TS[s][0])}${TS[s][1]}</span>`;
  const cardMk = (s) => `<span class="mk ${s}">${ic(CS[s][0])}${CS[s][1]}</span>`;
  const av = (id, sm) => { const p = person(id); return `<span class="av ${sm ? 'sm' : ''}" style="background:${p.color}" title="${esc(p.name)}" aria-label="${esc(p.name)}">${p.init}</span>`; };
  const notReviewed = (t) => t.carry && !S.decisions[t.id];
  const carryTasks = () => D.tasks.filter((t) => t.carry);
  const canEdit = (t) => persona().schedule || t.person === S.persona;

  // ---------------------------------------------------------------- sync states
  const SYNC = {
    synced: { icon: 'check', cls: '', text: 'All changes synced', title: 'Synced', body: 'Last sync 9:42 AM from the shared drive. Nothing is waiting to send.', action: 'Sync now' },
    syncing: { icon: 'sync', cls: '', spin: true, text: 'Syncing…', title: 'Syncing', body: 'Reading 4 new events from the shared drive. You can keep working.', action: null },
    offline: { icon: 'cloudoff', cls: 'state-warn', text: 'Offline · 3 waiting', title: 'Offline — changes are safe', body: 'The shared drive can’t be reached. Your 3 changes are saved on this computer and will send automatically when it returns.', action: 'Retry now', list: ['Task updated · Unit plan coordination', 'Comment added · Drawing QA', 'Work Card focus set · Update layout overlay'] },
    failed: { icon: 'alert', cls: 'state-bad', text: '1 change needs attention', title: 'A shared event couldn’t be read', body: 'One file in the shared drive isn’t valid JSON, so it was skipped. Everything else is up to date. Nothing you entered is lost.', action: 'Copy diagnostics', list: ['2026-11-10_invalid-json.json'] },
    stale: { icon: 'info', cls: 'state-warn', text: 'Showing data from 8:15 AM', title: 'Data may be out of date', body: 'This view was loaded from the local cache. Refresh to check the shared drive for newer changes.', action: 'Refresh' },
    trust: { icon: 'shield', cls: 'state-warn', text: 'Computer not yet trusted', title: 'This computer needs approval', body: 'Behavior to confirm against V1.3 device trust: edits stay on this computer until an administrator approves it.', action: 'View status' },
  };

  // ---------------------------------------------------------------- rows
  function taskRow(t, o = {}) {
    const p = project(t.project); const lead = person(t.lead); const selected = S.sel.type === 'task' && S.sel.id === t.id;
    const late = isLate(t); const nr = notReviewed(t); const dec = S.decisions[t.id];
    const cardCount = D.cards.filter((c) => c.project === t.project && c.week === D.WEEK_OF).length;
    const drag = persona().schedule && !o.noDrag;
    return `<div class="row" role="option" tabindex="0" aria-selected="${selected}" data-act="select" data-type="task" data-id="${t.id}" data-fk="task-${t.id}" ${drag ? 'draggable="true"' : ''} aria-label="${esc(`${t.title}, ${p.name}, ${TS[t.status][1]}, ${t.prio === -1 ? 'Waiting' : 'P' + t.prio}`)}">
      ${drag ? `<span class="grip">${ic('grip', 'sm')}</span>` : ''}
      <div class="lead-col"><span class="mk ${t.status}" title="${TS[t.status][1]}">${ic(TS[t.status][0])}<span class="sr">${TS[t.status][1]}</span></span>${prioChip(t.prio)}</div>
      <div class="main"><div class="ttl" style="${dec === 'delete' ? 'text-decoration:line-through' : ''}">${esc(t.title)}</div><div class="sub">${esc(o.hideProject ? '' : p.name)}</div><div class="sub lead">Lead ${esc(lead.name)}</div></div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">${nr ? `<span class="chip nr" title="Carried over and not yet reviewed">${ic('eye', 'sm')}Not Reviewed</span>` : ''}</div>
      <div class="due ${late ? 'late' : ''}">${late ? ic('alert', 'sm') + ' Overdue<br>' : ''}${esc(fmtDate(t.due))}</div>
      <div class="counts" title="Action Items · comments · Work Cards on this project this week"><span>${ic('list', 'sm')} ${t.actions.length}<span class="sr"> Action Items</span></span><span>${ic('message', 'sm')} ${t.comments.length}<span class="sr"> comments</span></span><span>${ic('stack', 'sm')} ${cardCount}<span class="sr"> Work Cards</span></span></div>
      ${o.decide ? `<div class="decide"><span class="hint">Carryover decision:</span><span class="seg-ctl" role="group" aria-label="Decision for ${esc(t.title)}"><button data-act="decide" data-id="${t.id}" data-v="keep" aria-pressed="${dec === 'keep'}">${ic('check', 'sm')}Keep</button><button data-act="decide" data-id="${t.id}" data-v="delete" aria-pressed="${dec === 'delete'}">${ic('trash', 'sm')}Delete</button></span>${dec === 'delete' ? '<span class="hint">Will be removed when published</span>' : !dec ? '<span class="hint">Undecided stays Not Reviewed</span>' : ''}</div>` : ''}
    </div>`;
  }
  function cardRow(c, o = {}) {
    const p = project(c.project); const selected = S.sel.type === 'card' && S.sel.id === c.id; const mine = D.focus[S.persona] === c.id;
    return `<div class="row card-row" role="option" tabindex="0" aria-selected="${selected}" data-act="select" data-type="card" data-id="${c.id}" data-fk="card-${c.id}" aria-label="${esc(`Work Card: ${c.title}, ${CS[c.status][1]}`)}">
      <div><span class="noun">${ic('stack', 'sm')}Work Card</span><br>${cardMk(c.status)}</div>
      <div class="main"><div class="ttl">${esc(c.title)}</div><div class="sub">${o.hideProject ? '' : esc(p.name) + ' · '}${c.start ? esc(dayShort(c.start)) + (c.end !== c.start ? '–' + esc(dayShort(c.end)) : '') : 'No dates'}</div></div>
      <div style="display:flex;gap:6px;align-items:center;justify-content:flex-end">${mine ? `<span class="chip badge-focus">${ic('play', 'sm')}Working on now</span>` : ''}<span class="avs">${c.assignees.map((a) => av(a, true)).join('')}</span></div>
      <div class="due">${fmtH(c.min / 60)} planned${c.logged ? `<br><span class="mut">${fmtH(c.logged)} logged</span>` : ''}</div>
    </div>`;
  }

  // ---------------------------------------------------------------- inspector
  function inspector() {
    const sel = S.sel; const t = sel.type === 'task' ? task(sel.id) : null; const c = sel.type === 'card' ? card(sel.id) : null;
    if (!t && !c) return `<div class="insp"><div class="empty">${ic('panel', 'lg')}<p>Select an assignment or Work Card to see its details here.</p><p class="hint">Use ↑ ↓ to move through the list.</p></div></div>`;
    const proj = project((t || c).project);
    const closeBtn = `<button class="btn sm insp-close" data-act="close-insp" aria-label="Close inspector (Esc)">${ic('x', 'sm')}Close</button>`;
    let head; let tabs; let body;
    if (t) {
      const cards = D.cards.filter((x) => x.project === t.project && x.week === D.WEEK_OF);
      const tabDef = [['details', 'Details'], ['cards', `Work Cards <span class="n">${cards.length}</span>`], ['talk', `Discussion <span class="n">${t.comments.length}</span>`], ['activity', 'Activity']];
      head = `<div class="insp-h">${closeBtn}<span class="noun">${ic('circle', 'sm')}Scheduled assignment</span><h2>${esc(t.title)}</h2><div class="chips">${prioChip(t.prio)}${taskMk(t.status)}${notReviewed(t) ? `<span class="chip nr">${ic('eye', 'sm')}Not Reviewed</span>` : ''}</div></div>
        <div class="facts"><div class="fact"><span>Assigned to</span><b>${esc(person(t.person).name)}</b></div><div class="fact"><span>Project</span><b>${esc(proj.name)}</b></div><div class="fact"><span>Due</span><b>${esc(fmtDate(t.due))}</b></div><div class="fact"><span>Lead</span><b>${esc(person(t.lead).name)}</b></div></div>`;
      tabs = tabDef;
      const ed = canEdit(t);
      if (S.itab === 'details') {
        body = `<h3>Notes</h3><p style="margin:0">${esc(t.notes || 'No notes.')}</p>
          <h3>Action Items <span class="mut" style="text-transform:none;letter-spacing:0">· steps inside this assignment</span></h3>
          ${t.actions.length ? t.actions.map((a, i) => `<div class="ai ${a.done ? 'done' : ''}"><button class="btn sm" data-act="toggle-action" data-id="${t.id}" data-i="${i}" role="checkbox" aria-checked="${a.done}" aria-label="${esc(a.t)}" ${ed ? '' : 'disabled'}>${ic(a.done ? 'check' : 'minus', 'sm')}</button><span>${esc(a.t)}</span><span class="noun" style="margin-left:auto">Action Item</span></div>`).join('') : '<p class="hint" style="margin:0">No Action Items.</p>'}
          <h3>Project</h3><div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn sm" data-act="toast" data-msg="Opens the project folder in Explorer">${ic('folder', 'sm')}Open folder</button><button class="btn sm" data-act="toast" data-msg="Project info: notes, activity, partner and leads">${ic('info', 'sm')}Project info</button></div>
          <h3>Actions</h3><div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn sm" data-act="mark-done" data-id="${t.id}" ${ed ? '' : 'disabled title="Only the assignee or an administrator can change this."'}>${ic('circle-check', 'sm')}${t.status === 'done' ? 'Reopen' : 'Mark done'}</button>
            ${persona().schedule ? `<button class="btn sm" data-act="reassign" data-id="${t.id}">${ic('users', 'sm')}Reassign…</button><button class="btn sm" data-act="toast" data-msg="Edit assignment dialog (not part of this mockup)">Edit…</button>` : ''}</div>
          ${ed ? '' : '<p class="hint">Read-only: only the assignee or an administrator can change this assignment.</p>'}`;
      } else if (S.itab === 'cards') {
        body = `<div class="note-box">${ic('stack', 'sm')} Work Cards are <b>shared project work</b> for ${esc(proj.name)}, week of Nov 9. They are separate from ${esc(person(t.person).name.split(' ')[0])}’s scheduled assignment above and add no hours to it.</div>
          ${persona().cards ? `<button class="btn sm" data-act="toast" data-msg="New Work Card dialog (Partners and Senior staff)">${ic('plus', 'sm')}Add Work Card</button>` : ''}
          <div style="margin-top:8px">${cards.length ? cards.map(cardBox).join('') : '<p class="hint">No Work Cards for this project this week.</p>'}</div>`;
      } else if (S.itab === 'talk') {
        body = `<h3>Comments</h3>${t.comments.length ? t.comments.map((m) => `<div class="cm"><b>${esc(person(m.who).name)} · ${esc(m.at)}</b>${esc(m.text)}</div>`).join('') : '<p class="hint" style="margin:0">No comments yet.</p>'}
          <div class="cm-in"><input aria-label="Add a comment" placeholder="Add a comment…" data-fk="comment" data-comment="${t.id}"><button class="btn sm primary" data-act="comment" data-id="${t.id}">Send</button></div><p class="hint">Enter sends · Shift+Enter adds a line</p>`;
      } else {
        body = `<h3>Task activity</h3>${(D.activity[t.id] || [{ at: 'Mon 8:00 AM', text: 'Created' }]).map((a) => `<div class="cm"><b>${esc(a.at)}</b>${esc(a.text)}</div>`).join('')}`;
      }
    } else {
      const tabDef = [['details', 'Details'], ['project', 'Project context']];
      tabs = tabDef;
      const mine = c.assignees.includes(S.persona); const focusNow = D.focus[S.persona] === c.id;
      head = `<div class="insp-h">${closeBtn}<span class="noun">${ic('stack', 'sm')}Work Card · shared project work</span><h2>${esc(c.title)}</h2><div class="chips">${cardMk(c.status)}${focusNow ? `<span class="chip badge-focus">${ic('play', 'sm')}Working on now</span>` : ''}</div></div>
        <div class="facts"><div class="fact"><span>Project</span><b>${esc(proj.name)}</b></div><div class="fact"><span>Week of</span><b>Nov 9</b></div><div class="fact"><span>Dates</span><b>${c.start ? esc(dayShort(c.start)) + (c.end !== c.start ? ' – ' + esc(dayShort(c.end)) : '') : 'Not dated'}</b></div><div class="fact"><span>Planned · logged</span><b>${fmtH(c.min / 60)} · ${fmtH(c.logged)}</b></div></div>`;
      if (S.itab === 'project') {
        const ts = D.tasks.filter((x) => x.project === c.project && x.status !== 'done');
        body = `<h3>Scheduled assignments on ${esc(proj.name)}</h3>${ts.length ? ts.map((x) => `<div class="ai"><span>${esc(person(x.person).name.split(' ')[0])}: ${esc(x.title)}</span><span style="margin-left:auto">${prioChip(x.prio)}</span></div>`).join('') : '<p class="hint">None open.</p>'}
          <div class="note-box">Assignments are office planning work. This Work Card is a separate shared record.</div>`;
      } else {
        body = `<h3>Description</h3><p style="margin:0">${esc(c.desc || 'No description.')}</p><h3>Assigned</h3><div style="display:flex;gap:8px;flex-wrap:wrap">${c.assignees.map((a) => `<span style="display:inline-flex;gap:6px;align-items:center">${av(a)}${esc(person(a).name)}</span>`).join('')}</div>
          <h3>Lead</h3><p style="margin:0">${esc(person(c.lead).name)}</p>
          <h3>Your focus</h3>${mine ? cardActions(c) : '<p class="hint" style="margin:0">You’re not assigned to this card. Your “Working on now” choice is personal and never changes anyone else’s.</p>'}
          ${persona().cards ? `<h3>Manage</h3><div style="display:flex;gap:6px"><button class="btn sm" data-act="toast" data-msg="Edit Work Card dialog (not part of this mockup)">Edit…</button>${c.status !== 'done' ? `<button class="btn sm" data-act="card-act" data-id="${c.id}" data-v="complete">${ic('square-check', 'sm')}Complete</button>` : ''}</div>` : '<p class="hint">Only Partners and Senior staff create, edit, assign or complete Work Cards.</p>'}`;
      }
    }
    const tabHtml = tabs.map(([id, label]) => `<button role="tab" id="itab-${id}" aria-selected="${S.itab === id}" tabindex="${S.itab === id ? 0 : -1}" data-act="itab" data-tab="${id}" data-fk="itab-${id}">${label}</button>`).join('');
    return `<div class="insp">${head}<div class="itabs" role="tablist" aria-label="Details sections">${tabHtml}</div><div class="ibody" role="tabpanel" data-scroll="insp" tabindex="0">${body}</div></div>`;
  }
  function cardActions(c) {
    const f = D.focus[S.persona] === c.id;
    if (c.status === 'done') return '<p class="hint" style="margin:0">Completed.</p>';
    const b = [];
    if (c.status === 'todo') b.push(`<button class="btn sm primary" data-act="card-act" data-id="${c.id}" data-v="start">${ic('play', 'sm')}Start · Work on this</button>`);
    if (c.status === 'in_progress') { if (!f) b.push(`<button class="btn sm" data-act="card-act" data-id="${c.id}" data-v="focus">${ic('play', 'sm')}Work on this</button>`); b.push(`<button class="btn sm" data-act="card-act" data-id="${c.id}" data-v="pause">${ic('pause', 'sm')}Pause</button>`); }
    if (c.status === 'paused') b.push(`<button class="btn sm primary" data-act="card-act" data-id="${c.id}" data-v="resume">${ic('play', 'sm')}Resume</button>`);
    return `<div style="display:flex;gap:6px;flex-wrap:wrap">${b.join('')}</div><p class="hint">“Working on now” is personal: it never means anyone else is working on this card.</p>`;
  }
  function cardBox(c) {
    const mine = c.assignees.includes(S.persona); const f = D.focus[S.persona] === c.id;
    return `<div class="cardbox"><div class="top"><span class="noun">${ic('stack', 'sm')}Work Card</span>${cardMk(c.status)}${f ? `<span class="chip badge-focus">${ic('play', 'sm')}Working on now</span>` : ''}</div>
      <div class="ttl">${esc(c.title)}</div>
      <div class="meta"><span class="avs">${c.assignees.map((a) => av(a, true)).join('')}</span><span>${fmtH(c.min / 60)} planned</span>${c.logged ? `<span>${fmtH(c.logged)} logged</span>` : ''}<span>${c.start ? esc(dayShort(c.start)) + (c.end !== c.start ? '–' + esc(dayShort(c.end)) : '') : 'No dates'}</span></div>
      ${mine && c.status !== 'done' ? `<div style="margin-top:6px">${cardActions(c).replace(/<p class="hint">.*?<\/p>/, '')}</div>` : ''}</div>`;
  }

  // ---------------------------------------------------------------- schedule
  function projectsPane() {
    const mk = (cat) => D.projects.filter((p) => p.category === cat).map((p) => {
      const open = D.tasks.filter((t) => t.project === p.id && t.status !== 'done').length;
      const cards = D.cards.filter((c) => c.project === p.id && c.status !== 'done').length;
      return `<button class="proj" draggable="${persona().schedule}" data-act="proj" data-id="${p.id}" data-fk="proj-${p.id}" aria-pressed="${S.projFilter === p.id}" title="${persona().schedule ? 'Drag onto a person to assign, or press Enter for “Assign to…”' : ''}"><b>${esc(p.name)}</b><small>${esc(p.client)} · ${open} open · ${cards} ${cards === 1 ? 'card' : 'cards'}</small>${persona().schedule ? `<span class="btn sm assign" data-act="assign-open" data-id="${p.id}" role="button" tabindex="0" aria-label="Assign ${esc(p.name)} to…" title="Assign to… (keyboard alternative to dragging)" data-fk="assign-${p.id}">${ic('users', 'sm')}</span>` : ''}</button>`;
    }).join('');
    return `<div class="pane-title"><span>Projects</span><span class="only-narrow ${S.view === 'week' && S.screen !== 'mywork' ? 'always' : ''}"><button class="btn sm" data-act="close-proj">${ic('x', 'sm')}Close</button></span></div><div class="proj-sec">Current · ${D.projects.filter((p) => p.category === 'current').length}</div>${mk('current')}<div class="proj-sec">Future · ${D.projects.filter((p) => p.category === 'future').length}</div>${mk('future')}`;
  }
  function laneHTML(p) {
    let ts = D.tasks.filter((t) => t.person === p.id);
    if (S.projFilter) ts = ts.filter((t) => t.project === S.projFilter);
    if (S.carryover) ts = ts.filter((t) => t.carry);
    else ts = ts.filter((t) => t.status !== 'done' || t.id === S.sel.id);
    if ((S.carryover || S.projFilter) && !ts.length) return '';
    const l = staffLoad(p.id); const open = openTasks(p.id);
    const p1 = open.filter((t) => t.prio === 1).length; const wt = open.filter((t) => t.prio === -1).length; const od = open.filter(isLate).length;
    const pto = D.pto[p.id];
    const col = S.collapsed[p.id];
    return `<section class="lane" data-person="${p.id}" aria-label="${esc(p.name)}">
      <div class="lane-h"><button class="btn sm" data-act="lane" data-id="${p.id}" aria-expanded="${!col}" aria-label="${col ? 'Expand' : 'Collapse'} ${esc(p.name)}" data-fk="lane-${p.id}"><span style="display:inline-block;transform:rotate(${col ? 0 : 90}deg)">${ic('chevron', 'sm')}</span></button>
        <div style="display:flex;align-items:center;gap:8px">${av(p.id)}<div><div class="nm">${esc(p.name)}</div><div class="hint">${esc(p.role)}</div></div>${pto ? `<span class="chip pto">${ic('calendar', 'sm')}PTO ${esc(WD[dt(pto[0]).getDay()])}–${esc(WD[dt(pto[pto.length - 1]).getDay()])}</span>` : ''}</div>
        ${loadHTML(l, l.h, D.CAPACITY.week)}
        <div class="meta"><span>${open.length} open ${open.length === 1 ? 'assignment' : 'assignments'}</span>${p1 ? `<span>${ic('flag', 'sm')} ${p1} P1</span>` : ''}${wt ? `<span>${ic('hourglass', 'sm')} ${wt} Waiting</span>` : ''}${od ? `<span style="color:var(--bad);font-weight:600">${ic('alert', 'sm')} ${od} overdue</span>` : ''}</div></div>
      <div class="drop-hint">${ic('plus', 'sm')} Drop to assign to ${esc(p.name)} · adds an assignment, not Work Card hours</div>
      ${col ? '' : `<div role="listbox" aria-label="${esc(p.name)} assignments">${ts.length ? ts.map((t) => taskRow(t, { decide: S.carryover })).join('') : '<div class="empty" style="padding:12px">No open assignments.</div>'}</div>`}</section>`;
  }
  function boardHTML() {
    const html = lanes().map(laneHTML).join('');
    return html || '<div class="empty">Nothing matches the current filters.</div>';
  }
  function weekHTML() {
    const head = `<div class="wk-head"><div>Person · weekly load</div>${D.DAYS.map((d) => `<div class="${d === D.TODAY ? 'today' : ''}">${dayShort(d)}${d === D.TODAY ? ' · Today' : ''}</div>`).join('')}<div>Weekend</div></div>`;
    const rows = lanes().map((p) => {
      const l = staffLoad(p.id); const pto = D.pto[p.id] || [];
      const days = D.DAYS.map((d) => {
        const h = dayHours(p.id, d); const dl = loadState(h, D.CAPACITY.day);
        const isPto = pto.includes(d);
        return `<div class="wk-day ${d === D.TODAY ? 'today' : ''} ${isPto ? 'pto' : ''}" style="grid-column:${D.DAYS.indexOf(d) + 1}">${isPto ? 'PTO' : h ? `<span class="${dl.key === 'over' ? 'over' : ''}">${dl.key === 'over' ? ic('alert', 'sm') : ''}${fmtH(h)}<span class="sr"> ${dl.label}</span></span>` : '<span aria-label="No planned hours">—</span>'}</div>`;
      }).join('') + '<div class="wk-day" style="grid-column:6"></div>';
      const spans = D.cards.filter((c) => c.assignees.includes(p.id) && (c.start || c.end)).map((c) => {
        const s = D.DAYS.indexOf(c.start || c.end); const e = D.DAYS.indexOf(c.end || c.start);
        const sel = S.sel.type === 'card' && S.sel.id === c.id; const wide = e - s >= 1;
        return `<button class="span ${c.status}" style="grid-column:${s + 1} / ${e + 2}" data-act="select" data-type="card" data-id="${c.id}" data-fk="card-${c.id}" aria-pressed="${sel}" aria-label="${esc(`Work Card ${c.title}, ${CS[c.status][1]}, ${fmtH(c.min / 60)} planned`)}">${ic(CS[c.status][0], 'sm')}<span class="t">${esc(c.title)}</span>${wide ? `<span class="mut">· ${CS[c.status][1]}</span>` : ''}</button>`;
      }).join('');
      const flags = D.tasks.filter((t) => t.person === p.id && t.status !== 'done' && (!S.projFilter || t.project === S.projFilter)).map((t) => {
        const di = D.DAYS.indexOf(t.due); const col = di >= 0 ? di + 1 : (t.due > D.DAYS[4] ? 6 : 1); const sel = S.sel.type === 'task' && S.sel.id === t.id;
        return `<button class="flag ${isLate(t) ? 'late' : ''}" style="grid-column:${col}" data-act="select" data-type="task" data-id="${t.id}" data-fk="task-${t.id}" aria-pressed="${sel}" aria-label="${esc(`Assignment due ${fmtDate(t.due)}: ${t.title}, ${t.prio === -1 ? 'Waiting' : 'P' + t.prio}`)}" title="${esc(t.title + ' · due ' + fmtDate(t.due))}">${ic(t.prio === -1 ? 'hourglass' : 'flag', 'sm')}${t.prio === -1 ? 'Wait' : 'P' + t.prio}<span style="overflow:hidden;text-overflow:ellipsis;font-weight:500">${esc(t.title)}</span></button>`;
      }).join('');
      return `<div class="wk-row"><div class="wk-who"><div class="nm">${av(p.id)}${esc(p.name)}</div>${loadHTML(l, l.h, D.CAPACITY.week)}</div><div class="wk-cells" role="group" aria-label="${esc(p.name)} week">${days}${spans}${flags}</div></div>`;
    }).join('');
    const undated = D.cards.filter((c) => !c.start && !c.end && c.status !== 'done');
    return `<div class="week">${head}${rows}<div class="tray"><h3>Needs dates · ${undated.length} Work Cards</h3>${undated.map((c) => `<button class="span ${c.status}" data-act="select" data-type="card" data-id="${c.id}" data-fk="card-${c.id}">${ic(CS[c.status][0], 'sm')}<span class="t">${esc(c.title)}</span><span class="mut">· ${esc(c.assignees.map((a) => person(a).name.split(' ')[0]).join(', '))} · ${fmtH(c.min / 60)}</span></button>`).join('')}</div>
      <div class="legend"><span>${ic('stack', 'sm')} Span = Work Card (start → end)</span><span>${ic('flag', 'sm')} Flag = scheduled assignment on its due day</span><span>${ic('hourglass', 'sm')} Wait = Waiting priority</span><span>${ic('alert', 'sm')} Over = day above ${fmtH(D.CAPACITY.day)} target</span><span>Day load = card hours spread across each card’s working days</span></div></div>`;
  }
  function scheduleScreen() {
    if (!persona().schedule) return `<div class="empty"><p>${ic('lock', 'lg')}</p><h2>Schedule isn’t available to Staff</h2><p>This workspace is hidden from navigation for this role, and every action is still checked by the main-process API.</p><button class="btn" data-act="persona" data-id="morgan">View as Morgan Ellis (Partner)</button></div>`;
    const cc = carryTasks().length; const nr = carryTasks().filter(notReviewed).length;
    const rolloverActive = S.rollover === 'review';
    const actions = `<div class="actions">
      <button class="btn" data-act="toast" data-msg="Bulk Actions: update selected tasks">Bulk Actions</button>
      ${cc ? `<button class="btn" data-act="carryover" aria-pressed="${S.carryover}" title="Review carried-over tasks">${ic('sync', 'sm')}Carryover <b>${cc}</b></button>` : ''}
      ${rolloverActive ? `<button class="btn primary" data-act="publish" title="${nr ? `${nr} tasks will remain Not Reviewed` : 'Publish scheduling changes to MyTasks'}">${ic('send', 'sm')}Publish Changes</button>` : ''}
      <button class="btn" data-act="toast" data-msg="Export / print (Ctrl+P)">${ic('print', 'sm')}Print <kbd>Ctrl P</kbd></button>
      <button class="btn" data-act="toast" data-msg="Excel refresh (Ctrl+E)">${ic('sync', 'sm')}Refresh Excel <kbd>Ctrl E</kbd></button>
      <button class="btn primary" data-act="toast" data-msg="Add task dialog (Ctrl+N) — not part of this mockup">${ic('plus', 'sm')}Add task <kbd>Ctrl N</kbd></button></div>`;
    const bar = `<div class="ws-bar"><span class="seg-ctl" role="group" aria-label="Schedule view"><button data-act="view" data-v="board" aria-pressed="${S.view === 'board'}">${ic('users', 'sm')}Board</button><button data-act="view" data-v="week" aria-pressed="${S.view === 'week'}">${ic('calendar', 'sm')}Week</button></span>
      <button class="btn only-narrow ${S.view === 'week' ? 'always' : ''}" data-act="open-proj">${ic('folder', 'sm')}Projects</button>
      ${S.projFilter ? `<button class="fchip" aria-pressed="true" data-act="proj-clear">${esc(project(S.projFilter).name)} ${ic('x', 'sm')}<span class="sr">Clear project filter</span></button>` : ''}
      ${S.carryover ? `<span class="chip nr">${ic('eye', 'sm')}Carryover review · ${nr} Not Reviewed</span>` : ''}
      <span class="hint" style="margin-left:6px">Office capacity ${fmtH(D.CAPACITY.day)}/day · ${fmtH(D.CAPACITY.week)}/week · load = planned Work Card hours</span>
      <span class="week-label">Week of Mon, Nov 9 – Fri, Nov 13, 2026 · Today Tue 10</span></div>`;
    const banner = syncBanner();
    const mainPane = S.view === 'week' ? weekHTML() : boardHTML();
    const dragMenu = '';
    return `<div class="ws-head"><div><h1>Schedule</h1><p>Plan the week: people, load and projects together.</p></div><div class="grow"></div>${actions}</div>${bar}${banner}
      ${threePane(projectsPane(), `<div class="pane" data-scroll="main" id="main-pane">${mainPane}</div>`, inspector(), S.view === 'week' ? 'week' : 'board')}${dragMenu}`;
    /* Week view: the project list becomes a slide-over so five days fit beside the inspector. */
  }
  function threePane(left, mid, right, cls = '') {
    return `<div class="three ${cls}" style="--p1:${S.p1}px;--p3:${S.p3}px">
      <div class="pane pane-proj" data-scroll="proj">${left}</div>
      <div class="split s1" role="separator" tabindex="0" aria-orientation="vertical" aria-label="Resize project list" data-split="p1"></div>
      ${mid}
      <div class="split s2" role="separator" tabindex="0" aria-orientation="vertical" aria-label="Resize inspector" data-split="p3"></div>
      <div class="pane pane-insp" data-scroll="insp-pane">${right}</div></div>`;
  }
  function syncBanner() {
    if (S.sync === 'offline') return `<div class="banner" role="status">${ic('cloudoff')}<span class="grow"><b>Working offline.</b> 3 changes are saved on this computer and will send when the shared drive returns.</span><button class="btn sm" data-act="sync-open">Details</button></div>`;
    if (S.sync === 'failed') return `<div class="banner bad" role="status">${ic('alert')}<span class="grow"><b>1 shared change couldn’t be read.</b> Everything else is current.</span><button class="btn sm" data-act="sync-open">Details</button></div>`;
    if (S.sync === 'stale') return `<div class="banner" role="status">${ic('info')}<span class="grow"><b>Showing cached data from 8:15 AM.</b></span><button class="btn sm" data-act="sync-open">Refresh</button></div>`;
    return '';
  }

  // ---------------------------------------------------------------- my work
  function myProjects() {
    const me = S.persona; const set = new Map();
    D.tasks.filter((t) => t.person === me && t.status !== 'done').forEach((t) => { set.set(t.project, { a: (set.get(t.project)?.a || 0) + 1, c: set.get(t.project)?.c || 0 }); });
    D.cards.filter((c) => c.assignees.includes(me) && c.status !== 'done').forEach((c) => { const v = set.get(c.project) || { a: 0, c: 0 }; set.set(c.project, { a: v.a, c: v.c + 1 }); });
    return [...set.entries()].map(([id, v]) => ({ id, ...v }));
  }
  function myWorkScreen() {
    const me = S.persona; const list = myProjects();
    if (!S.myProject || (S.myProject !== 'private' && !list.find((x) => x.id === S.myProject))) S.myProject = list[0]?.id || (persona().priv ? 'private' : null);
    const openAll = D.tasks.filter((t) => t.person === me && t.status !== 'done');
    const dueWeek = openAll.filter((t) => t.due <= D.DAYS[4]); const waiting = openAll.filter((t) => t.prio === -1);
    const left = `<div class="pane-title"><span>My projects</span><span>${list.length}</span></div>${list.map((x) => {
      const p = project(x.id); return `<button class="proj" style="cursor:pointer" data-act="my-project" data-id="${x.id}" data-fk="myp-${x.id}" aria-pressed="${S.myProject === x.id}"><b>${esc(p.name)}</b><small>${x.a} ${x.a === 1 ? 'assignment' : 'assignments'} · ${x.c} ${x.c === 1 ? 'Work Card' : 'Work Cards'}</small></button>`; }).join('') || '<div class="empty">No assigned work this week.</div>'}
      ${persona().priv ? `<div class="proj-sec">Only you</div><button class="proj" style="cursor:pointer" data-act="my-project" data-id="private" data-fk="myp-private" aria-pressed="${S.myProject === 'private'}"><b>${ic('lock', 'sm')} Private</b><small>${D.privateTasks.length} private tasks · never synced</small></button>` : ''}`;
    let main;
    const fc = D.focus[me] ? card(D.focus[me]) : null;
    const focusBar = fc && fc.status === 'in_progress' ? `<div class="focusbar"><span class="chip badge-focus">${ic('play', 'sm')}Working on now</span><div class="grow"><b>${esc(fc.title)}</b><div class="hint">${esc(project(fc.project).name)} · ${fmtH(fc.logged)} logged of ${fmtH(fc.min / 60)} planned</div></div><button class="btn sm" data-act="card-act" data-id="${fc.id}" data-v="pause">${ic('pause', 'sm')}Pause</button><button class="btn sm" data-act="select" data-type="card" data-id="${fc.id}">Open</button></div>` : '';
    if (S.myView === 'week') {
      main = `${focusBar}<div class="mw-sec"><h2>My Week</h2><span class="noun">${ic('stack', 'sm')}Work Cards by day · ${ic('flag', 'sm')} assignments due</span></div><div style="overflow:auto">${weekForOne(me)}</div>`;
    } else if (S.myProject === 'private') {
      main = `${focusBar}<div class="mw-sec"><h2>${ic('lock')} Private</h2><span class="chip private">${ic('lock', 'sm')}Only you</span><span class="hint">Stored on this computer. Never sent to the shared drive and never visible to anyone else.</span></div><div role="listbox" aria-label="Private tasks">${D.privateTasks.map((p) => `<div class="row mw priv" role="option" tabindex="0" aria-selected="false" data-fk="priv-${p.id}"><div><span class="noun">${ic('lock', 'sm')}Private task</span></div><div class="main"><div class="ttl">${esc(p.title)}</div><div class="sub">Only you</div></div><div></div><div class="due">${p.due ? esc(fmtDate(p.due)) : 'No date'}</div></div>`).join('')}</div>`;
    } else if (S.myProject) {
      const p = project(S.myProject);
      let ts = D.tasks.filter((t) => t.person === me && t.project === p.id);
      const fl = S.myFilter; ts = ts.filter((t) => (fl === 'open' ? t.status !== 'done' : fl === 'week' ? t.status !== 'done' && t.due <= D.DAYS[4] : t.prio === -1 && t.status !== 'done'));
      const cards = D.cards.filter((c) => c.project === p.id && c.week === D.WEEK_OF);
      main = `${focusBar}<div class="mw-sec"><h2>${esc(p.name)}</h2><span class="hint">${esc(p.client)}</span><span style="margin-left:auto;display:flex;gap:6px"><button class="btn sm" data-act="toast" data-msg="Opens the project folder in Explorer">${ic('folder', 'sm')}Folder</button><button class="btn sm" data-act="toast" data-msg="Project info: notes, activity, people">${ic('info', 'sm')}Project info</button></span></div>
        <div class="mw-sec"><h2>My assignments</h2><span class="noun">${ic('circle', 'sm')}Scheduled by the office</span></div>
        <div role="listbox" aria-label="My assignments">${ts.length ? ts.map((t) => taskRow(t, { hideProject: true, noDrag: true })).join('') : '<div class="empty" style="padding:14px">No assignments match this filter.</div>'}</div>
        <div class="mw-sec"><h2>Project Work Cards</h2><span class="noun">${ic('stack', 'sm')}Shared · week of Nov 9</span></div>
        <div role="listbox" aria-label="Project Work Cards">${cards.length ? cards.map((c) => cardRow(c, { hideProject: true })).join('') : '<div class="empty" style="padding:14px">No Work Cards this week.</div>'}</div>
        <p class="hint" style="padding:10px 14px">Filters apply to your assignments only. Work Cards are shared with everyone assigned to this project.</p>`;
    } else main = '<div class="empty">No assigned work this week.</div>';
    const actions = `<div class="actions">${persona().priv ? `<button class="btn primary" data-act="toast" data-msg="New private task (Ctrl+N) — not part of this mockup">${ic('plus', 'sm')}New private task <kbd>Ctrl N</kbd></button>` : ''}</div>`;
    const bar = `<div class="ws-bar"><span class="seg-ctl" role="group" aria-label="My Work view"><button data-act="my-view" data-v="list" aria-pressed="${S.myView === 'list'}">${ic('list', 'sm')}List</button><button data-act="my-view" data-v="week" aria-pressed="${S.myView === 'week'}">${ic('calendar', 'sm')}My Week</button></span>
      <button class="fchip" data-act="my-filter" data-v="open" aria-pressed="${S.myFilter === 'open'}">All open <span class="n">${openAll.length}</span></button><button class="fchip" data-act="my-filter" data-v="week" aria-pressed="${S.myFilter === 'week'}">Due this week <span class="n">${dueWeek.length}</span></button><button class="fchip" data-act="my-filter" data-v="wait" aria-pressed="${S.myFilter === 'wait'}">${ic('hourglass', 'sm')}Waiting <span class="n">${waiting.length}</span></button>
      <button class="btn only-narrow" data-act="open-proj">${ic('folder', 'sm')}My projects</button><span class="week-label">Today · Tue, Nov 10</span></div>`;
    return `<div class="ws-head"><div><h1>My Work</h1><p>${esc(person(me).name)} · what’s assigned to you, and the shared project work around it.</p></div><div class="grow"></div>${actions}</div>${bar}${syncBanner()}
      ${threePane(left, `<div class="pane mw-main" data-scroll="main" id="main-pane">${main}</div>`, inspector())}`;
  }
  function weekForOne(pid) {
    const save = D.people; const only = save.filter((p) => p.id === pid);
    if (!only.length) return '<div class="empty">No week data.</div>';
    const p = only[0]; const orig = p.lane; p.lane = true; const html = weekHTML(); p.lane = orig;
    // limit to this person only
    const tmp = document.createElement('div'); tmp.innerHTML = html;
    tmp.querySelectorAll('.wk-row').forEach((r) => { if (!r.textContent.includes(p.name)) r.remove(); });
    return tmp.innerHTML;
  }

  // ---------------------------------------------------------------- spec screens
  function objectsSpec() {
    const t = task('t1'); const c = card('c1');
    return `<div class="spec" data-scroll="spec"><h2>Four kinds of work, four distinct shapes</h2>
      <div class="grid2 wide">
        <div class="tile"><h3>${ic('circle')} Scheduled assignment</h3><div><div role="listbox" style="border:1px solid var(--line)">${taskRow(t, { noDrag: true })}</div><p class="hint">Office planning work tied to a person, project and due date. Circle status icon with the priority chip beside it (status word in the inspector and on hover). No hours.</p></div></div>
        <div class="tile"><h3>${ic('stack')} Work Card</h3><div><div role="listbox" style="border:1px solid var(--line)">${cardRow(c)}</div><p class="hint">Shared project work for a project and week. Square marker, “Work Card” label, indented accent edge, planned hours, one or more assignees.</p></div></div>
        <div class="tile"><h3>${ic('list')} Action Item</h3><div><div class="ai"><button class="btn sm" role="checkbox" aria-checked="false" aria-label="Incorporate client markups">${ic('minus', 'sm')}</button><span>Incorporate client markups</span><span class="noun" style="margin-left:auto">Action Item</span></div><p class="hint">A step inside one assignment. Only appears in the assignment’s Details. Never a Work Card.</p></div></div>
        <div class="tile"><h3>${ic('lock')} Private task <span class="chip private" style="margin-left:auto">Partner only</span></h3><div><div class="row mw priv" style="grid-template-columns:110px 1fr auto"><div><span class="noun">${ic('lock', 'sm')}Private task</span></div><div class="main"><div class="ttl">Review partner meeting agenda</div><div class="sub">Only you · never synced</div></div><div class="due">Wed, Nov 11</div></div><p class="hint">Local-only; shown in My Work for Partners (baseline §2). Not shown to other roles.</p></div></div>
      </div>
      <h2>Status vocabulary — icon shape + word, colour only reinforces</h2>
      <div class="grid2">
        <div class="tile"><h3>Assignment status</h3><div class="states">${['not_started', 'in_progress', 'done'].map((s) => `<div>${taskMk(s)}<span class="hint">${{ not_started: 'Nothing started yet', in_progress: 'Being worked', done: 'Completed' }[s]}</span></div>`).join('')}</div></div>
        <div class="tile"><h3>Priority (separate from status)</h3><div class="states"><div>${prioChip(1)}${prioChip(2)}${prioChip(3)}${prioChip(4)}</div><div>${prioChip(-1)}<span class="hint">Waiting is a priority label, not a status</span></div><div><span class="chip p3">${ic('flag', 'sm')}Rush</span><span class="hint">Custom priorities use the same chip with their own label</span></div></div></div>
        <div class="tile"><h3>Carryover state</h3><div class="states"><div><span class="chip nr">${ic('eye', 'sm')}Not Reviewed</span><span class="hint">Carried over and awaiting a Keep / Delete decision</span></div></div></div>
        <div class="tile"><h3>Work Card status</h3><div class="states">${['todo', 'in_progress', 'paused', 'done'].map((s) => `<div>${cardMk(s)}<span class="hint">${{ todo: 'Not begun', in_progress: 'Active', paused: 'Set aside', done: 'Complete (excluded from load)' }[s]}</span></div>`).join('')}<div><span class="chip badge-focus">${ic('play', 'sm')}Working on now</span><span class="hint">The viewer’s own focus — personal, never shared</span></div></div></div>
      </div>
      <h2>Staff load — V1.3 model: planned Work Card hours ÷ office target (${fmtH(D.CAPACITY.week)}/week)</h2>
      <div class="grid2">
        ${[['Unscheduled', 'projects, 0 h', { key: 'none', label: 'Unscheduled', ratio: 0 }, 0], ['Available', '< 50 %', loadState(12, 40), 12], ['On target', '50 – 100 %', loadState(30, 40), 30], ['Over capacity', '> 100 %', loadState(51.5, 40), 51.5]].map(([n, r, l, h]) => `<div class="tile"><h3>${n}</h3><div>${loadHTML(l, h, 40)}<p class="hint">${r}. Done cards are excluded; each assignee is credited the card’s full planned time. Scheduled assignments add no hours.</p></div></div>`).join('')}
        <div class="tile"><h3>No projects</h3><div>${loadHTML({ key: 'none', label: 'No projects', ratio: 0 }, 0, 40)}<p class="hint">No open assignments.</p></div></div>
      </div>
      <h2>How to tell them apart without colour</h2>
      <table><tr><th></th><th>Assignment</th><th>Work Card</th><th>Action Item</th><th>Private task</th></tr>
      <tr><td>Marker</td><td>Circle</td><td>Square</td><td>Checkbox</td><td>Lock</td></tr>
      <tr><td>Label</td><td>Priority chip + status icon (word in inspector)</td><td>“Work Card” + status word</td><td>“Action Item”</td><td>“Private task · Only you”</td></tr>
      <tr><td>Lives in</td><td>Schedule lane, My assignments</td><td>Project Work Cards section, Week spans</td><td>Inside an assignment’s Details</td><td>My Work › Private</td></tr>
      <tr><td>Hours</td><td>None</td><td>Planned + logged</td><td>None</td><td>None</td></tr>
      <tr><td>Who edits</td><td>Assignee or administrator</td><td>Partners / Senior staff (focus is personal)</td><td>Follows parent assignment</td><td>Owner</td></tr></table></div>`;
  }
  function syncSpec() {
    return `<div class="spec" data-scroll="spec"><h2>Sync and connection states</h2><p class="hint">The title-bar status is always visible; clicking it opens this detail. Offline and error states also add a banner above the workspace. Use the “Sync state” selector above to switch the live window.</p>
      <div class="grid2">${Object.entries(SYNC).map(([k, s]) => `<div class="tile"><h3>${ic(s.icon)} ${esc(s.title)}</h3><div><p style="margin:0 0 6px"><b>Title bar:</b> <span class="tb-btn ${s.cls}" style="height:auto;padding:2px 8px">${ic(s.icon, 'sm')}${esc(s.text)}</span></p><p style="margin:0 0 6px">${esc(s.body)}</p>${(s.list || []).map((x) => `<div class="ai">${esc(x)}</div>`).join('')}${s.action ? `<button class="btn sm" data-act="toast" data-msg="${esc(s.action)}">${esc(s.action)}</button>` : '<span class="hint">No action needed</span>'}</div></div>`).join('')}</div></div>`;
  }
  function rolesSpec() {
    const rows = [
      ['Staff', 'My Work', 'My Work · Projects (context allowed by V1.3 rules)', 'Own assignments and shared Work Cards on assigned projects; “Working on now”; edit own assignments; comments and Action Items per task permissions', 'Schedule, Team, Portfolio, Office'],
      ['Senior staff', 'Team', 'Team · My Work · Projects', 'Team staff overview and calendar; create, edit, assign and complete Work Cards; project context', 'Portfolio, partner-only settings'],
      ['Partner', 'Portfolio', 'Portfolio · My Work · Schedule · Projects · Office', 'Everything above plus project editing, office scheduling, private tasks, office capacity targets, Publish Changes during rollover', '—'],
      ['Scheduling administrator', 'Schedule (or last used)', 'Schedule · My Work · Projects · permitted Office areas', 'Drag-to-assign, task editing, Carryover review, Bulk Actions, Print/export, Excel refresh, staff and priority management where permitted', 'Partner-only items'],
    ];
    return `<div class="spec" data-scroll="spec"><h2>Role matrix (from the Phase 0 baseline)</h2><table><tr><th>Role</th><th>Default</th><th>Navigation</th><th>Main powers</th><th>Hidden</th></tr>${rows.map((r) => `<tr>${r.map((x, i) => `<td${i === 0 ? ' style="font-weight:600"' : ''}>${esc(x)}</td>`).join('')}</tr>`).join('')}</table>
      <p class="hint">Hiding a workspace is a clarity aid only; every operation is authorized in the main process (baseline §2). Switch the persona selector to see each navigation set. Team, Portfolio, Projects and Office screens are planned for round 3.</p>
      <h2>Dual roles</h2><p>Riley Chen in the fixture is both Senior staff and a scheduling administrator, so Riley sees Team <i>and</i> Schedule. Navigation is the union of the roles’ destinations, and the landing page is the highest-priority default.</p></div>`;
  }
  function shortcutsSpec() {
    return `<div class="spec" data-scroll="spec"><h2>Keyboard (retained from V1.3, plus flagged additions)</h2>${shortcutTable()}</div>`;
  }
  function shortcutTable() {
    const r = [
      ['Ctrl/Cmd + K, Ctrl/Cmd + F', 'Focus search (opens the search sheet here). Scope follows the active workspace.', 'V1.3'],
      ['Ctrl/Cmd + N', 'Add task (administrators) · new private task (Partners) in My Work', 'V1.3'],
      ['Ctrl/Cmd + P', 'Open export / print', 'V1.3'],
      ['Ctrl/Cmd + E', 'Refresh Excel (administrators)', 'V1.3'],
      ['↑ / ↓', 'Move selection through the list when not editing', 'V1.3 (MyTasks)'],
      ['Enter / Space', 'Open or activate the focused card or control', 'V1.3'],
      ['Esc', 'Closes, in order: menu → dialog → sheet → search sheet → inspector slide-over, then clears search / filters', 'V1.3'],
      ['Enter · Shift+Enter', 'Send comment · new line in comment', 'V1.3'],
      ['← → Home End', 'Move between tabs', 'V1.3 (MyTasks tabs)'],
      ['Enter on “Assign…”', 'Keyboard alternative to drag-and-drop: choose a person from a list', 'New — flagged'],
      ['?', 'Show this shortcut sheet', 'New — flagged'],
      ['Ctrl/Cmd + B', 'Hide or show the sidebar (toggle at the left of the title bar; remembered)', 'New — flagged'],
    ];
    return `<table class="kb"><tr><th>Keys</th><th>Action</th><th>Origin</th></tr>${r.map(([k, a, o]) => `<tr><td>${k.split(', ').map((x) => `<kbd>${x}</kbd>`).join(' ')}</td><td>${a}</td><td class="${o.startsWith('New') ? '' : 'x'}">${o}</td></tr>`).join('')}</table>`;
  }
  function placeholder(id) {
    const info = {
      'ph-portfolio': ['Portfolio', 'Partner default. Project portfolio and detail, staff workload, project editing with unsaved-edit protection, Work Card capabilities.'],
      'ph-team': ['Team', 'Senior-staff default. Staff overview and team calendar/project detail with V1.3 senior authority for Work Cards.'],
      'ph-projects': ['Projects', 'Current / Future catalogue, project notes and activity, folder links, partner and leads. Excel refresh and write-back for authorized roles.'],
      'ph-office': ['Office', 'Role-protected: staff and business roles, custom priorities, office capacity targets, settings, export, backups, logs, sync recovery.'],
    }[id];
    return `<div class="ws-head"><div><h1>${info[0]}</h1><p>Planned for round 3</p></div></div><div class="empty"><p>${ic('info', 'lg')}</p><p style="max-width:520px;margin:0 auto">${info[1]}</p><p class="hint">Not mocked in round 2. It will reuse the same shell, list rows, inspector and status vocabulary.</p></div>`;
  }

  // ---------------------------------------------------------------- shell
  function render() {
    const keep = snapshot();
    const sc = S.screen; const per = persona();
    document.documentElement.dataset.density = S.density;    if (S.theme === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = S.theme;
    const nav = per.nav.map((k) => {
      const [label, icon, target] = NAVDEF[k]; const active = (k === 'schedule' && SCHED_SCREENS.includes(sc)) || (k === 'mywork' && sc === 'mywork') || sc === target;
      const n = k === 'mywork' ? openTasks(S.persona).length : '';
      return `<button data-act="nav" data-target="${target}" ${active ? 'aria-current="page"' : ''} title="${label}${n ? ` (${n} open)` : ''}" aria-label="${label}${n ? `, ${n} open` : ''}" data-fk="nav-${k}">${ic(icon)}<span class="lb">${label}</span>${n ? `<span class="n">${n}</span>` : ''}</button>`;
    }).join('');
    let content;
    if (SCHED_SCREENS.includes(sc)) content = `<div class="ws">${scheduleScreen()}</div>`;
    else if (sc === 'mywork') content = `<div class="ws">${myWorkScreen()}</div>`;
    else if (sc.startsWith('ph-')) content = `<div class="ws">${placeholder(sc)}</div>`;
    else {
      const t = { objects: 'Spec · Objects and states', sync: 'Spec · Sync states', roles: 'Spec · Roles and navigation', shortcuts: 'Spec · Keyboard' }[sc];
      content = `<div class="ws"><div class="ws-head"><div><h1>${t}</h1></div></div>${{ objects: objectsSpec, sync: syncSpec, roles: rolesSpec, shortcuts: shortcutsSpec }[sc]()}</div>`;
    }
    const crumb = SCHED_SCREENS.includes(sc) ? 'Schedule' : sc === 'mywork' ? 'My Work' : sc.startsWith('ph-') ? NAVDEF[Object.keys(NAVDEF).find((k) => NAVDEF[k][2] === sc)][0] : 'Spec';
    const sy = SYNC[S.sync];
    const searchLabel = sc === 'mywork' ? 'Search my work' : 'Search tasks and people';
    const winStyle = S.width === 'fit' ? '' : `--win-w:${S.width}px;`;
    $app.innerHTML = `${frameHTML()}<div class="win ${S.insOpen ? 'insp-open' : ''} ${S.projOpen ? 'proj-open' : ''} ${S.navMin ? 'nav-min' : ''}" style="${winStyle}" id="win">
      <div class="tb"><button class="tb-btn tb-toggle" data-act="nav-toggle" data-fk="nav-toggle" aria-expanded="${!S.navMin}" aria-controls="nav" aria-label="${S.navMin ? 'Show' : 'Hide'} sidebar" title="${S.navMin ? 'Show' : 'Hide'} sidebar (Ctrl+B)">${ic('sidebar')}</button><div class="brand"><span class="mark">S</span><span class="bn">StudioSync</span></div><span class="crumb">/ ${esc(crumb)}</span>
        <button class="tb-search" data-act="search-open" data-fk="search-btn" aria-label="${searchLabel} (Ctrl+K)">${ic('search', 'sm')}<span>${searchLabel}…</span><kbd>Ctrl K</kbd></button>
        <button class="tb-btn ${sy.cls}" data-act="sync-open" data-fk="sync-btn" aria-haspopup="dialog" aria-expanded="${S.popover === 'sync'}">${ic(sy.icon, 'sm' + (sy.spin ? ' spin' : ''))}<span>${esc(sy.text)}</span></button>
        <button class="tb-btn" data-act="toast" data-msg="Account menu: sign out, switch user">${av(S.persona)}<span class="bn">${esc(person(S.persona).name)}</span></button>
        <div class="caption" aria-hidden="true"><span>&#8212;</span><span>&#9633;</span><span>&#10005;</span></div></div>
      <div class="body"><nav class="nav" id="nav" aria-label="StudioSync workspaces"><div class="nav-label">Workspace</div>${nav}<div class="who"><b>${esc(person(S.persona).name)}</b><span>${esc(per.role)}</span></div></nav>${content}</div>
      <div id="layer"></div></div>`;
    restore(keep); layer(); postRender();
  }
  const SCREENS = [['Workspaces', [['board', 'Schedule · Board'], ['drag', 'Drag & assign'], ['week', 'Schedule · Week'], ['mywork', 'My Work']]], ['Specs', [['objects', 'Objects & states'], ['sync', 'Sync'], ['search', 'Search'], ['roles', 'Roles'], ['rollover', 'Rollover'], ['shortcuts', 'Shortcuts']]]];
  const tabSel = (id) => (id === 'week' ? S.screen === 'board' && S.view === 'week' : id === 'board' ? S.screen === 'board' && S.view === 'board' : S.screen === id);
  const NOTES = {
    board: ['Eleven staff, twenty projects and about forty assignments: this is the density test. Switch Comfortable / Compact and the window width.', 'Each lane leads with V1.3 load (planned Work Card hours ÷ 40h target) as segmented bar + hours + word; secondary counts follow.', 'Publish Changes appears only while a rollover is active (use “Rollover” in the selector to turn it off). Carryover, Bulk Actions and Print keep V1.3 names.', 'To confirm: lane orientation vs the real Dashboard board; whether load should appear on Schedule at all (V1.3 shows it in MyTasks).'],
    week: ['Spans are Work Cards (start → end); flags are assignments on their due day. Shape differs, so they stay distinct.', 'Day cells show V1.3 daily load (card hours spread across working days) against 8h. The weekend column holds the Saturday due date from the fixture.', 'Undated Work Cards wait in “Needs dates”.'],
    drag: ['Pointer: drag a project (or an assignment) onto a person. Keyboard: Enter on “Assign…” opens a person list with load shown.', 'Assigning creates an assignment and adds no Work Card hours, so load only changes when cards are added. The drop hint says so.', 'A toast with Undo confirms every assignment.'],
    mywork: ['Assignments and Work Cards are separate sections with different markers and labels.', '“Working on now” is the viewer’s own focus. Staff cannot complete Work Cards; Partners and Senior staff can (Work Cards plan).', 'Private tasks appear only for the Partner persona. Try the persona selector.'],
    objects: ['The vocabulary every screen reuses. Colour is never the only carrier of meaning.'],
    sync: ['Switch states with “Sync state”. Behavior of the device-trust state is a guess to confirm.'],
    search: ['Ctrl+K / Ctrl+F opens search. Results are grouped; staff only see their authorized scope.'],
    roles: ['Navigation differs by role but the shell is identical.'],
    rollover: ['Carryover review with explicit Keep / Delete. “Publish weekly schedule?” mirrors the V1.3 confirm, including how many tasks remain Not Reviewed.', 'Confirming shows a publishing overlay then removes the button.'],
    shortcuts: ['Every V1.3 shortcut retained; additions are flagged as new.'],
  };
  function frameHTML() {
    const tabs = SCREENS.map(([g, items]) => `<div class="tabgroup" role="tablist" aria-label="${g}"><b>${g}</b>${items.map(([id, label]) => `<button class="tab" role="tab" aria-selected="${tabSel(id)}" data-act="screen" data-id="${id}" data-fk="tab-${id}">${label}</button>`).join('')}</div>`).join('');
    const sel = (id, label, val, opts) => `<label>${label}<select id="${id}" data-fk="${id}">${opts.map(([v, l]) => `<option value="${v}" ${String(val) === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`;
    const key = S.screen === 'board' && S.view === 'week' ? 'week' : S.screen;
    return `<div class="frame"><div class="frame-top"><h1>StudioSync V2 · Phase 1 · Round 2 mockup</h1><p>Fictional data. V1.3 is untouched. See docs/V2_PHASE_1_MOCKUP_BRIEF.md for decisions D1–D6.</p></div>
      <div class="tabs-row">${tabs}</div>
      <div class="controls">${sel('c-persona', 'Persona', S.persona, [['morgan', 'Morgan · Partner'], ['riley', 'Riley · Senior + admin'], ['avery', 'Avery · Staff']])}
        ${sel('c-density', 'Density', S.density, [['comfortable', 'Comfortable'], ['compact', 'Compact']])}
        ${sel('c-width', 'Window width', S.width, [['fit', 'Fit'], ['1920', '1920'], ['1600', '1600'], ['1366', '1366'], ['1100', '1100'], ['960', '960']])}
        ${sel('c-theme', 'Theme', S.theme, [['auto', 'System'], ['light', 'Light'], ['dark', 'Dark']])}
        ${sel('c-sync', 'Sync state', S.sync, Object.entries(SYNC).map(([k, v]) => [k, v.title]))}
        ${sel('c-roll', 'Rollover', S.rollover, [['review', 'Review in progress'], ['idle', 'Idle']])}</div></div>`;
  }
  function notesHTML() {
    const key = S.screen === 'board' && S.view === 'week' ? 'week' : S.screen;
    return `<div class="frame" style="padding-top:0"><div class="notes"><section><h2>What to evaluate here</h2><ul>${(NOTES[key] || NOTES.board).map((n) => `<li>${esc(n)}</li>`).join('')}</ul></section>
      <section><h2>Try</h2><ul><li><kbd>Ctrl K</kbd> search · <kbd>↑</kbd><kbd>↓</kbd> move through rows · <kbd>?</kbd> shortcuts · <kbd>Esc</kbd> closes</li><li>Resize the window width to see the inspector become a slide-over (≤1250) and the project list collapse (≤1000).</li><li>Drag the thin splitters between panes (arrow keys work when focused).</li></ul></section></div></div>`;
  }

  // ---------------------------------------------------------------- overlays (rendered in #layer)
  function layer() {
    const el = document.getElementById('layer'); if (!el) return;
    let h = '';
    if (S.overlay === 'search') h += searchSheet();
    if (S.overlay === 'publish') h += publishDialog();
    if (S.overlay === 'publishing') h += `<div class="overlay" role="alertdialog" aria-live="polite"><div class="sheet" style="width:360px"><div class="sheet-b" style="text-align:center;padding:28px">${ic('sync', 'lg spin')}<h2 style="margin:10px 0 4px">Publishing schedule…</h2><p class="hint" style="margin:0">Writing to the shared drive. This can take a moment on a network folder.</p></div></div></div>`;
    if (S.overlay === 'shortcuts') h += `<div class="overlay" data-act="overlay-bg"><div class="sheet" style="width:min(720px,calc(100% - 32px))" role="dialog" aria-label="Keyboard shortcuts"><div class="sheet-h">${ic('keyboard')}<h2>Keyboard shortcuts</h2><button class="btn sm" data-act="overlay-close">${ic('x', 'sm')}Close <kbd>Esc</kbd></button></div><div class="sheet-b">${shortcutTable()}</div></div></div>`;
    if (S.popover === 'sync') h += syncPopover();
    if (S.menu) h += assignMenu();
    if (S.toast) h += `<div class="toast" role="status">${esc(S.toast.msg)}${S.toast.undo ? `<button data-act="toast-undo">Undo</button>` : ''}</div>`;
    el.innerHTML = h;
  }
  function syncPopover() {
    const s = SYNC[S.sync];
    return `<div class="pop" style="top:44px;right:150px" role="dialog" aria-label="Sync status"><h3>${ic(s.icon, 'sm')} ${esc(s.title)}</h3><p>${esc(s.body)}</p>${(s.list || []).map((x) => `<div class="ai" style="margin:2px 8px">${esc(x)}</div>`).join('')}<div style="display:flex;gap:6px;padding:8px">${s.action ? `<button class="btn sm primary" data-act="toast" data-msg="${esc(s.action)}">${esc(s.action)}</button>` : ''}<button class="btn sm" data-act="toast" data-msg="Opens Office › Sync recovery and logs">Recovery &amp; logs</button></div></div>`;
  }
  function assignMenu() {
    const m = S.menu; const what = m.kind === 'project' ? project(m.id).name : task(m.id).title;
    const items = lanes().map((p, i) => { const l = staffLoad(p.id); return `<button class="item" role="menuitem" data-act="assign-to" data-person="${p.id}" aria-selected="${i === (m.i || 0)}" data-fk="mi-${p.id}">${av(p.id)}<span>${esc(p.name)}</span><span class="load ${l.key}"><span class="lbl">${ic(loadIcon[l.key], 'sm')}${esc(l.label)}</span><b>${fmtH(l.h)}</b></span></button>`; }).join('');
    const style = m.pos ? `left:${m.pos.x}px;top:${m.pos.y}px` : 'left:260px;top:180px';
    return `<div class="pop" style="${style};max-height:420px;overflow:auto" role="menu" aria-label="Assign to" id="assign-menu"><h3>${m.kind === 'project' ? 'Assign' : 'Reassign'} “${esc(what)}” to…</h3><p class="hint">↑ ↓ choose · Enter assigns · Esc cancels. Assigning adds an assignment, not Work Card hours.</p>${items}</div>`;
  }
  function searchSheet() {
    return `<div class="overlay" data-act="overlay-bg"><div class="sheet" role="dialog" aria-label="Search"><div class="sheet-in">${ic('search')}<input id="q" data-fk="q" value="${esc(S.q)}" placeholder="${S.screen === 'mywork' ? 'Search my work' : 'Search tasks, people, projects, Work Cards'}" autocomplete="off" aria-label="Search"><span class="chip p4">Scope: ${S.screen === 'mywork' ? 'My Work' : persona().schedule ? 'Schedule · all staff' : 'My assigned work'}</span><kbd>Esc</kbd></div><div class="sheet-b" style="padding:0" id="results">${resultsHTML()}</div><div class="sheet-f"><span class="hint" style="margin-right:auto">↑ ↓ move · Enter opens · results are limited to what your role may see</span></div></div></div>`;
  }
  let flatResults = [];
  function resultsHTML() {
    const q = S.q.trim().toLowerCase(); flatResults = [];
    const full = persona().schedule;
    const myScope = (projId) => full || D.tasks.some((t) => t.person === S.persona && t.project === projId) || D.cards.some((c) => c.assignees.includes(S.persona) && c.project === projId);
    const groups = [
      ['People', ic('user', 'sm'), full ? D.people.filter((p) => p.lane && (!q || p.name.toLowerCase().includes(q) || p.role.toLowerCase().includes(q))).map((p) => ({ k: 'person', id: p.id, t: p.name, s: p.role })) : []],
      ['Projects', ic('folder', 'sm'), D.projects.filter((p) => myScope(p.id) && (!q || p.name.toLowerCase().includes(q) || p.client.toLowerCase().includes(q))).map((p) => ({ k: 'project', id: p.id, t: p.name, s: p.client }))],
      ['Assignments', ic('circle', 'sm'), D.tasks.filter((t) => (full || t.person === S.persona) && (!q || t.title.toLowerCase().includes(q) || project(t.project).name.toLowerCase().includes(q) || person(t.person).name.toLowerCase().includes(q))).map((t) => ({ k: 'task', id: t.id, t: t.title, s: `${person(t.person).name} · ${project(t.project).name}` }))],
      ['Work Cards', ic('stack', 'sm'), D.cards.filter((c) => myScope(c.project) && (!q || c.title.toLowerCase().includes(q) || project(c.project).name.toLowerCase().includes(q))).map((c) => ({ k: 'card', id: c.id, t: c.title, s: project(c.project).name }))],
      ['Comments', ic('message', 'sm'), D.tasks.filter((t) => (full || t.person === S.persona)).flatMap((t) => t.comments.map((m) => ({ k: 'task', id: t.id, t: m.text, s: `${person(m.who).name} on ${t.title}` }))).filter((r) => q && r.t.toLowerCase().includes(q))],
    ];
    let out = ''; let n = 0;
    groups.forEach(([name, icon, items]) => {
      if (!items.length) return;
      out += `<div class="res-g"><h3>${icon} ${name} · ${items.length > 5 ? `5 of ${items.length}` : items.length}</h3>${items.slice(0, 5).map((r) => { const i = n++; flatResults.push(r); return `<div class="res" role="option" data-act="res" data-i="${i}" aria-selected="${i === S.qSel}"><span>${esc(r.t)}</span><span class="sub">${esc(r.s)}</span></div>`; }).join('')}</div>`;
    });
    return out || `<div class="empty">No results for “${esc(S.q)}”.</div>`;
  }
  function publishDialog() {
    const nr = carryTasks().filter(notReviewed).length; const n = D.tasks.filter((t) => t.status !== 'done').length;
    return `<div class="overlay"><div class="sheet" style="width:480px" role="alertdialog" aria-labelledby="pd"><div class="sheet-h">${ic('send')}<h2 id="pd">Publish weekly schedule?</h2></div><div class="sheet-b"><p style="margin:0 0 8px">${nr ? `${nr} task${nr === 1 ? '' : 's'} will remain marked <b>Not Reviewed</b> in MyTasks.` : 'MyTasks will receive these scheduling changes in one update.'}</p><p class="hint" style="margin:0">${n} open assignments will be sent in one update. Rollover publication is safe to repeat.</p></div><div class="sheet-f"><button class="btn" data-act="overlay-close">Cancel</button><button class="btn primary" data-act="publish-confirm" data-fk="pub-ok">Publish Changes</button></div></div></div>`;
  }

  // ---------------------------------------------------------------- render helpers: scroll/focus preservation, post-render
  function snapshot() {
    const sc = {}; document.querySelectorAll('[data-scroll]').forEach((e) => { sc[e.dataset.scroll] = [e.scrollTop, e.scrollLeft]; });
    const a = document.activeElement; const fk = a && a.dataset ? a.dataset.fk : null;
    return { sc, fk, q: a && a.id === 'q' ? [a.selectionStart, a.selectionEnd] : null };
  }
  function restore(k) {
    document.querySelectorAll('[data-scroll]').forEach((e) => { const v = k.sc[e.dataset.scroll]; if (v) { e.scrollTop = v[0]; e.scrollLeft = v[1]; } });
    if (k.fk) { const e = document.querySelector(`[data-fk="${k.fk}"]`); if (e) e.focus({ preventScroll: true }); }
  }
  function postRender() {
    const n = document.getElementById('notes'); const html = notesHTML();
    if (!n) { const d = document.createElement('div'); d.id = 'notes'; d.innerHTML = html; $app.appendChild(d); } else n.innerHTML = html;
    const w = document.getElementById('win'); if (!w) return;
    // static drag demonstration
    if (S.screen === 'drag' && persona().schedule) {
      if (S.dragMode === 'pointer') {
        const lane = w.querySelector('.lane[data-person="blair"]'); const three = w.querySelector('.three');
        if (lane && three) { lane.classList.add('drop-target'); const lr = lane.getBoundingClientRect(); const tr = three.getBoundingClientRect(); const g = document.createElement('div'); g.className = 'ghost'; g.innerHTML = `${ic('grip', 'sm')}Cedar Row Lofts<span class="hint">dragging</span>`; g.style.left = (lr.left - tr.left + 120) + 'px'; g.style.top = (lr.top - tr.top + 26) + 'px'; three.appendChild(g); }
      } else if (!S.menu) {
        const b = w.querySelector('[data-act="assign-open"][data-id="cedar"]');
        if (b) { const wr = w.getBoundingClientRect(); const br = b.getBoundingClientRect(); S.menu = { kind: 'project', id: 'cedar', i: 0, pos: { x: br.right - wr.left + 8, y: Math.max(48, br.top - wr.top - 10) } }; layer(); }
      }
    }
    document.getElementById('c-persona')?.setAttribute('aria-label', 'Persona');
    if (S.menu && !document.activeElement.closest?.('#assign-menu')) document.querySelector('#assign-menu .item[aria-selected="true"]')?.focus({ preventScroll: true });
    if (S.overlay === 'search' && document.activeElement?.id !== 'q') document.getElementById('q')?.focus();
    if (S.overlay === 'publish') document.querySelector('[data-fk="pub-ok"]')?.focus();
  }

  // ---------------------------------------------------------------- actions
  function setScreen(id) {
    S.overlay = null; S.menu = null; S.popover = null; S.carryover = false; S.insOpen = false; S.projOpen = false;
    if (id === 'week') { S.screen = 'board'; S.view = 'week'; } else { S.screen = id; if (id === 'board') S.view = 'board'; }
    if (['drag', 'rollover', 'search', 'shortcuts'].includes(id)) { S.view = 'board'; }
    if (id === 'drag') { S.dragMode = S.dragMode || 'pointer'; }
    if (id === 'rollover') { S.rollover = 'review'; S.carryover = true; S.overlay = 'publish'; }
    if (id === 'search') { S.overlay = 'search'; S.q = 'harbor'; S.qSel = 0; }
    if (id === 'shortcuts') S.overlay = 'shortcuts';
    if (id === 'mywork') S.myProject = null;
    render();
  }
  function select(type, id) {
    S.sel = { type, id }; S.itab = 'details'; if (window.innerWidth) S.insOpen = true;
    if (type === 'card' && S.screen !== 'mywork' && S.view === 'board') { /* keep board */ }
  }
  function toast(msg, undo) { S.toast = { msg, undo }; layer(); clearTimeout(toast.t); toast.t = setTimeout(() => { S.toast = null; layer(); }, undo ? 6000 : 2600); }
  function doAssign(kind, id, personId) {
    S.menu = null;
    if (kind === 'task') { const t = task(id); const prev = t.person; t.person = personId; select('task', id); render(); S.undo = () => { t.person = prev; render(); }; toast(`Reassigned “${t.title}” to ${person(personId).name}`, true); return; }
    const p = project(id); const nt = { id: 'tn' + Date.now(), project: id, person: personId, title: 'New assignment', prio: 3, status: 'not_started', due: '2026-11-13', lead: p.lead, notes: '', actions: [], comments: [] };
    D.tasks.push(nt); select('task', nt.id); render(); S.undo = () => { D.tasks.splice(D.tasks.indexOf(nt), 1); render(); };
    toast(`Assigned ${p.name} to ${person(personId).name}`, true);
  }
  function openAssign(kind, id, el) {
    const w = document.getElementById('win').getBoundingClientRect(); const r = el ? el.getBoundingClientRect() : null;
    S.menu = { kind, id, i: 0, pos: r ? { x: Math.min(r.right - w.left + 6, w.width - 380), y: Math.max(48, Math.min(r.top - w.top - 10, w.height - 440)) } : null }; layer(); postRender();
  }
  function closeTop() {
    if (S.menu) { S.menu = null; if (S.screen === 'drag') S.dragMode = 'pointer'; } else if (S.popover) S.popover = null; else if (S.overlay && S.overlay !== 'publishing') S.overlay = null;
    else if (S.insOpen) S.insOpen = false; else if (S.projOpen) S.projOpen = false; else if (S.carryover) S.carryover = false; else if (S.projFilter) S.projFilter = null; else return false;
    render(); return true;
  }

  $app.addEventListener('click', (e) => {
    const t = e.target.closest('[data-act]'); if (!t) { if (S.popover && !e.target.closest('.pop')) { S.popover = null; render(); } return; }
    const a = t.dataset.act; const id = t.dataset.id;
    if (t.closest('.pop') === null && S.popover && a !== 'sync-open') { S.popover = null; }
    switch (a) {
      case 'nav-toggle': S.navMin = !S.navMin; lsSet('navMin', S.navMin); return render();
      case 'screen': return setScreen(id);
      case 'persona': S.persona = id; resetSel(); return render();
      case 'nav': S.overlay = null; S.insOpen = false; S.carryover = false; S.screen = t.dataset.target; return render();
      case 'select': if (e.target.closest('[data-act="assign-open"]')) return; select(t.dataset.type, id); return render();
      case 'itab': S.itab = t.dataset.tab; return render();
      case 'lane': S.collapsed[id] = !S.collapsed[id]; return render();
      case 'proj': if (e.target.closest('[data-act="assign-open"]')) return openAssign('project', id, e.target.closest('[data-act="assign-open"]')); S.projFilter = S.projFilter === id ? null : id; S.projOpen = false; return render();
      case 'proj-clear': S.projFilter = null; return render();
      case 'assign-open': e.stopPropagation(); return openAssign('project', id, t);
      case 'reassign': return openAssign('task', id, t);
      case 'assign-to': return doAssign(S.menu.kind === 'project' ? 'project' : 'task', S.menu.id, t.dataset.person);
      case 'view': S.view = t.dataset.v; return render();
      case 'carryover': S.carryover = !S.carryover; return render();
      case 'decide': S.decisions[id] = S.decisions[id] === t.dataset.v ? undefined : t.dataset.v; if (!S.decisions[id]) delete S.decisions[id]; return render();
      case 'publish': S.overlay = 'publish'; return render();
      case 'publish-confirm': { const nr = carryTasks().filter(notReviewed).length; const count = D.tasks.filter((x) => x.status !== 'done').length; S.overlay = 'publishing'; render(); setTimeout(() => { S.overlay = null; S.rollover = 'idle'; S.carryover = false; D.tasks.forEach((x) => { if (S.decisions[x.id] === 'delete') x.status = 'done'; if (x.carry && S.decisions[x.id]) delete x.carry; }); S.decisions = {}; render(); toast(`Published ${count} tasks${nr ? `, ${nr} Not Reviewed` : ''}`); }, 1400); return; }
      case 'overlay-close': S.overlay = null; return render();
      case 'overlay-bg': if (e.target === t) { S.overlay = null; render(); } return;
      case 'search-open': S.overlay = 'search'; S.qSel = 0; return render();
      case 'res': return openResult(+t.dataset.i);
      case 'sync-open': S.popover = S.popover === 'sync' ? null : 'sync'; return render();
      case 'toast': return toast(t.dataset.msg);
      case 'toast-undo': S.undo?.(); S.toast = null; return layer();
      case 'toggle-action': { const x = task(id).actions[+t.dataset.i]; x.done = !x.done; return render(); }
      case 'mark-done': { const x = task(id); x.status = x.status === 'done' ? 'in_progress' : 'done'; return render(); }
      case 'comment': { const inp = document.querySelector('[data-comment]'); if (inp && inp.value.trim()) { task(id).comments.push({ who: S.persona, at: 'Just now', text: inp.value.trim() }); S.itab = 'talk'; render(); } return; }
      case 'card-act': return cardAct(id, t.dataset.v);
      case 'my-project': S.myProject = id; S.myView = 'list'; S.projOpen = false; return render();
      case 'my-filter': S.myFilter = t.dataset.v; return render();
      case 'my-view': S.myView = t.dataset.v; return render();
      case 'close-insp': S.insOpen = false; return render();
      case 'open-proj': S.projOpen = true; return render();
      case 'close-proj': S.projOpen = false; return render();
      default:
    }
  });
  function cardAct(id, v) {
    const c = card(id); const me = S.persona;
    if (v === 'start') { c.status = 'in_progress'; D.focus[me] = c.id; }
    else if (v === 'pause') { c.status = 'paused'; if (D.focus[me] === c.id) delete D.focus[me]; }
    else if (v === 'resume') { c.status = 'in_progress'; D.focus[me] = c.id; }
    else if (v === 'focus') D.focus[me] = c.id;
    else if (v === 'complete') { c.status = 'done'; Object.keys(D.focus).forEach((k) => { if (D.focus[k] === c.id) delete D.focus[k]; }); }
    render(); toast({ start: 'Started — now Working on this', pause: 'Paused', resume: 'Resumed', focus: 'You’re now working on this card', complete: 'Work Card completed · removed from load' }[v]);
  }
  function openResult(i) {
    const r = flatResults[i]; if (!r) return; S.overlay = null;
    if (r.k === 'task') { if (!SCHED_SCREENS.includes(S.screen) && S.screen !== 'mywork') S.screen = persona().schedule ? 'board' : 'mywork'; select('task', r.id); const t = task(r.id); if (S.screen === 'mywork') S.myProject = t.project; }
    else if (r.k === 'card') { select('card', r.id); if (S.screen === 'mywork') S.myProject = card(r.id).project; else if (!SCHED_SCREENS.includes(S.screen)) S.screen = persona().schedule ? 'board' : 'mywork'; }
    else if (r.k === 'project') { if (S.screen === 'mywork') S.myProject = r.id; else { S.screen = persona().schedule ? 'board' : 'mywork'; S.projFilter = persona().schedule ? r.id : null; if (!persona().schedule) S.myProject = r.id; } }
    else if (r.k === 'person') { S.screen = 'board'; S.view = 'board'; S.collapsed[r.id] = false; }
    render(); if (r.k === 'person') document.querySelector(`.lane[data-person="${r.id}"]`)?.scrollIntoView({ block: 'start' });
  }

  $app.addEventListener('change', (e) => {
    const id = e.target.id; const v = e.target.value;
    if (id === 'c-persona') { S.persona = v; resetSel(); S.myProject = null; S.menu = null; if (S.screen.startsWith('ph-') || (!persona().schedule && SCHED_SCREENS.includes(S.screen))) S.screen = persona().nav[0] === 'mywork' ? 'mywork' : S.screen; if (!persona().schedule && SCHED_SCREENS.includes(S.screen)) S.screen = 'mywork'; }
    else if (id === 'c-density') { S.density = v; lsSet('density', v); }
    else if (id === 'c-width') { S.width = v; lsSet('width', v); }
    else if (id === 'c-theme') { S.theme = v; lsSet('theme', v); }
    else if (id === 'c-sync') { S.sync = v; }
    else if (id === 'c-roll') { S.rollover = v; }
    else return;
    render();
  });
  $app.addEventListener('input', (e) => {
    if (e.target.id === 'q') { S.q = e.target.value; S.qSel = 0; document.getElementById('results').innerHTML = resultsHTML(); }
  });

  // drag & drop (pointer)
  let drag = null;
  $app.addEventListener('dragstart', (e) => {
    const p = e.target.closest('.proj, .row[data-type="task"]'); if (!p || !persona().schedule) return;
    drag = p.classList.contains('proj') ? { kind: 'project', id: p.dataset.id } : { kind: 'task', id: p.dataset.id };
    e.dataTransfer.setData('text/plain', drag.id); e.dataTransfer.effectAllowed = 'move';
  });
  $app.addEventListener('dragover', (e) => {
    if (!drag) return; const lane = e.target.closest('.lane[data-person]'); document.querySelectorAll('.lane.drop-target').forEach((l) => { if (l !== lane) l.classList.remove('drop-target'); });
    if (lane) { e.preventDefault(); lane.classList.add('drop-target'); }
  });
  $app.addEventListener('drop', (e) => {
    const lane = e.target.closest('.lane[data-person]'); if (!drag || !lane) return; e.preventDefault(); const d = drag; drag = null; doAssign(d.kind, d.id, lane.dataset.person);
  });
  $app.addEventListener('dragend', () => { drag = null; document.querySelectorAll('.lane.drop-target').forEach((l) => l.classList.remove('drop-target')); });

  // splitters
  $app.addEventListener('pointerdown', (e) => {
    const s = e.target.closest('.split'); if (!s) return; e.preventDefault(); const key = s.dataset.split; const startX = e.clientX; const start = S[key];
    const three = s.closest('.three'); s.setPointerCapture(e.pointerId);
    const mv = (ev) => { const dx = ev.clientX - startX; S[key] = Math.max(180, Math.min(520, start + (key === 'p1' ? dx : -dx))); three.style.setProperty('--' + key, S[key] + 'px'); };
    const up = () => { s.removeEventListener('pointermove', mv); s.removeEventListener('pointerup', up); lsSet(key, S[key]); };
    s.addEventListener('pointermove', mv); s.addEventListener('pointerup', up);
  });

  // keyboard
  const typing = (el) => el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA');
  document.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey; const k = e.key;
    if (mod && (k === 'k' || k === 'f')) { e.preventDefault(); S.overlay = 'search'; S.qSel = 0; return render(); }
    if (mod && k === 'b') { e.preventDefault(); S.navMin = !S.navMin; lsSet('navMin', S.navMin); return render(); }
    if (mod && k === 'n') { e.preventDefault(); return toast(persona().schedule && S.screen !== 'mywork' ? 'Add task dialog (Ctrl+N) — not part of this mockup' : persona().priv ? 'New private task — not part of this mockup' : 'Self-assignment is off for your account'); }
    if (mod && k === 'p') { e.preventDefault(); return toast('Export / print dialog — not part of this mockup'); }
    if (mod && k === 'e') { e.preventDefault(); return toast(persona().schedule ? 'Excel refresh started' : 'Excel refresh is for administrators'); }
    if (k === 'Escape') { if (closeTop()) e.preventDefault(); return; }
    if (S.menu) {
      const items = [...document.querySelectorAll('#assign-menu .item')]; if (!items.length) return;
      if (k === 'ArrowDown' || k === 'ArrowUp') { e.preventDefault(); S.menu.i = (S.menu.i + (k === 'ArrowDown' ? 1 : -1) + items.length) % items.length; items.forEach((x, i) => x.setAttribute('aria-selected', i === S.menu.i)); items[S.menu.i].focus(); }
      if (k === 'Enter') { e.preventDefault(); items[S.menu.i].click(); }
      return;
    }
    if (S.overlay === 'search') {
      if (k === 'ArrowDown' || k === 'ArrowUp') { e.preventDefault(); const n = flatResults.length; if (n) { S.qSel = (S.qSel + (k === 'ArrowDown' ? 1 : -1) + n) % n; document.getElementById('results').innerHTML = resultsHTML(); document.querySelector('.res[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }); } }
      if (k === 'Enter') { e.preventDefault(); openResult(S.qSel); }
      return;
    }
    const a = document.activeElement;
    if (k === '?' && !typing(a)) { e.preventDefault(); S.overlay = S.overlay === 'shortcuts' ? null : 'shortcuts'; return render(); }
    if (a && a.dataset && a.dataset.comment !== undefined && k === 'Enter' && !e.shiftKey) { e.preventDefault(); document.querySelector('[data-act="comment"]')?.click(); return; }
    if (a && a.getAttribute && a.getAttribute('role') === 'tab' && a.closest('.itabs')) {
      const tabs = [...a.parentElement.children]; let i = tabs.indexOf(a);
      if (k === 'ArrowRight') i = (i + 1) % tabs.length; else if (k === 'ArrowLeft') i = (i - 1 + tabs.length) % tabs.length; else if (k === 'Home') i = 0; else if (k === 'End') i = tabs.length - 1; else i = -1;
      if (i >= 0) { e.preventDefault(); S.itab = tabs[i].dataset.tab; S.__focusTab = tabs[i].dataset.fk; render(); document.querySelector(`[data-fk="${tabs[i].dataset.fk}"]`)?.focus(); } return;
    }
    if (a && a.classList && a.classList.contains('split')) {
      const key = a.dataset.split; const step = k === 'ArrowLeft' ? -16 : k === 'ArrowRight' ? 16 : 0; if (step) { e.preventDefault(); S[key] = Math.max(180, Math.min(520, S[key] + (key === 'p1' ? step : -step))); lsSet(key, S[key]); document.querySelector('.three')?.style.setProperty('--' + key, S[key] + 'px'); } return;
    }
    if (a && a.dataset && a.dataset.act === 'assign-open' && (k === 'Enter' || k === ' ')) { e.preventDefault(); return openAssign('project', a.dataset.id, a); }
    if ((k === 'ArrowDown' || k === 'ArrowUp') && !typing(a) && a && a.classList && a.classList.contains('row')) {
      const rows = [...document.querySelectorAll('.row[data-type]')]; const i = rows.indexOf(a); const n = rows[i + (k === 'ArrowDown' ? 1 : -1)];
      if (n) { e.preventDefault(); select(n.dataset.type, n.dataset.id); S.insOpen = window.innerWidth > 0 ? S.insOpen : false; render(); document.querySelector(`[data-fk="${n.dataset.type}-${n.dataset.id}"]`)?.focus(); }
      return;
    }
    if ((k === 'Enter' || k === ' ') && a && a.classList && a.classList.contains('row') && a.dataset.act === 'select') { e.preventDefault(); select(a.dataset.type, a.dataset.id); render(); document.querySelector(`[data-fk="${a.dataset.fk}"]`)?.focus(); }
  });

  // initial screen from hash (handy for screenshots): #drag, #week, #mywork ...
  const h = location.hash.replace('#', '');
  if (h) { if (h === 'week' || SCREENS.flatMap(([, i]) => i).some(([id]) => id === h)) setScreen(h); else render(); } else render();
})();
