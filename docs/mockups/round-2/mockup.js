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
    dot: '<circle cx="12" cy="12" r="5" fill="currentColor"/>',
    dots: '<circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/>',
    keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.5-7 8-7s8 3 8 7"/>',
  };
  const ic = (n, c = '') => `<svg class="ic ${c}" viewBox="0 0 24 24" aria-hidden="true">${P[n] || ''}</svg>`;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------------------------------------------------------------- state
  const PERSONAS = {
    morgan: { id: 'morgan', role: 'Partner · Scheduling admin', schedule: true, cards: true, priv: true, nav: ['portfolio', 'mywork', 'schedule', 'projects', 'office'] },
    riley: { id: 'riley', role: 'Senior staff · Scheduling admin', schedule: true, cards: true, priv: false, nav: ['team', 'mywork', 'schedule', 'projects', 'office'] },
    avery: { id: 'avery', role: 'Staff', schedule: false, cards: false, priv: false, nav: ['mywork', 'team', 'projects'] },
  };
  const NAVDEF = {
    portfolio: ['Portfolio', 'portfolio', 'team'], team: ['Team', 'users', 'team'], mywork: ['My Work', 'mywork', 'mywork'],
    schedule: ['Schedule', 'calendar', 'board'], projects: ['Projects', 'folder', 'ph-projects'], office: ['Office', 'office', 'ph-office'],
  };
  const SCHED_SCREENS = ['board', 'drag', 'search', 'rollover', 'shortcuts'];
  const lsGet = (k, d) => { try { return JSON.parse(localStorage.getItem('ss2-' + k)) ?? d; } catch { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem('ss2-' + k, JSON.stringify(v)); } catch { /* ignore */ } };

  const S = {
    screen: 'board', persona: 'morgan', density: lsGet('density', 'comfortable'), width: lsGet('width', 'fit'), theme: lsGet('theme', 'auto'),
    sync: 'synced', rollover: 'review', view: 'board', sel0: { type: 'task', id: 't1' }, mysel: { type: null, id: null }, itab: 'details',
    carryover: false, decisions: {}, projFilter: null, collapsed: {}, p1: lsGet('p1', 320), p3: lsGet('p3', 340),
    overlay: null, q: '', qSel: 0, popover: null, menu: null, toast: null, dragMode: 'pointer', insOpen: false, projOpen: false,
    expanded: {}, teamFilter: 'all', teamSort: 'name', wc: null, teamOpen: {}, teamSel: null, projTab: 'current', activeOnly: true, projSearch: '', projSearchOpen: false, railStaff: null, railProj: null,
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

  // Hours are not tracked (user confirmed). Some Work Cards carry planned hours as a guide for the assignee; show them only when set.
  const hoursText = (c) => (c.min ? `${fmtH(c.min / 60)} planned` : '');   // informational for the assignee; logged time is not shown
  // Status on Team / Portfolio (Partners and Senior staff only) comes straight from the Work Card Start / Pause flow and says
  // what each person is working on. It deliberately does NOT judge who is free: that is on hold (user, 2026-11-15).
  //   Working              the person's focus card is in progress
  //   Paused               nothing in progress, at least one paused card (only means that task isn't being worked on right now)
  //   Nothing in progress  everything else
  function availability(pid) {
    const paused = D.cards.filter((c) => c.assignees.includes(pid) && c.week === D.WEEK_OF && c.status === 'paused');
    const f = D.focus[pid] ? card(D.focus[pid]) : null;
    if (f && f.status === 'in_progress') return { key: 'working', label: 'Working', card: f, paused };
    if (paused.length) return { key: 'paused', label: 'Paused', card: null, paused };
    return { key: 'idle', label: 'Nothing in progress', card: null, paused };
  }
  const AV_ICON = { working: 'play', paused: 'pause', idle: 'minus' };
  const AV_TIP = {
    working: (a) => 'Working on ' + a.card.title,
    paused: () => 'A paused card only means that task is not being worked on right now',
    idle: () => 'No Work Card is started or paused',
  };
  function availChip(pid) {
    const a = availability(pid);
    return `<span class="avail ${a.key}" title="${esc(AV_TIP[a.key](a))}">${ic(AV_ICON[a.key], 'sm')}<span class="at">${esc(a.label)}</span></span>`;
  }
  // One line under a person's name on Team.
  function availNote(a) {
    if (a.key === 'working') return `Working on ${a.card.title} · ${project(a.card.project).name}`;
    if (a.key === 'paused') return `Paused: ${a.paused.map((c) => c.title).join(', ')}`;
    return '';
  }
  // Same wording as the V1.3.1 Staff Overview project rows ("No Task Cards" / "2 Tasks | 6h"), with Work Cards as the name.
  function cardSummary(cs) {
    if (!cs.length) return 'No Work Cards';
    const act = cs.filter((c) => c.status !== 'done'); if (!act.length) return 'All Work Cards done';
    const m = act.reduce((s, c) => s + (c.min || 0), 0);
    return `${act.length} Work ${act.length === 1 ? 'Card' : 'Cards'}${m ? ' · ' + fmtH(m / 60) + ' planned' : ''}`;
  }
  const prioChip = (p) => (p == null ? '<span class="chip p0">No priority</span>' : p === -1 ? `<span class="chip wait">${ic('hourglass', 'sm')}Waiting</span>` : `<span class="chip p${p}">${ic('flag', 'sm')}P${p}</span>`);
  // Compact V1.3-style badge for list rows: the number, W for Waiting, a dash for none. Always has a text name.
  const prioBadge = (p) => { const k = p == null ? 0 : p === -1 ? 'w' : p; const nm = p == null ? 'No priority' : p === -1 ? 'Waiting' : 'Priority ' + p; return `<span class="pbadge p${k}" title="${nm}">${p == null ? '–' : p === -1 ? 'W' : p}<span class="sr"> ${nm}</span></span>`; };
  const projName = (id) => project(id).display;
  const leadName = (t) => (t.lead ? person(t.lead).name : 'None');
  const partnerChip = (p) => `<span class="pchip" title="Partner: ${esc(p.partners.map((id) => person(id).name).join(', '))}">${esc(p.partners.map((id) => person(id).init).join('/'))}<span class="sr"> partner</span></span>`;
  const WDL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MOL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const longDate = (iso) => `${WDL[dt(iso).getDay()]}, ${MOL[dt(iso).getMonth()]} ${dt(iso).getDate()}, ${dt(iso).getFullYear()}`;
  const PST = { active: ['dot', 'Active', 'ok'], inactive: ['minus', 'Inactive', 'mut'] };
  const TS = { not_started: ['circle', 'Not started'], in_progress: ['circle-half', 'In progress'], done: ['circle-check', 'Done'] };
  const CS = { todo: ['square', 'To do'], in_progress: ['square-half', 'In progress'], paused: ['square-pause', 'Paused'], done: ['square-check', 'Done'] };
  const taskMk = (s) => `<span class="mk ${s}">${ic(TS[s][0])}${TS[s][1]}</span>`;
  const cardMk = (s) => `<span class="mk ${s}">${ic(CS[s][0])}${CS[s][1]}</span>`;
  const av = (id, sm) => { const p = person(id); return `<span class="av ${sm ? 'sm' : ''}" style="background-color:${p.color}" title="${esc(p.name)}" aria-label="${esc(p.name)}">${p.init}</span>`; };
  // Segmented control with a sliding thumb (--i is the active index, -1 = none).
  const seg = (label, items) => `<span class="seg-ctl" role="group" aria-label="${esc(label)}" style="--n:${items.length};--i:${items.findIndex((x) => x.on)}"><i class="thumb" aria-hidden="true"></i>${items.map((x) => `<button ${x.attrs} aria-pressed="${!!x.on}">${x.html}</button>`).join('')}</span>`;
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
    // Mirrors what the V1.3.1 Dashboard shows per assignment: completion checkbox, priority badge, the project as the
    // title, the scheduling note (italic "Note" placeholder when empty), due date, partner initials, lead, and an
    // on-demand Work cards disclosure. Status words and count icons are deliberately not shown in the row.
    const p = project(t.project); const selected = S.sel.type === 'task' && S.sel.id === t.id;
    const late = isLate(t); const nr = notReviewed(t); const dec = S.decisions[t.id]; const done = t.status === 'done';
    const drag = persona().schedule && !o.noDrag; const ed = canEdit(t);
    const cards = D.cards.filter((c) => c.project === t.project && c.week === D.WEEK_OF); const open = !!S.expanded[t.id];
    const primary = o.hideProject ? (t.title || 'No scheduling note') : p.display;
    const prioName = t.prio == null ? 'no priority' : t.prio === -1 ? 'Waiting' : 'priority ' + t.prio;
    const dueName = t.due ? (late ? 'Overdue, ' : 'Due ') + fmtDate(t.due) : 'No due date';
    return `<div class="row ${done ? 'done' : ''}" role="option" tabindex="0" aria-selected="${selected}" data-act="select" data-type="task" data-id="${t.id}" data-fk="task-${t.id}" ${drag ? 'draggable="true"' : ''} aria-label="${esc(`${primary}${o.hideProject ? '' : ', ' + (t.title || 'no note')}, ${prioName}${done ? ', done' : ''}`)}">
      ${drag ? `<span class="grip">${ic('grip', 'sm')}</span>` : ''}
      <div class="lead-col"><button class="chk" role="checkbox" aria-checked="${done}" data-act="toggle-done" data-id="${t.id}" data-fk="chk-${t.id}" aria-label="Mark ${esc(primary)} ${done ? 'not done' : 'done'}" ${ed ? '' : 'disabled title="Only the assignee or an administrator can change this."'}>${done ? ic('check', 'sm') : ''}</button>${prioBadge(t.prio)}</div>
      <div class="main"><div class="ttl" style="${dec === 'delete' ? 'text-decoration:line-through' : ''}">${esc(primary)}</div>${o.hideProject ? '' : `<div class="sub note ${t.title ? '' : 'ph'}">${esc(t.title || 'Note')}</div>`}
        <div class="meta-line"><button class="disc" data-act="wc-toggle" data-id="${t.id}" data-fk="disc-${t.id}" aria-expanded="${open}">${ic('chevron', 'sm')}Work cards <span class="n">${cards.length}</span></button>${nr ? `<span class="chip nr" title="Carried over and not yet reviewed">${ic('eye', 'sm')}Not Reviewed</span>` : ''}</div></div>
      <div class="rcol"><div class="r1"><span class="due ${late ? 'late' : ''} ${t.due ? '' : 'none'}" title="${esc(dueName)}">${ic(late ? 'alert' : 'calendar', 'sm')}${t.due ? esc(dayShort(t.due)) : ''}<span class="sr"> ${esc(dueName)}</span></span>${o.hideProject ? '' : partnerChip(p)}</div><div class="r2">Lead: ${esc(leadName(t))}</div></div>
      ${open ? `<div class="wc-list" role="group" aria-label="Work cards for ${esc(p.display)}">${cards.length ? cards.map((c) => cardRow(c, { hideProject: true })).join('') : '<div class="hint" style="padding:6px 10px">No Work Cards this week.</div>'}</div>` : ''}
      ${o.decide ? `<div class="decide"><span class="hint">Carryover decision:</span>${seg('Decision for ' + primary, [{ attrs: `data-act="decide" data-id="${t.id}" data-v="keep"`, on: dec === 'keep', html: ic('check', 'sm') + 'Keep' }, { attrs: `data-act="decide" data-id="${t.id}" data-v="delete"`, on: dec === 'delete', html: ic('trash', 'sm') + 'Delete' }])}${dec === 'delete' ? '<span class="hint">Will be removed when published</span>' : !dec ? '<span class="hint">Undecided stays Not Reviewed</span>' : ''}</div>` : ''}
    </div>`;
  }
  function cardRow(c, o = {}) {
    const p = project(c.project); const selected = S.sel.type === 'card' && S.sel.id === c.id; const mine = D.focus[S.persona] === c.id && c.status === 'in_progress';
    return `<div class="row card-row" role="option" tabindex="0" aria-selected="${selected}" data-act="select" data-type="card" data-id="${c.id}" data-fk="card-${c.id}" aria-label="${esc(`Work Card: ${c.title}, ${CS[c.status][1]}`)}">
      <div><span class="noun">${ic('stack', 'sm')}Work Card</span><br>${cardMk(c.status)}</div>
      <div class="main"><div class="ttl">${esc(c.title)}</div><div class="sub">${o.hideProject ? '' : esc(p.name) + ' · '}${c.start ? esc(dayShort(c.start)) + (c.end !== c.start ? '–' + esc(dayShort(c.end)) : '') : 'No dates'}</div></div>
      <div style="display:flex;gap:6px;align-items:center;justify-content:flex-end">${mine ? `<span class="chip badge-focus">${ic('play', 'sm')}Working on now</span>` : ''}<span class="avs">${c.assignees.map((a) => av(a, true)).join('')}</span></div>
      <div class="due">${hoursText(c) ? esc(hoursText(c)) : ''}</div>
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
      head = `<div class="insp-h">${closeBtn}<span class="noun">${ic('circle', 'sm')}Scheduled assignment</span><h2>${esc(proj.display)}</h2><p class="hint note-line">${esc(t.title || 'No scheduling note')}</p><div class="chips">${prioChip(t.prio)}${taskMk(t.status)}${notReviewed(t) ? `<span class="chip nr">${ic('eye', 'sm')}Not Reviewed</span>` : ''}</div></div>
        <div class="facts"><div class="fact"><span>Assigned to</span><b>${esc(person(t.person).name)}</b></div><div class="fact"><span>Partner</span><b>${esc(proj.partners.map((id) => person(id).name).join(', '))}</b></div><div class="fact"><span>Due</span><b>${esc(fmtDate(t.due))}</b></div><div class="fact"><span>Lead</span><b>${esc(leadName(t))}</b></div></div>`;
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
          ${persona().cards ? `<button class="btn sm" data-act="wc-add" data-project="${t.project}" data-person="${t.person}" ${wcLocked() ? 'disabled title="Locked during the weekly review"' : ''}>${ic('plus', 'sm')}Add Work Card</button>` : ''}
          <div style="margin-top:8px">${cards.length ? cards.map(cardBox).join('') : '<p class="hint">No Work Cards for this project this week.</p>'}</div>`;
      } else if (S.itab === 'talk') {
        body = `<h3>Comments</h3>${t.comments.length ? t.comments.map((m) => `<div class="cm"><b>${esc(person(m.who).name)} · ${esc(m.at)}</b>${esc(m.text)}</div>`).join('') : '<p class="hint" style="margin:0">No comments yet.</p>'}
          <div class="cm-in"><input aria-label="Add a comment" placeholder="Add a comment…" data-fk="comment-${t.id}" data-comment="${t.id}"><button class="btn sm primary" data-act="comment" data-id="${t.id}">Send</button></div><p class="hint">Enter sends · Shift+Enter adds a line</p>`;
      } else {
        body = `<h3>Task activity</h3>${(D.activity[t.id] || [{ at: 'Mon 8:00 AM', text: 'Created' }]).map((a) => `<div class="cm"><b>${esc(a.at)}</b>${esc(a.text)}</div>`).join('')}`;
      }
    } else {
      const tabDef = [['details', 'Details'], ['project', 'Project context']];
      tabs = tabDef;
      const mine = c.assignees.includes(S.persona); const focusNow = D.focus[S.persona] === c.id && c.status === 'in_progress';
      head = `<div class="insp-h">${closeBtn}<span class="noun">${ic('stack', 'sm')}Work Card · shared project work</span><h2>${esc(c.title)}</h2><div class="chips">${cardMk(c.status)}${focusNow ? `<span class="chip badge-focus">${ic('play', 'sm')}Working on now</span>` : ''}</div></div>
        <div class="facts"><div class="fact"><span>Project</span><b>${esc(proj.name)}</b></div><div class="fact"><span>Week of</span><b>Nov 9</b></div><div class="fact"><span>Dates</span><b>${c.start ? esc(dayShort(c.start)) + (c.end !== c.start ? ' – ' + esc(dayShort(c.end)) : '') : 'Not dated'}</b></div><div class="fact"><span>Planned hours</span><b>${c.min ? esc(fmtH(c.min / 60)) : 'Not set'}</b></div></div>`;
      if (S.itab === 'project') {
        const ts = D.tasks.filter((x) => x.project === c.project && x.status !== 'done');
        body = `<h3>Scheduled assignments on ${esc(proj.name)}</h3>${ts.length ? ts.map((x) => `<div class="ai"><span>${esc(person(x.person).name.split(' ')[0])}: ${esc(x.title)}</span><span style="margin-left:auto">${prioChip(x.prio)}</span></div>`).join('') : '<p class="hint">None open.</p>'}
          <div class="note-box">Assignments are office planning work. This Work Card is a separate shared record.</div>`;
      } else {
        body = `<h3>Description</h3><p style="margin:0">${esc(c.desc || 'No description.')}</p>${c.min ? '<p class="hint" style="margin-top:6px">Planned hours are a guide for the assignee. Hours aren’t tracked.</p>' : ''}<h3>Assigned</h3><div style="display:flex;gap:8px;flex-wrap:wrap">${c.assignees.map((a) => `<span style="display:inline-flex;gap:6px;align-items:center">${av(a)}${esc(person(a).name)}</span>`).join('')}</div>
          <h3>Project lead</h3><p style="margin:0">${esc(projLead(c.project) ? projLead(c.project).name : 'None')}</p>
          <h3>Your focus</h3>${mine ? cardActions(c) : '<p class="hint" style="margin:0">You’re not assigned to this card. Your “Working on now” choice is personal and never changes anyone else’s.</p>'}
          ${persona().cards ? `<h3>Manage</h3><div style="display:flex;gap:6px"><button class="btn sm" data-act="wc-edit" data-id="${c.id}" ${wcLocked() ? 'disabled title="Locked during the weekly review"' : ''}>Edit…</button></div>` : '<p class="hint">Only Partners and Senior staff create, edit, assign or delete Work Cards. Only the assignee starts, pauses or completes one.</p>'}`;
      }
    }
    const tabHtml = tabs.map(([id, label]) => `<button role="tab" id="itab-${id}" aria-selected="${S.itab === id}" tabindex="${S.itab === id ? 0 : -1}" data-act="itab" data-tab="${id}" data-fk="itab-${id}">${label}</button>`).join('');
    return `<div class="insp">${head}<div class="itabs" role="tablist" aria-label="Details sections">${tabHtml}</div><div class="ibody" role="tabpanel" data-scroll="insp" tabindex="0">${body}</div></div>`;
  }
  function cardActions(c) {
    const f = D.focus[S.persona] === c.id && c.status === 'in_progress';
    if (c.status === 'done') return '<p class="hint" style="margin:0">Completed.</p>';
    const b = [];
    if (c.status === 'todo') b.push(`<button class="btn sm primary" data-act="card-act" data-id="${c.id}" data-v="start">${ic('play', 'sm')}Start · Work on this</button>`);
    if (c.status === 'in_progress') { if (!f) b.push(`<button class="btn sm" data-act="card-act" data-id="${c.id}" data-v="focus">${ic('play', 'sm')}Work on this</button>`); b.push(`<button class="btn sm" data-act="card-act" data-id="${c.id}" data-v="pause">${ic('pause', 'sm')}Pause</button>`); }
    if (c.status === 'paused') b.push(`<button class="btn sm primary" data-act="card-act" data-id="${c.id}" data-v="resume">${ic('play', 'sm')}Resume</button>`);
    if (c.status === 'in_progress' || c.status === 'paused') { b.push(`<button class="btn sm" data-act="card-act" data-id="${c.id}" data-v="complete">${ic('square-check', 'sm')}Complete</button>`); b.push(`<button class="btn sm" data-act="card-act" data-id="${c.id}" data-v="stop" title="Stop and return to To do">Stop</button>`); }
    return `<div style="display:flex;gap:6px;flex-wrap:wrap">${b.join('')}</div><p class="hint">Starting a card shows you as working on it; pausing it shows the task is not being worked on right now. Partners and Senior staff use this to see what each person is working on. Only the assignee starts, pauses or completes their own card. It never means other assignees are working on the same card.</p>`;
  }
  const cardBox = (c) => wcBox(c, S.persona, { actions: true });

  // ---------------------------------------------------------------- schedule
  // Jump rail (the V1.3.1 Dashboard has one for staff initials and one for project letters).
  const railHTML = (label, items, active, scope) => {
    const act = active || (items[0] && items[0].key);
    return `<nav class="rail" aria-label="${esc(label)}">${items.map((it, i) => `${i ? '<i aria-hidden="true"></i>' : ''}<button data-act="rail" data-scope="${scope}" data-key="${esc(it.key)}" data-fk="rail-${scope}-${esc(it.key)}" ${act === it.key ? 'aria-current="true"' : ''} title="${esc(it.title)}" aria-label="${esc(it.title)}">${esc(it.label)}</button>`).join('')}</nav>`;
  };
  const projLetter = (p) => { const c = p.display.charAt(0).toUpperCase(); return /[A-Z]/.test(c) ? c : '#'; };
  function visibleProjects() {
    const q = S.projSearch.trim().toLowerCase();
    return D.projects.filter((p) => p.category === S.projTab && (!S.activeOnly || p.status === 'active')
      && (!q || p.display.toLowerCase().includes(q) || (p.note || '').toLowerCase().includes(q) || p.partners.some((id) => person(id).init.toLowerCase() === q)))
      .sort((a, b) => a.display.localeCompare(b.display, undefined, { numeric: true }));
  }
  function projectsPane() {
    // Matches the V1.3.1 Projects panel: title + New Project / Import, Current | Future tabs, search, Active only,
    // rows of "Client | Project" + partner chips + note + status + task count, and an A-Z jump rail.
    const list = visibleProjects(); const sch = persona().schedule;
    const letters = [...new Set(list.map(projLetter))].sort((a, b) => (a === '#' ? -1 : b === '#' ? 1 : a.localeCompare(b)));
    const rows = list.map((p) => {
      const open = D.tasks.filter((t) => t.project === p.id && t.status !== 'done').length; const st = PST[p.status];
      return `<button class="proj" data-letter="${projLetter(p)}" draggable="${sch}" data-act="proj" data-id="${p.id}" data-fk="proj-${p.id}" aria-pressed="${S.projFilter === p.id}" title="${sch ? 'Drag onto a person to assign, or press Enter on “Assign…”' : ''}">
        <span class="pn"><b>${esc(p.display)}</b></span><span class="pchips">${partnerChip(p)}</span>
        <span class="pnote ${p.note ? '' : 'ph'}">${esc(p.note || 'Note')}</span>
        <span class="pmeta"><span class="pst ${st[2]}">${ic(st[0], 'sm')}${st[1]}</span><span>${open} ${open === 1 ? 'task' : 'tasks'}</span></span>
        ${sch ? `<span class="btn sm assign" data-act="assign-open" data-id="${p.id}" role="button" tabindex="0" aria-label="Assign ${esc(p.display)} to…" title="Assign to… (keyboard alternative to dragging)" data-fk="assign-${p.id}">${ic('users', 'sm')}</span>` : ''}</button>`;
    }).join('');
    const closeNarrow = `<span class="only-narrow ${S.view === 'week' && S.screen !== 'mywork' ? 'always' : ''}"><button class="btn sm" data-act="close-proj">${ic('x', 'sm')}Close</button></span>`;
    return `<div class="pp"><div class="pp-head"><h2>Projects</h2>${sch ? `<button class="btn primary sm" data-act="toast" data-msg="New project dialog (not part of this mockup)">${ic('plus', 'sm')}New Project</button><button class="btn sm" data-act="toast" data-msg="Import / refresh from the Excel catalogue (Ctrl+E)">${ic('sync', 'sm')}Import</button>` : ''}${closeNarrow}</div>
      <div class="pp-tools"><div class="pp-tabs" role="tablist" aria-label="Project list">${[['current', 'Current'], ['future', 'Future']].map(([id, l]) => `<button role="tab" aria-selected="${S.projTab === id}" data-act="proj-tab" data-v="${id}" data-fk="ptab-${id}">${l}</button>`).join('')}</div>
        <button class="btn sm icon" data-act="proj-search" aria-pressed="${S.projSearchOpen}" aria-label="Search projects" data-fk="proj-search">${ic('search', 'sm')}</button>
        <button class="tool-chk" role="checkbox" aria-checked="${S.activeOnly}" data-act="active-only" data-fk="active-only"><span class="chk" aria-hidden="true">${S.activeOnly ? ic('check', 'sm') : ''}</span>Active only</button></div>
      ${S.projSearchOpen ? `<div class="pp-search"><input id="ps" data-fk="ps" value="${esc(S.projSearch)}" placeholder="Search projects, notes, partner initials" aria-label="Search projects" autocomplete="off"></div>` : ''}
      <div class="pp-body"><div class="pp-list" data-scroll="projlist">${rows || '<div class="empty">No projects match.</div>'}</div>${railHTML('Jump to letter', letters.map((l) => ({ key: l, label: l, title: `Projects starting with ${l}` })), S.railProj, 'proj')}</div></div>`;
  }
  function laneTasks(p) {
    let ts = D.tasks.filter((t) => t.person === p.id);
    if (S.projFilter) ts = ts.filter((t) => t.project === S.projFilter);
    if (S.carryover) ts = ts.filter((t) => t.carry);
    return ts.slice().sort((a, b) => (a.status === 'done') - (b.status === 'done'));   // open first; done stay visible, checked
  }
  const laneVisible = (p) => !(S.carryover || S.projFilter) || laneTasks(p).length > 0;
  function laneHTML(p) {
    const ts = laneTasks(p); if (!laneVisible(p)) return '';
    const open = openTasks(p.id);
    const p1 = open.filter((t) => t.prio === 1).length; const wt = open.filter((t) => t.prio === -1).length; const od = open.filter(isLate).length;
    const pto = D.pto[p.id]; const col = S.collapsed[p.id];
    const meta = [p1 ? `<span>${ic('flag', 'sm')} ${p1} P1</span>` : '', wt ? `<span>${ic('hourglass', 'sm')} ${wt} Waiting</span>` : '', od ? `<span style="color:var(--bad);font-weight:600">${ic('alert', 'sm')} ${od} overdue</span>` : ''].join('');
    return `<section class="lane" data-person="${p.id}" aria-label="${esc(p.name)}">
      <div class="lane-h"><button class="btn sm" data-act="lane" data-id="${p.id}" aria-expanded="${!col}" aria-label="${col ? 'Expand' : 'Collapse'} ${esc(p.name)}" data-fk="lane-${p.id}"><span style="display:inline-block;transform:rotate(${col ? 0 : 90}deg)">${ic('chevron', 'sm')}</span></button>
        <div class="lh-who">${av(p.id)}<div><div class="nm">${esc(p.name)}<span class="count-badge">${open.length} ${open.length === 1 ? 'task' : 'tasks'}</span></div><div class="hint">${esc(p.role)}</div></div>${pto ? `<span class="chip pto">${ic('calendar', 'sm')}PTO ${esc(WD[dt(pto[0]).getDay()])}–${esc(WD[dt(pto[pto.length - 1]).getDay()])}</span>` : ''}</div>
        <div class="lh-right"><button class="btn sm icon" data-act="more-open" data-id="${p.id}" aria-haspopup="menu" aria-label="More actions for ${esc(p.name)}" data-fk="more-${p.id}">${ic('dots', 'sm')}</button></div>
        ${meta ? `<div class="meta">${meta}</div>` : ''}</div>
      <div class="drop-hint">${ic('plus', 'sm')} Drop to assign to ${esc(p.name)}</div>
      ${col ? '' : `<div role="listbox" aria-label="${esc(p.name)} assignments">${ts.length ? ts.map((t) => taskRow(t, { decide: S.carryover })).join('') : '<div class="empty" style="padding:12px">No assignments.</div>'}</div>`}</section>`;
  }
  function boardHTML() {
    const html = lanes().map(laneHTML).join('');
    return html || '<div class="empty">Nothing matches the current filters.</div>';
  }
  function boardPane() {
    // The V1.3.1 "All tasks" panel: title, today's date with the scheduled-task count, Add Task, grouped by person,
    // with a jump rail of staff initials.
    const open = D.tasks.filter((t) => t.status !== 'done').length;
    const items = lanes().filter(laneVisible).map((p) => ({ key: p.id, label: p.init, title: p.name }));
    return `<div class="pane board-pane" id="main-pane"><div class="bp-head"><div><h2>All tasks</h2><p class="hint">${esc(longDate(D.TODAY))} — ${open} tasks scheduled</p></div><button class="btn primary" data-act="toast" data-msg="Add task dialog (Ctrl+N) — not part of this mockup">${ic('plus', 'sm')}Add Task <kbd>Ctrl N</kbd></button></div>
      <div class="bp-body"><div class="scroller" data-scroll="main">${boardHTML()}</div>${railHTML('Jump to person', items, S.railStaff, 'staff')}</div></div>`;
  }
  // A flag = one scheduled assignment on its due day (Week view). Shows the priority badge and the project's short name.
  function flagHTML(t, style) {
    const p = project(t.project); const sel = S.sel.type === 'task' && S.sel.id === t.id; const label = t.title || p.name;
    const prioName = t.prio == null ? 'no priority' : t.prio === -1 ? 'Waiting' : 'priority ' + t.prio;
    return `<button class="flag ${isLate(t) ? 'late' : ''}" style="${style}" data-act="select" data-type="task" data-id="${t.id}" data-fk="task-${t.id}" aria-pressed="${sel}" aria-label="${esc(`${p.display}, ${label}, ${t.due ? 'due ' + fmtDate(t.due) : 'no due date'}, ${prioName}`)}" title="${esc(`${p.display} · ${label} · ${t.due ? 'due ' + fmtDate(t.due) : 'no due date'}`)}">${prioBadge(t.prio)}<span class="ft">${esc(label)}</span></button>`;
  }
  function weekHTML() {
    const head = `<div class="wk-head"><div>Person · weekly load</div>${D.DAYS.map((d) => `<div class="${d === D.TODAY ? 'today' : ''}">${dayShort(d)}${d === D.TODAY ? ' · Today' : ''}</div>`).join('')}<div>Weekend</div></div>`;
    const rows = lanes().map((p) => {
      const open = openTasks(p.id); const pto = D.pto[p.id] || [];
      const days = D.DAYS.map((d) => {
        const isPto = pto.includes(d);
        return `<div class="wk-day ${d === D.TODAY ? 'today' : ''} ${isPto ? 'pto' : ''}" style="grid-column:${D.DAYS.indexOf(d) + 1}">${isPto ? 'PTO' : ''}</div>`;
      }).join('') + '<div class="wk-day" style="grid-column:6"></div>';
      const spans = D.cards.filter((c) => c.assignees.includes(p.id) && (c.start || c.end)).map((c) => {
        const s = D.DAYS.indexOf(c.start || c.end); const e = D.DAYS.indexOf(c.end || c.start);
        const sel = S.sel.type === 'card' && S.sel.id === c.id; const wide = e - s >= 1;
        return `<button class="span ${c.status}" style="grid-column:${s + 1} / ${e + 2}" data-act="select" data-type="card" data-id="${c.id}" data-fk="card-${c.id}" aria-pressed="${sel}" aria-label="${esc(`Work Card ${c.title}, ${CS[c.status][1]}`)}">${ic(CS[c.status][0], 'sm')}<span class="t">${esc(c.title)}</span>${wide ? `<span class="mut">· ${CS[c.status][1]}</span>` : ''}</button>`;
      }).join('');
      const flags = D.tasks.filter((t) => t.person === p.id && t.status !== 'done' && t.due && (!S.projFilter || t.project === S.projFilter)).map((t) => {
        const di = D.DAYS.indexOf(t.due); const col = di >= 0 ? di + 1 : (t.due > D.DAYS[4] ? 6 : 1);
        return flagHTML(t, `grid-column:${col}`);
      }).join('');
      return `<div class="wk-row"><div class="wk-who"><div class="nm">${av(p.id)}${esc(p.name)}</div><span class="count-badge" style="margin-left:0;justify-self:start">${open.length} ${open.length === 1 ? 'task' : 'tasks'}</span></div><div class="wk-cells" role="group" aria-label="${esc(p.name)} week">${days}${spans}${flags}</div></div>`;
    }).join('');
    const undated = D.cards.filter((c) => !c.start && !c.end && c.status !== 'done');
    const noDue = D.tasks.filter((t) => t.status !== 'done' && !t.due && (!S.projFilter || t.project === S.projFilter));
    const noDueTray = `<div class="tray"><h3>No due date · ${noDue.length} assignments</h3>${noDue.map((t) => flagHTML(t, 'display:inline-flex;margin:2px 4px 2px 0')).join('') || '<span class="hint">Every open assignment has a due date.</span>'}</div>`;
    return `<div class="week">${head}${rows}<div class="tray"><h3>Needs dates · ${undated.length} Work Cards</h3>${undated.map((c) => `<button class="span ${c.status}" data-act="select" data-type="card" data-id="${c.id}" data-fk="card-${c.id}">${ic(CS[c.status][0], 'sm')}<span class="t">${esc(c.title)}</span><span class="mut">· ${esc(c.assignees.map((a) => person(a).name.split(' ')[0]).join(', '))}</span></button>`).join('')}</div>
      ${noDueTray}
      <div class="legend"><span>${ic('stack', 'sm')} Span = Work Card (start → end)</span><span>${ic('flag', 'sm')} Flag = scheduled assignment on its due day</span><span>Badge: number = priority, W = Waiting, – = none</span></div></div>`;
  }
  function scheduleScreen() {
    if (!persona().schedule) return `<div class="empty"><p>${ic('lock', 'lg')}</p><h2>Schedule isn’t available to Staff</h2><p>This workspace is hidden from navigation for this role, and every action is still checked by the main-process API.</p><button class="btn" data-act="persona" data-id="morgan">View as Morgan Ellis (Partner)</button></div>`;
    const cc = carryTasks().length; const nr = carryTasks().filter(notReviewed).length;
    const rolloverActive = S.rollover === 'review';
    const actions = `<div class="actions">
      <button class="btn" data-act="toast" data-msg="Bulk Actions: update selected tasks">Bulk Actions</button>
      ${cc ? `<button class="btn" data-act="carryover" aria-pressed="${S.carryover}" title="Review carried-over tasks">${ic('sync', 'sm')}Carryover <b>${cc}</b></button>` : ''}
      ${rolloverActive ? `<button class="btn primary" data-act="publish" title="${nr ? `${nr} tasks will remain Not Reviewed` : 'Publish scheduling changes to MyTasks'}">${ic('send', 'sm')}Publish Changes</button>` : ''}
      <button class="btn" data-act="toast" data-msg="Export / print (Ctrl+P)">${ic('print', 'sm')}Print <kbd>Ctrl P</kbd></button></div>`;
    const bar = `<div class="ws-bar">${seg('Schedule view', [{ attrs: 'data-act="view" data-v="board"', on: S.view === 'board', html: ic('users', 'sm') + 'Board' }, { attrs: 'data-act="view" data-v="week"', on: S.view === 'week', html: ic('calendar', 'sm') + 'Week' }])}
      <button class="btn only-narrow ${S.view === 'week' ? 'always' : ''}" data-act="open-proj">${ic('folder', 'sm')}Projects</button>
      ${S.projFilter ? `<button class="fchip" aria-pressed="true" data-act="proj-clear">${esc(project(S.projFilter).name)} ${ic('x', 'sm')}<span class="sr">Clear project filter</span></button>` : ''}
      ${S.carryover ? `<span class="chip nr">${ic('eye', 'sm')}Carryover review · ${nr} Not Reviewed</span>` : ''}
      <span class="week-label">Week of Mon, Nov 9 – Fri, Nov 13, 2026 · Today Tue 10</span></div>`;
    const banner = syncBanner();
    const mid = S.view === 'week' ? `<div class="pane" data-scroll="main" id="main-pane">${weekHTML()}</div>` : boardPane();
    const dragMenu = '';
    return `<div class="ws-head"><div><h1>Schedule</h1><p>Plan the week: people, load and projects together.</p></div><div class="grow"></div>${actions}</div>${bar}${banner}
      ${threePane(projectsPane(), mid, inspector(), S.view === 'week' ? 'week' : 'board')}${dragMenu}`;
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
  // V1.3.1 My Week banner: "Working on: X [Pause] [Complete]", "Paused: X [Resume] [Complete]" or "Nothing in progress".
  // This is the status Partners and Senior staff see on Team / Portfolio.
  function focusBarHTML(me) {
    const fc = D.focus[me] ? card(D.focus[me]) : null; const lane = !!person(me).lane;
    const act = (v, icon, label, cls = '') => `<button class="btn sm ${cls}" data-act="card-act" data-id="${fc.id}" data-v="${v}">${ic(icon, 'sm')}${label}</button>`;
    const open = fc ? `<button class="btn sm" data-act="select" data-type="card" data-id="${fc.id}">Open</button>` : '';
    if (fc && fc.status === 'in_progress') return `<div class="focusbar"><span class="chip badge-focus">${ic('play', 'sm')}Working on now</span><div class="grow"><b>${esc(fc.title)}</b><div class="hint">${esc(project(fc.project).display)}${hoursText(fc) ? ' · ' + esc(hoursText(fc)) : ''}</div></div>${act('pause', 'pause', 'Pause')}${act('complete', 'square-check', 'Complete')}${open}</div>`;
    if (fc && fc.status === 'paused') return `<div class="focusbar paused"><span class="chip">${ic('pause', 'sm')}Paused</span><div class="grow"><b>${esc(fc.title)}</b><div class="hint">${esc(project(fc.project).display)} · not being worked on right now</div></div>${act('resume', 'play', 'Resume', 'primary')}${act('complete', 'square-check', 'Complete')}${open}</div>`;
    if (!lane) return '';
    return `<div class="focusbar idle"><div class="grow"><b>Nothing in progress</b><div class="hint">Start a Work Card to show what you’re working on.</div></div></div>`;
  }
  function myWorkScreen() {
    const me = S.persona; const list = myProjects();
    if (!S.myProject || (S.myProject !== 'private' && !list.find((x) => x.id === S.myProject))) S.myProject = list[0]?.id || (persona().priv ? 'private' : null);
    const openAll = D.tasks.filter((t) => t.person === me && t.status !== 'done');
    const dueWeek = openAll.filter((t) => t.due <= D.DAYS[4]); const waiting = openAll.filter((t) => t.prio === -1);
    const left = `<div class="pane-title"><span>My projects</span><span>${list.length}</span></div>${list.map((x) => {
      const p = project(x.id); return `<button class="proj" style="cursor:pointer" data-act="my-project" data-id="${x.id}" data-fk="myp-${x.id}" aria-pressed="${S.myProject === x.id}"><b>${esc(p.display)}</b><small>${x.a} ${x.a === 1 ? 'assignment' : 'assignments'} · ${x.c} ${x.c === 1 ? 'Work Card' : 'Work Cards'}</small></button>`; }).join('') || '<div class="empty">No assigned work this week.</div>'}
      ${persona().priv ? `<div class="proj-sec">Only you</div><button class="proj" style="cursor:pointer" data-act="my-project" data-id="private" data-fk="myp-private" aria-pressed="${S.myProject === 'private'}"><b>${ic('lock', 'sm')} Private</b><small>${D.privateTasks.length} private tasks · never synced</small></button>` : ''}`;
    let main;
    const focusBar = focusBarHTML(me);
    if (S.myView === 'week') {
      main = `${focusBar}<div class="mw-sec"><h2>My Week</h2><span class="noun">${ic('stack', 'sm')}Work Cards by day · ${ic('flag', 'sm')} assignments due</span></div><div style="overflow:auto">${weekForOne(me)}</div>`;
    } else if (S.myProject === 'private') {
      main = `${focusBar}<div class="mw-sec"><h2>${ic('lock')} Private</h2><span class="chip private">${ic('lock', 'sm')}Only you</span><span class="hint">Stored on this computer. Never sent to the shared drive and never visible to anyone else.</span></div><div role="listbox" aria-label="Private tasks">${D.privateTasks.map((p) => `<div class="row mw priv" role="option" tabindex="0" aria-selected="false" data-fk="priv-${p.id}"><div><span class="noun">${ic('lock', 'sm')}Private task</span></div><div class="main"><div class="ttl">${esc(p.title)}</div><div class="sub">Only you</div></div><div></div><div class="due">${p.due ? esc(fmtDate(p.due)) : 'No date'}</div></div>`).join('')}</div>`;
    } else if (S.myProject) {
      const p = project(S.myProject);
      let ts = D.tasks.filter((t) => t.person === me && t.project === p.id);
      const fl = S.myFilter; ts = ts.filter((t) => (fl === 'open' ? t.status !== 'done' : fl === 'week' ? t.status !== 'done' && t.due <= D.DAYS[4] : t.prio === -1 && t.status !== 'done'));
      const cards = D.cards.filter((c) => c.project === p.id && c.week === D.WEEK_OF);
      main = `${focusBar}<div class="mw-sec"><h2>${esc(p.display)}</h2>${partnerChip(p)}<span style="margin-left:auto;display:flex;gap:6px"><button class="btn sm" data-act="toast" data-msg="Opens the project folder in Explorer">${ic('folder', 'sm')}Folder</button><button class="btn sm" data-act="toast" data-msg="Project info: notes, activity, people">${ic('info', 'sm')}Project info</button></span></div>
        <div class="mw-sec"><h2>My assignments</h2><span class="noun">${ic('circle', 'sm')}Scheduled by the office</span></div>
        <div role="listbox" aria-label="My assignments">${ts.length ? ts.map((t) => taskRow(t, { hideProject: true, noDrag: true })).join('') : '<div class="empty" style="padding:14px">No assignments match this filter.</div>'}</div>
        <div class="mw-sec"><h2>Project Work Cards</h2><span class="noun">${ic('stack', 'sm')}Shared · week of Nov 9</span></div>
        <div role="listbox" aria-label="Project Work Cards">${cards.length ? cards.map((c) => cardRow(c, { hideProject: true })).join('') : '<div class="empty" style="padding:14px">No Work Cards this week.</div>'}</div>
        <p class="hint" style="padding:10px 14px">Filters apply to your assignments only. Work Cards are shared with everyone assigned to this project.</p>`;
    } else main = '<div class="empty">No assigned work this week.</div>';
    const actions = `<div class="actions">${persona().priv ? `<button class="btn primary" data-act="toast" data-msg="New private task (Ctrl+N) — not part of this mockup">${ic('plus', 'sm')}New private task <kbd>Ctrl N</kbd></button>` : ''}</div>`;
    const bar = `<div class="ws-bar">${seg('My Work view', [{ attrs: 'data-act="my-view" data-v="list"', on: S.myView === 'list', html: ic('list', 'sm') + 'List' }, { attrs: 'data-act="my-view" data-v="week"', on: S.myView === 'week', html: ic('calendar', 'sm') + 'My Week' }])}
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
        <div class="tile"><h3>${ic('circle')} Scheduled assignment</h3><div><div role="listbox" style="border:1px solid var(--line)">${taskRow(t, { noDrag: true })}</div><p class="hint">Office planning work tied to a person, project and due date. As in V1.3.1: completion checkbox, priority badge, project as the title, scheduling note, due date, partner initials, lead, and a Work cards disclosure. Status words live in the inspector. No hours.</p></div></div>
        <div class="tile"><h3>${ic('stack')} Work Card</h3><div><div role="listbox" style="border:1px solid var(--line)">${cardRow(c)}</div><p class="hint">Shared project work for a project and week. Square marker, “Work Card” label, indented accent edge, dates, one or more assignees. Planned time is optional.</p></div></div>
        <div class="tile"><h3>${ic('list')} Action Item</h3><div><div class="ai"><button class="btn sm" role="checkbox" aria-checked="false" aria-label="Incorporate client markups">${ic('minus', 'sm')}</button><span>Incorporate client markups</span><span class="noun" style="margin-left:auto">Action Item</span></div><p class="hint">A step inside one assignment. Only appears in the assignment’s Details. Never a Work Card.</p></div></div>
        <div class="tile"><h3>${ic('lock')} Private task <span class="chip private" style="margin-left:auto">Partner only</span></h3><div><div class="row mw priv" style="grid-template-columns:110px 1fr auto"><div><span class="noun">${ic('lock', 'sm')}Private task</span></div><div class="main"><div class="ttl">Review partner meeting agenda</div><div class="sub">Only you · never synced</div></div><div class="due">Wed, Nov 11</div></div><p class="hint">Local-only; shown in My Work for Partners (baseline §2). Not shown to other roles.</p></div></div>
      </div>
      <h2>Status vocabulary — icon shape + word, colour only reinforces</h2>
      <div class="grid2">
        <div class="tile"><h3>Assignment status (inspector)</h3><div class="states">${['not_started', 'in_progress', 'done'].map((s) => `<div>${taskMk(s)}<span class="hint">${{ not_started: 'Nothing started yet', in_progress: 'Being worked', done: 'Completed' }[s]}</span></div>`).join('')}</div></div>
        <div class="tile"><h3>Priority (separate from status)</h3><div class="states"><div>${prioChip(1)}${prioChip(2)}${prioChip(3)}${prioChip(4)}</div><div>${[1, 2, 3, 4, -1, null].map(prioBadge).join('')}<span class="hint">Row badges, as in V1.3: number, W = Waiting, – = none</span></div><div>${prioChip(-1)}<span class="hint">Waiting is a priority label, not a status</span></div><div><span class="chip p3">${ic('flag', 'sm')}Rush</span><span class="hint">Custom priorities use the same chip with their own label</span></div></div></div>
        <div class="tile"><h3>Carryover state</h3><div class="states"><div><span class="chip nr">${ic('eye', 'sm')}Not Reviewed</span><span class="hint">Carried over and awaiting a Keep / Delete decision</span></div></div></div>
        <div class="tile"><h3>Work Card status</h3><div class="states">${['todo', 'in_progress', 'paused', 'done'].map((s) => `<div>${cardMk(s)}<span class="hint">${{ todo: 'Not begun', in_progress: 'Active', paused: 'Set aside', done: 'Complete' }[s]}</span></div>`).join('')}<div><span class="chip badge-focus">${ic('play', 'sm')}Working on now</span><span class="hint">Started by this person; Partners and Senior staff see what each person is working on</span></div></div></div>
      </div>
      <h2>How to tell them apart without colour</h2>
      <table><tr><th></th><th>Assignment</th><th>Work Card</th><th>Action Item</th><th>Private task</th></tr>
      <tr><td>Marker</td><td>Checkbox + priority badge</td><td>Square</td><td>Checkbox</td><td>Lock</td></tr>
      <tr><td>Label</td><td>Priority badge; project as title; status word in inspector</td><td>“Work Card” + status word</td><td>“Action Item”</td><td>“Private task · Only you”</td></tr>
      <tr><td>Lives in</td><td>Schedule lane, My assignments</td><td>Project Work Cards section, Week spans</td><td>Inside an assignment’s Details</td><td>My Work › Private</td></tr>
      <tr><td>Hours</td><td>None</td><td>Optional planned time</td><td>None</td><td>None</td></tr>
      <tr><td>Who edits</td><td>Assignee or administrator</td><td>Partners / Senior staff (focus is personal)</td><td>Follows parent assignment</td><td>Owner</td></tr></table></div>`;
  }
  function syncSpec() {
    return `<div class="spec" data-scroll="spec"><h2>Sync and connection states</h2><p class="hint">The title-bar status is always visible; clicking it opens this detail. Offline and error states also add a banner above the workspace. Use the “Sync state” selector above to switch the live window.</p>
      <div class="grid2">${Object.entries(SYNC).map(([k, s]) => `<div class="tile"><h3>${ic(s.icon)} ${esc(s.title)}</h3><div><p style="margin:0 0 6px"><b>Title bar:</b> <span class="tb-btn ${s.cls}" style="height:auto;padding:2px 8px">${ic(s.icon, 'sm')}${esc(s.text)}</span></p><p style="margin:0 0 6px">${esc(s.body)}</p>${(s.list || []).map((x) => `<div class="ai">${esc(x)}</div>`).join('')}${s.action ? `<button class="btn sm" data-act="toast" data-msg="${esc(s.action)}">${esc(s.action)}</button>` : '<span class="hint">No action needed</span>'}</div></div>`).join('')}</div></div>`;
  }
  function rolesSpec() {
    const rows = [
      ['Staff', 'My Work', 'My Work · Team (read-only) · Projects (context allowed by V1.3 rules)', 'Own assignments and shared Work Cards on assigned projects; “Working on now”; edit own assignments; comments and Action Items per task permissions', 'Schedule, Portfolio, Office; on Team: Work Card status and any editing'],
      ['Senior staff', 'Team', 'Team · My Work · Projects', 'Team staff overview and calendar; create, edit, assign and delete Work Cards (start / pause / complete only their own); see what each person is working on; project context', 'Portfolio, partner-only settings'],
      ['Partner', 'Portfolio', 'Portfolio · My Work · Schedule · Projects · Office', 'Everything above plus project editing, office scheduling, private tasks, Publish Changes during rollover', '—'],
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
      'ph-office': ['Office', 'Role-protected: staff and business roles, custom priorities, settings, export, backups, logs, sync recovery.'],
    }[id];
    return `<div class="ws-head"><div><h1>${info[0]}</h1><p>Planned for round 3</p></div></div><div class="empty"><p>${ic('info', 'lg')}</p><p style="max-width:520px;margin:0 auto">${info[1]}</p><p class="hint">Not mocked in round 2. It will reuse the same shell, list rows, inspector and status vocabulary.</p></div>`;
  }

  // ---------------------------------------------------------------- DOM patching
  // Rebuilding with innerHTML would replace every node, so CSS transitions could never run and hover,
  // focus and scroll state would reset on each interaction. patchInner() morphs the live DOM toward the
  // new markup instead: existing nodes keep their identity (and animate), only real changes touch the DOM.
  const keyOf = (n) => (n.nodeType !== 1 ? null : n.dataset.fk ? 'f:' + n.dataset.fk : n.id ? 'i:' + n.id : n.dataset.person && n.classList.contains('lane') ? 'p:' + n.dataset.person : null);
  function morphNode(from, to) {
    if (from.nodeType !== 1) { if (from.nodeValue !== to.nodeValue) from.nodeValue = to.nodeValue; return; }
    for (const a of [...from.attributes]) if (!to.hasAttribute(a.name)) from.removeAttribute(a.name);
    for (const a of to.attributes) if (from.getAttribute(a.name) !== a.value) from.setAttribute(a.name, a.value);
    if (from.tagName === 'INPUT') { if (from !== document.activeElement && to.hasAttribute('value')) from.value = to.getAttribute('value'); return; }
    morphKids(from, to);
    if (from.tagName === 'SELECT') from.value = to.value;
  }
  function morphKids(from, to) {
    const fromKids = [...from.childNodes]; const toKids = [...to.childNodes];
    const keyed = new Map(); const loose = [];
    fromKids.forEach((n) => { const k = keyOf(n); if (k) { if (!keyed.has(k)) keyed.set(k, []); keyed.get(k).push(n); } else loose.push(n); });
    const used = new Set(); let li = 0;
    toKids.forEach((t, i) => {
      const k = keyOf(t); let m = null;
      if (k) { const q = keyed.get(k); if (q && q.length) m = q.shift(); }
      else { for (let j = li; j < loose.length; j++) { if (!used.has(loose[j]) && loose[j].nodeName === t.nodeName) { m = loose[j]; li = j + 1; break; } } }
      const ref = from.childNodes[i] || null;
      if (m) { used.add(m); morphNode(m, t); if (m !== ref) from.insertBefore(m, ref); } else from.insertBefore(t, ref);
    });
    fromKids.forEach((n) => { if (!used.has(n) && n.parentNode === from) from.removeChild(n); });
  }
  function patchInner(el, html) { const tmp = document.createElement(el.tagName); tmp.innerHTML = html; morphKids(el, tmp); }
  // Gentle cross-fade when the thing being shown changes (a different view, or a different selection).
  let lastView = null; let lastSel = null;
  const swap = (els) => els.forEach((e) => { e.classList.remove('swap'); void e.offsetWidth; e.classList.add('swap'); });
  function animateSwaps() {
    const vk = [S.screen, S.view, S.myProject, S.myView, S.persona, S.carryover].join('|');
    if (lastView !== null && vk !== lastView) swap([...document.querySelectorAll('#win .three > .pane:not(.pane-proj):not(.pane-insp), #win .spec, #win .ws > .empty')]);
    lastView = vk;
    const sk = [S.sel.type, S.sel.id, S.itab, S.screen === 'team' && S.teamSel ? S.teamSel.person + '/' + S.teamSel.project : ''].join(':');
    if (lastSel !== null && sk !== lastSel) swap([...document.querySelectorAll('#win .insp-h, #win .facts, #win .ibody')]);
    lastSel = sk;
  }

  // ---------------------------------------------------------------- Work Card add / edit (Partners and Senior staff)
  // V1.3.1: Partners and admins create, edit, duplicate and delete Work Cards (assignees only start / pause / complete).
  // All of it is refused while a weekly rollover review is in progress, so the controls lock and say why.
  const wcLocked = () => S.rollover === 'review';
  const catOf = (c) => D.categories.find((k) => k.id === c.cat) || D.categories[0];
  const catLabel = (c) => { const k = catOf(c); return `<span class="cat" style="--cat:${k.color}"><i aria-hidden="true"></i>${esc(k.label)}</span>`; };
  // V1.3.1: a Work Card's Lead is its project's lead (the lead set on the project's assignments), shown as "Lead: Surname" or "Lead: None".
  const projLead = (projId) => { const t = D.tasks.find((x) => x.project === projId && x.lead); return t ? person(t.lead) : null; };
  const leadText = (projId) => { const l = projLead(projId); return 'Lead: ' + (l ? l.name.split(' ').slice(-1)[0] : 'None'); };
  const leadTip = (projId) => { const l = projLead(projId); return l ? 'Project Lead: ' + l.name : 'Project Lead: None'; };
  const wcLockNote = () => (wcLocked() ? `<div class="note-box">${ic('lock', 'sm')} Work Cards can’t be added, edited or deleted while the weekly scheduling review is in progress (set “Rollover” above to Idle to try the dialogs).</div>` : '');
  function wcBox(c, pid, o = {}) {
    const now = D.focus[pid] === c.id && c.status === 'in_progress'; const mine = c.assignees.includes(S.persona);
    const menu = persona().cards ? `<button class="btn sm icon wc-more" data-act="wc-menu" data-id="${c.id}" aria-haspopup="menu" aria-label="More actions for ${esc(c.title)}" data-fk="wcm-${c.id}">${ic('dots', 'sm')}</button>` : '';
    return `<div class="cardbox"><div class="top"><span class="noun">${ic('stack', 'sm')}Work Card</span>${cardMk(c.status)}${now ? `<span class="chip badge-focus">${ic('play', 'sm')}Working on now</span>` : ''}${menu}</div>
      <div class="ttl">${esc(c.title)}</div><div style="margin-top:2px">${catLabel(c)}</div>
      <div class="meta"><span class="avs">${c.assignees.map((a) => av(a, true)).join('')}</span>${hoursText(c) ? `<span>${esc(hoursText(c))}</span>` : ''}<span>${c.start ? esc(dayShort(c.start)) + (c.end !== c.start ? '–' + esc(dayShort(c.end)) : '') : 'No dates'}</span><span class="lead" title="${esc(leadTip(c.project))}">${esc(leadText(c.project))}</span></div>
      ${o.actions && mine && c.status !== 'done' ? `<div style="margin-top:6px">${cardActions(c).replace(/<p class="hint">.*?<\/p>/, '')}</div>` : ''}</div>`;
  }
  function wcMenu() {
    const id = S.popover.slice(3); const c = card(id); if (!c) return ''; const pos = S.popPos || { x: 40, y: 120 }; const dis = wcLocked() ? 'disabled' : '';
    return `<div class="pop" style="left:${pos.x}px;top:${pos.y}px;min-width:170px" role="menu" aria-label="Actions for ${esc(c.title)}"><button class="item" role="menuitem" data-act="wc-edit" data-id="${id}" data-fk="mi-edit" ${dis}>Edit…</button><button class="item" role="menuitem" data-act="wc-dup" data-id="${id}" ${dis}>Duplicate</button><button class="item danger" role="menuitem" data-act="wc-del" data-id="${id}" ${dis}>Delete…</button>${wcLocked() ? '<p class="hint">Locked during the weekly review.</p>' : ''}</div>`;
  }
  function wcFormDialog() {
    const f = S.wc; const edit = f.mode === 'edit'; const c = edit ? card(f.id) : null; const pr = project(f.project);
    const part = [...new Set([...D.tasks.filter((t) => t.project === f.project).map((t) => t.person), ...D.cards.filter((x) => x.project === f.project).flatMap((x) => x.assignees), ...(f.person ? [f.person] : [])])].filter((id) => person(id) && person(id).lane);
    const chosen = new Set(edit ? c.assignees : f.person ? [f.person] : part);
    const v = edit ? c : { title: '', cat: D.categories[0].id, desc: '', min: 0, start: null, end: null, status: 'todo' };
    return `<div class="overlay"><form class="sheet" id="wcf" style="width:min(560px,calc(100% - 32px))" role="dialog" aria-labelledby="wct" novalidate>
      <div class="sheet-h">${ic('stack')}<h2 id="wct">${edit ? 'Edit Work Card' : 'Add Work Card'}</h2><button type="button" class="btn sm" data-act="overlay-close">${ic('x', 'sm')}Close <kbd>Esc</kbd></button></div>
      <div class="sheet-b wcf"><p class="hint" style="margin:0">${esc(pr.display)} · week of Nov 9 · ${esc(leadText(f.project))} (set on the project’s assignments)</p>
        <label>Title<input id="wc-title" data-fk="wc-title" value="${esc(v.title)}" placeholder="What needs to be done?" autocomplete="off"></label><div class="err" id="wc-err" role="alert"></div>
        <div class="row2"><label>Type<select id="wc-cat">${D.categories.map((k) => `<option value="${k.id}" ${v.cat === k.id ? 'selected' : ''}>${esc(k.label)}</option>`).join('')}</select></label>
          <label>Allotted time (hours)<input id="wc-hours" type="number" min="0" step="0.25" value="${v.min ? v.min / 60 : ''}" placeholder="Optional"></label>
          ${edit ? `<label>Status<select id="wc-status">${['todo', 'in_progress', 'paused', 'done'].map((s) => `<option value="${s}" ${v.status === s ? 'selected' : ''}>${CS[s][1]}</option>`).join('')}</select></label>` : '<span></span>'}</div>
        <label>Description<textarea id="wc-desc" rows="2" placeholder="Optional context">${esc(v.desc || '')}</textarea></label>
        <div class="row2"><label>Start date<input id="wc-start" type="date" min="${D.DAYS[0]}" max="${D.DAYS[4]}" value="${v.start || ''}"></label><label>End date<input id="wc-end" type="date" min="${D.DAYS[0]}" max="${D.DAYS[4]}" value="${v.end || ''}"></label><span class="hint" style="align-self:end">Hours are a guide for the assignee. They aren’t tracked.</span></div>
        <fieldset><legend>Assign to project staff</legend>${part.length ? part.map((id) => `<label class="opt"><input type="checkbox" name="wc-as" value="${id}" ${chosen.has(id) ? 'checked' : ''}>${esc(person(id).name)}</label>`).join('') : '<span class="hint">No staff are assigned to this project yet.</span>'}</fieldset></div>
      <div class="sheet-f"><button type="button" class="btn" data-act="overlay-close">Cancel</button><button type="submit" class="btn primary" data-fk="wc-save">${edit ? 'Save Work Card' : 'Add Work Card'}</button></div></form></div>`;
  }
  function wcDelDialog() {
    const c = card(S.wc.id); if (!c) return '';
    return `<div class="overlay"><div class="sheet" style="width:420px" role="alertdialog" aria-labelledby="wd"><div class="sheet-h">${ic('trash')}<h2 id="wd">Delete Work Card?</h2></div><div class="sheet-b"><p style="margin:0 0 6px">Delete “${esc(c.title)}”?</p><p class="hint" style="margin:0">It is removed for everyone assigned to it.</p></div><div class="sheet-f"><button class="btn" data-act="overlay-close" data-fk="wd-cancel">Cancel</button><button class="btn primary danger" data-act="wc-del-confirm">Delete</button></div></div></div>`;
  }
  function saveWc() {
    const g = (id) => document.getElementById(id); const f = S.wc; const title = g('wc-title').value.trim();
    if (!title) { g('wc-err').textContent = 'Enter a title.'; g('wc-title').focus(); return; }
    const clamp = (d) => (d ? (d < D.DAYS[0] ? D.DAYS[0] : d > D.DAYS[4] ? D.DAYS[4] : d) : null);
    let start = clamp(g('wc-start').value); let end = clamp(g('wc-end').value);
    if (start && !end) end = start; if (end && !start) start = end; if (start && end && end < start) [start, end] = [end, start];
    const hrs = parseFloat(g('wc-hours').value);
    const vals = { title, cat: g('wc-cat').value, desc: g('wc-desc').value.trim(), min: hrs > 0 ? Math.round(hrs * 60) : 0, start, end, assignees: [...document.querySelectorAll('#wcf input[name="wc-as"]:checked')].map((x) => x.value) };
    S.overlay = null;
    if (f.mode === 'edit') {
      const c = card(f.id); const prev = { ...c, assignees: [...c.assignees] }; Object.assign(c, vals, { status: g('wc-status').value });
      S.undo = () => { Object.assign(c, prev); render(); }; render(); return toast('Work Card saved', true);
    }
    const c = { id: 'c' + Date.now(), project: f.project, week: D.WEEK_OF, status: 'todo', logged: 0, ...vals };
    D.cards.push(c); if (f.person && S.screen === 'team') S.teamSel = { person: f.person, project: f.project };
    S.undo = () => { D.cards.splice(D.cards.indexOf(c), 1); render(); }; render(); toast('Work Card added', true);
  }

  // ---------------------------------------------------------------- team / portfolio staff view (V1.3.1 Staff Overview)
  const teamTitle = () => (persona().nav.includes('portfolio') ? 'Portfolio' : 'Team');
  const AV_RANK = { working: 0, paused: 1, idle: 2 };
  const secOpen = (id) => S.teamOpen[id] ?? id === teamFirst();
  const teamCards = (pid, proj) => D.cards.filter((c) => c.project === proj && c.week === D.WEEK_OF && c.assignees.includes(pid));
  function teamRow(t, pid) {
    const p = project(t.project); const cs = teamCards(pid, t.project); const late = isLate(t);
    const sel = S.teamSel && S.teamSel.person === pid && S.teamSel.project === t.project;
    const nowC = cs.some((c) => D.focus[pid] === c.id && c.status === 'in_progress'); const pausedC = cs.some((c) => c.status === 'paused');
    const flags = `${nowC ? `<span class="sflag now">${ic('play', 'sm')}Working on now</span>` : ''}${pausedC ? `<span class="sflag">${ic('pause', 'sm')}Paused</span>` : ''}`;
    const sum = cardSummary(cs); const dueTxt = t.due ? ` · ${late ? 'Overdue ' : 'Due '}${dayShort(t.due)}` : '';
    const prioName = t.prio == null ? 'no priority' : t.prio === -1 ? 'Waiting' : 'priority ' + t.prio;
    return `<div class="srow" role="option" tabindex="0" aria-selected="${!!sel}" data-act="team-select" data-person="${pid}" data-id="${t.project}" data-fk="ts-${t.id}" aria-label="${esc(`${p.display}, ${sum}, ${prioName}. Show ${person(pid).name.split(' ')[0]}’s Work Cards`)}">
      <button class="chk" role="checkbox" aria-checked="false" data-act="toggle-done" data-id="${t.id}" data-fk="tchk-${t.id}" aria-label="Mark ${esc(p.display)} done" ${canEdit(t) ? '' : 'disabled'}></button>${prioBadge(t.prio)}
      <div class="main"><div class="ttl">${esc(p.display)}</div><div class="sub ${cs.length ? '' : 'nocards'}"><span class="${late ? 'late' : ''}">${esc(sum)}${esc(dueTxt)}</span>${flags}</div></div>
      ${partnerChip(p)}</div>`;
  }
  function teamSection(x) {
    const { p, a } = x; const open = secOpen(p.id); const ts = openTasks(p.id); const pto = D.pto[p.id];
    return `<section class="tsec ${open ? 'is-open' : ''}" data-person="${p.id}" aria-label="${esc(p.name)}">
      <button class="tsec-h" data-act="team-toggle" data-id="${p.id}" aria-expanded="${open}" data-fk="tsec-${p.id}">${av(p.id)}
        <span class="tw"><span class="nm">${esc(p.name)}${pto ? `<span class="chip pto">${ic('calendar', 'sm')}PTO ${esc(WD[dt(pto[0]).getDay()])}–${esc(WD[dt(pto[pto.length - 1]).getDay()])}</span>` : ''}</span><span class="tnote">${esc(availNote(a))}</span></span>
        <span class="tm"><span class="cnt">${ts.length} ${ts.length === 1 ? 'project' : 'projects'}</span>${availChip(p.id)}</span><span class="chev">${ic('chevron', 'sm')}</span></button>
      ${open ? `<div class="tbody" role="listbox" aria-label="${esc(p.name)} projects">${ts.length ? ts.map((t) => teamRow(t, p.id)).join('') : '<div class="empty" style="padding:12px 14px">No open projects.</div>'}</div>` : ''}</section>`;
  }
  const teamCardBox = (c, pid) => wcBox(c, pid);
  function teamInspector() {
    const s = S.teamSel;
    if (!s) return `<div class="insp"><div class="empty">${ic('panel', 'lg')}<p>Select a project to see that person’s Work Cards here.</p></div></div>`;
    const pr = project(s.project); const pp = person(s.person); const cs = teamCards(s.person, s.project); const t = openTasks(s.person).find((x) => x.project === s.project);
    const closeBtn = `<button class="btn sm insp-close" data-act="close-insp" aria-label="Close (Esc)">${ic('x', 'sm')}Close</button>`;
    const act = cs.filter((c) => c.status !== 'done'); const planned = act.reduce((m, c) => m + (c.min || 0), 0);
    const head = `<div class="insp-h">${closeBtn}<span class="noun">${ic('stack', 'sm')}Work Cards · ${esc(pp.name)}</span><h2>${esc(pr.display)}</h2><div class="chips"><span class="chip">${cs.length} ${cs.length === 1 ? 'card' : 'cards'}</span>${planned ? `<span class="chip">${esc(fmtH(planned / 60))} planned</span>` : ''}${availChip(s.person)}</div></div>
      <div class="facts"><div class="fact"><span>Assigned to</span><b>${esc(pp.name)}</b></div><div class="fact"><span>Partner</span><b>${esc(pr.partners.map((id) => person(id).name).join(', '))}</b></div><div class="fact"><span>Due</span><b>${esc(t ? fmtDate(t.due) : 'No date')}</b></div><div class="fact"><span>Lead</span><b>${esc(t ? leadName(t) : 'None')}</b></div></div>`;
    const body = cs.length ? cs.slice().sort((a, b) => ['in_progress', 'paused', 'todo', 'done'].indexOf(a.status) - ['in_progress', 'paused', 'todo', 'done'].indexOf(b.status)).map((c) => teamCardBox(c, s.person)).join('')
      : `<div class="note-box"><b>No Work Cards yet.</b> ${esc(pp.name.split(' ')[0])} has this project as a scheduled assignment, but nothing has been broken into Work Cards, so what they are doing on it isn’t visible here.</div>`;
    const actions = `<div style="display:flex;gap:6px;flex-wrap:wrap;margin:8px 0">${persona().cards ? `<button class="btn sm primary" data-act="wc-add" data-project="${s.project}" data-person="${s.person}" ${wcLocked() ? 'disabled title="Locked during the weekly review"' : ''}>${ic('plus', 'sm')}Add Work Card</button>` : ''}<button class="btn sm" data-act="team-open" data-id="${s.person}">${ic('calendar', 'sm')}View in Schedule</button></div>`;
    return `<div class="insp">${head}<div class="ibody" data-scroll="insp" tabindex="0"><h3>${esc(pp.name.split(' ')[0])}’s Work Cards on this project</h3>${body}${actions}${persona().cards ? wcLockNote() : ''}<p class="hint">Work Cards are shared project work. Scheduled assignments are the office’s plan and are separate.</p></div></div>`;
  }
  // Read-only Team for Staff (V1.3.1 "Staff View"): who is assigned to which projects. No Work Card status, no editing.
  const teamFirst = () => (lanes().find((p) => persona().cards || p.id !== S.persona) || lanes()[0]).id;
  function teamRowRO(t) {
    const p = project(t.project); const late = isLate(t); const prioName = t.prio == null ? 'no priority' : t.prio === -1 ? 'Waiting' : 'priority ' + t.prio;
    return `<div class="srow ro" aria-label="${esc(`${p.display}, ${t.title || 'no note'}, ${prioName}`)}">${prioBadge(t.prio)}
      <div class="main"><div class="ttl">${esc(p.display)}</div><div class="sub"><span class="${t.title ? '' : 'ph'}">${esc(t.title || 'No scheduling note')}</span>${t.due ? `<span class="${late ? 'late' : ''}">${late ? 'Overdue ' : 'Due '}${esc(dayShort(t.due))}</span>` : ''}</div></div>${partnerChip(p)}</div>`;
  }
  function teamSectionRO(p) {
    const open = secOpen(p.id); const ts = openTasks(p.id); const pto = D.pto[p.id];
    return `<section class="tsec ${open ? 'is-open' : ''}" data-person="${p.id}" aria-label="${esc(p.name)}">
      <button class="tsec-h ro" data-act="team-toggle" data-id="${p.id}" aria-expanded="${open}" data-fk="tsec-${p.id}">${av(p.id)}
        <span class="tw"><span class="nm">${esc(p.name)}${pto ? `<span class="chip pto">${ic('calendar', 'sm')}PTO ${esc(WD[dt(pto[0]).getDay()])}–${esc(WD[dt(pto[pto.length - 1]).getDay()])}</span>` : ''}</span></span>
        <span class="tm"><span class="cnt">${ts.length} ${ts.length === 1 ? 'project' : 'projects'}</span></span><span class="chev">${ic('chevron', 'sm')}</span></button>
      ${open ? `<div class="tbody">${ts.length ? ts.map(teamRowRO).join('') : '<div class="empty" style="padding:12px 14px">No open projects.</div>'}</div>` : ''}</section>`;
  }
  function teamReadOnly() {
    const people = lanes().filter((p) => p.id !== S.persona);
    const main = `<div class="pane team-pane" data-scroll="team" id="main-pane">${people.map(teamSectionRO).join('')}<div class="note-box">${ic('lock', 'sm')} Read-only. This shows which projects each teammate is assigned this week. Work Cards and who is working on what are visible to Partners and Senior staff.</div></div>`;
    return `<div class="ws-head"><div><h1>Team</h1><p>Who is assigned to which projects this week.</p></div><div class="grow"></div></div><div class="ws-bar"><span class="chip">${ic('eye', 'sm')}Read-only</span></div>${syncBanner()}${threePane('', main, '', 'team ro')}`;
  }
  function teamScreen() {
    if (!persona().cards) return teamReadOnly();
    const all = lanes().map((p) => ({ p, a: availability(p.id) }));
    const f = S.teamFilter; const count = (k) => all.filter((x) => x.a.key === k).length;
    const rows = all.filter((x) => f === 'all' || x.a.key === f).sort((x, y) => (S.teamSort === 'status' ? AV_RANK[x.a.key] - AV_RANK[y.a.key] : 0) || x.p.name.localeCompare(y.p.name));
    // Keep a sensible project selected (the first person's first project) until the viewer picks one.
    const valid = S.teamSel && rows.some((x) => x.p.id === S.teamSel.person) && openTasks(S.teamSel.person).some((t) => t.project === S.teamSel.project);
    if (!valid) { const pick = rows.find((x) => openTasks(x.p.id).length && secOpen(x.p.id)) || rows.find((x) => openTasks(x.p.id).length); S.teamSel = pick ? { person: pick.p.id, project: (openTasks(pick.p.id).find((t) => teamCards(pick.p.id, t.project).length) || openTasks(pick.p.id)[0]).project } : null; }
    const chip = (v, label, n) => `<button class="fchip" data-act="team-filter" data-v="${v}" data-fk="tf-${v}" aria-pressed="${f === v}">${label} <span class="n">${n}</span></button>`;
    const sub = persona().nav.includes('portfolio') ? 'What each person is working on, and which projects they hold. The project portfolio itself is planned for round 3.' : 'What each person is working on, and which projects they hold.';
    const bar = `<div class="ws-bar">${seg('Sort people', [{ attrs: 'data-act="team-sort" data-v="name"', on: S.teamSort === 'name', html: 'Name' }, { attrs: 'data-act="team-sort" data-v="status"', on: S.teamSort === 'status', html: 'Status' }])}
      ${chip('all', 'Everyone', all.length)}${chip('working', 'Working', count('working'))}${chip('paused', 'Paused', count('paused'))}${chip('idle', 'Nothing in progress', count('idle'))}</div>`;
    const main = `<div class="pane team-pane" data-scroll="team" id="main-pane">${rows.map(teamSection).join('') || '<div class="empty">Nobody matches this filter.</div>'}
      <div class="note-box">Status comes straight from Start and Pause on Work Cards. Paused only means that task isn’t being worked on right now, not that the person is free; they may have moved to other work. Judging who has room for more work is on hold. Hours aren’t tracked, so there is no load bar.</div></div>`;
    return `<div class="ws-head"><div><h1>${teamTitle()}</h1><p>${sub}</p></div><div class="grow"></div></div>${bar}${syncBanner()}${threePane('', main, teamInspector(), 'team')}`;
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
    else if (sc === 'team') content = `<div class="ws">${teamScreen()}</div>`;
    else if (sc.startsWith('ph-')) content = `<div class="ws">${placeholder(sc)}</div>`;
    else {
      const t = { objects: 'Spec · Objects and states', sync: 'Spec · Sync states', roles: 'Spec · Roles and navigation', shortcuts: 'Spec · Keyboard' }[sc];
      content = `<div class="ws"><div class="ws-head"><div><h1>${t}</h1></div></div>${{ objects: objectsSpec, sync: syncSpec, roles: rolesSpec, shortcuts: shortcutsSpec }[sc]()}</div>`;
    }
    const crumb = SCHED_SCREENS.includes(sc) ? 'Schedule' : sc === 'mywork' ? 'My Work' : sc === 'team' ? teamTitle() : sc.startsWith('ph-') ? NAVDEF[Object.keys(NAVDEF).find((k) => NAVDEF[k][2] === sc)][0] : 'Spec';
    const sy = SYNC[S.sync];
    const searchLabel = sc === 'mywork' ? 'Search my work' : 'Search tasks and people';
    const winStyle = S.width === 'fit' ? '' : `--win-w:${S.width}px;`;
    const html = `${frameHTML()}<div class="win ${S.insOpen ? 'insp-open' : ''} ${S.projOpen ? 'proj-open' : ''} ${S.navMin ? 'nav-min' : ''}" style="${winStyle}" id="win">
      <div class="tb"><button class="tb-btn tb-toggle" data-act="nav-toggle" data-fk="nav-toggle" aria-expanded="${!S.navMin}" aria-controls="nav" aria-label="${S.navMin ? 'Show' : 'Hide'} sidebar" title="${S.navMin ? 'Show' : 'Hide'} sidebar (Ctrl+B)">${ic('sidebar')}</button><div class="brand"><span class="mark">S</span><span class="bn">StudioSync</span></div><span class="crumb">/ ${esc(crumb)}</span>
        <button class="tb-search" data-act="search-open" data-fk="search-btn" aria-label="${searchLabel} (Ctrl+K)">${ic('search', 'sm')}<span>${searchLabel}…</span><kbd>Ctrl K</kbd></button>
        <button class="tb-btn ${sy.cls}" data-act="sync-open" data-fk="sync-btn" aria-haspopup="dialog" aria-expanded="${S.popover === 'sync'}">${ic(sy.icon, 'sm' + (sy.spin ? ' spin' : ''))}<span>${esc(sy.text)}</span></button>
        <button class="tb-btn" data-act="toast" data-msg="Account menu: sign out, switch user">${av(S.persona)}<span class="bn">${esc(person(S.persona).name)}</span></button>
        <div class="caption" aria-hidden="true"><span>&#8212;</span><span>&#9633;</span><span>&#10005;</span></div></div>
      <div class="body"><nav class="nav" id="nav" aria-label="StudioSync workspaces"><div class="nav-label">Workspace</div>${nav}<div class="who"><b>${esc(person(S.persona).name)}</b><span>${esc(per.role)}</span></div></nav>${content}</div>
      <div id="layer">${layerHTML()}</div></div><div id="notes">${notesHTML()}</div>`;
    patchInner($app, html);
    restore(keep); postRender(); animateSwaps();
  }
  const SCREENS = [['Workspaces', [['board', 'Schedule · Board'], ['drag', 'Drag & assign'], ['week', 'Schedule · Week'], ['mywork', 'My Work'], ['team', 'Team']]], ['Specs', [['objects', 'Objects & states'], ['sync', 'Sync'], ['search', 'Search'], ['roles', 'Roles'], ['rollover', 'Rollover'], ['shortcuts', 'Shortcuts']]]];
  const tabSel = (id) => (id === 'week' ? S.screen === 'board' && S.view === 'week' : id === 'board' ? S.screen === 'board' && S.view === 'board' : S.screen === id);
  const NOTES = {
    board: ['Rows and the Projects panel follow the real V1.3.1 Dashboard: checkbox, priority badge, project as title, note, due date, partner initials, lead, Work cards disclosure; Current/Future tabs, search, Active only, and the jump rails. Check that nothing you use is missing.',
      'Eleven staff, twenty projects and about forty assignments: this is the density test. Switch Comfortable / Compact and the window width.', 'Each staff group shows its task count, P1 / Waiting / overdue counts and PTO. No hours or capacity are shown because hours are not tracked.', 'Publish Changes appears only while a rollover is active (use “Rollover” in the selector to turn it off). Carryover, Bulk Actions and Print keep V1.3 names.'],
    week: ['Spans are Work Cards (start → end); flags are assignments on their due day. Shape differs, so they stay distinct.', 'Day cells only mark today and PTO. The weekend column holds the Saturday due date from the fixture.', 'Undated Work Cards wait in “Needs dates”.'],
    drag: ['Pointer: drag a project (or an assignment) onto a person. Keyboard: Enter on “Assign…” opens a person list with each person’s task count.', 'A toast with Undo confirms every assignment.'],
    mywork: ['Assignments and Work Cards are separate sections with different markers and labels.', 'Starting or pausing a Work Card tells Partners and Senior staff what you are working on (they see it in Team / Portfolio). Only the assignee starts, pauses or completes their own Work Card (even Partners cannot for someone else).', 'Private tasks appear only for the Partner persona. Try the persona selector.'],
    team: ['Modeled on the V1.3.1 Staff Overview: one section per person (first one open), each project as a row with priority, Work Card summary, due date and partner. Click a project to see that person’s Work Cards in the right column (V1.3.1 opens a dialog).', 'Partners and Senior staff can add Work Cards (button in the right column) and edit, duplicate or delete them (… on each card). All of it locks while the weekly review is running: set “Rollover” to Idle to try it. Only the assignee starts, pauses or completes a card.', 'Staff see a read-only Team: who is assigned to which projects, with no Work Cards, no status and no editing. Switch persona: Riley (Senior staff) and Morgan (Partner) get the full version.', 'The status is only what Start and Pause say: Working, Paused, or Nothing in progress. Judging who is available is on hold.'],
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
  function layer() { const el = document.getElementById('layer'); if (el) patchInner(el, layerHTML()); }
  function layerHTML() {
    let h = '';
    if (S.overlay === 'search') h += searchSheet();
    if (S.overlay === 'publish') h += publishDialog();
    if (S.overlay === 'wcform') h += wcFormDialog();
    if (S.overlay === 'wcdel') h += wcDelDialog();
    if (S.overlay === 'publishing') h += `<div class="overlay" role="alertdialog" aria-live="polite"><div class="sheet" style="width:360px"><div class="sheet-b" style="text-align:center;padding:28px">${ic('sync', 'lg spin')}<h2 style="margin:10px 0 4px">Publishing schedule…</h2><p class="hint" style="margin:0">Writing to the shared drive. This can take a moment on a network folder.</p></div></div></div>`;
    if (S.overlay === 'shortcuts') h += `<div class="overlay" data-act="overlay-bg"><div class="sheet" style="width:min(720px,calc(100% - 32px))" role="dialog" aria-label="Keyboard shortcuts"><div class="sheet-h">${ic('keyboard')}<h2>Keyboard shortcuts</h2><button class="btn sm" data-act="overlay-close">${ic('x', 'sm')}Close <kbd>Esc</kbd></button></div><div class="sheet-b">${shortcutTable()}</div></div></div>`;
    if (S.popover === 'sync') h += syncPopover();
    if (typeof S.popover === 'string' && S.popover.startsWith('more:')) h += moreMenu();
    if (typeof S.popover === 'string' && S.popover.startsWith('wc:')) h += wcMenu();
    if (S.menu) h += assignMenu();
    if (S.toast) h += `<div class="toast" role="status">${esc(S.toast.msg)}${S.toast.undo ? `<button data-act="toast-undo">Undo</button>` : ''}</div>`;
    return h;
  }
  function moreMenu() {
    const id = S.popover.slice(5); const pos = S.popPos || { x: 40, y: 120 };
    return `<div class="pop" style="left:${pos.x}px;top:${pos.y}px;min-width:150px" role="menu" aria-label="Actions for ${esc(person(id).name)}"><button class="item" role="menuitem" data-act="set-pto" data-id="${id}" data-fk="mi-pto">Set PTO</button></div>`;
  }
  function syncPopover() {
    const s = SYNC[S.sync];
    return `<div class="pop" style="top:44px;right:150px" role="dialog" aria-label="Sync status"><h3>${ic(s.icon, 'sm')} ${esc(s.title)}</h3><p>${esc(s.body)}</p>${(s.list || []).map((x) => `<div class="ai" style="margin:2px 8px">${esc(x)}</div>`).join('')}<div style="display:flex;gap:6px;padding:8px">${s.action ? `<button class="btn sm primary" data-act="toast" data-msg="${esc(s.action)}">${esc(s.action)}</button>` : ''}<button class="btn sm" data-act="toast" data-msg="Opens Office › Sync recovery and logs">Recovery &amp; logs</button></div></div>`;
  }
  function assignMenu() {
    const m = S.menu; const what = m.kind === 'project' ? project(m.id).name : task(m.id).title;
    const items = lanes().map((p, i) => { return `<button class="item" role="menuitem" data-act="assign-to" data-person="${p.id}" aria-selected="${i === (m.i || 0)}" data-fk="mi-${p.id}">${av(p.id)}<span>${esc(p.name)}</span><span class="hint" style="margin-left:auto">${openTasks(p.id).length} ${openTasks(p.id).length === 1 ? 'task' : 'tasks'}</span></button>`; }).join('');
    const style = m.pos ? `left:${m.pos.x}px;top:${m.pos.y}px` : 'left:260px;top:180px';
    return `<div class="pop" style="${style};max-height:420px;overflow:auto" role="menu" aria-label="Assign to" id="assign-menu"><h3>${m.kind === 'project' ? 'Assign' : 'Reassign'} “${esc(what)}” to…</h3><p class="hint">↑ ↓ choose · Enter assigns · Esc cancels.</p>${items}</div>`;
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
      ['Projects', ic('folder', 'sm'), D.projects.filter((p) => myScope(p.id) && (!q || p.display.toLowerCase().includes(q) || (p.note || '').toLowerCase().includes(q))).map((p) => ({ k: 'project', id: p.id, t: p.display, s: p.note || p.status }))],
      ['Assignments', ic('circle', 'sm'), D.tasks.filter((t) => (full || t.person === S.persona) && (!q || (t.title || '').toLowerCase().includes(q) || project(t.project).display.toLowerCase().includes(q) || person(t.person).name.toLowerCase().includes(q))).map((t) => ({ k: 'task', id: t.id, t: t.title || projName(t.project), s: `${person(t.person).name} · ${project(t.project).name}` }))],
      ['Work Cards', ic('stack', 'sm'), D.cards.filter((c) => myScope(c.project) && (!q || c.title.toLowerCase().includes(q) || project(c.project).name.toLowerCase().includes(q))).map((c) => ({ k: 'card', id: c.id, t: c.title, s: project(c.project).name }))],
      ['Comments', ic('message', 'sm'), D.tasks.filter((t) => (full || t.person === S.persona)).flatMap((t) => t.comments.map((m) => ({ k: 'task', id: t.id, t: m.text, s: `${person(m.who).name} on ${t.title || projName(t.project)}` }))).filter((r) => q && r.t.toLowerCase().includes(q))],
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
    if (S.overlay === 'wcform' && !document.activeElement.closest?.('#wcf')) document.getElementById('wc-title')?.focus();
    if (S.overlay === 'wcdel' && !document.activeElement.closest?.('.sheet')) document.querySelector('[data-fk="wd-cancel"]')?.focus();
    if (typeof S.popover === 'string' && S.popover.startsWith('wc:') && !document.activeElement.closest?.('.pop')) document.querySelector('[data-fk="mi-edit"]')?.focus({ preventScroll: true });
    if (typeof S.popover === 'string' && S.popover.startsWith('more:') && !document.activeElement.closest?.('.pop')) document.querySelector('[data-fk="mi-pto"]')?.focus({ preventScroll: true });
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
    if (kind === 'task') { const t = task(id); const prev = t.person; t.person = personId; select('task', id); render(); S.undo = () => { t.person = prev; render(); }; toast(`Reassigned ${t.title || projName(t.project)} to ${person(personId).name}`, true); return; }
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
      case 'more-open': { const w = document.getElementById('win').getBoundingClientRect(); const r = t.getBoundingClientRect(); S.popover = 'more:' + id; S.popPos = { x: Math.max(8, r.right - w.left - 150), y: r.bottom - w.top + 6 }; return render(); }
      case 'set-pto': S.popover = null; render(); return toast('Set PTO for ' + person(id).name + ' (dialog not part of this mockup)');
      case 'wc-add': if (wcLocked()) return; S.wc = { mode: 'add', project: t.dataset.project, person: t.dataset.person || null }; S.overlay = 'wcform'; S.popover = null; return render();
      case 'wc-edit': if (wcLocked()) return; S.wc = { mode: 'edit', id, project: card(id).project }; S.overlay = 'wcform'; S.popover = null; return render();
      case 'wc-menu': { const w = document.getElementById('win').getBoundingClientRect(); const r = t.getBoundingClientRect(); S.popover = 'wc:' + id; S.popPos = { x: Math.max(8, r.right - w.left - 170), y: r.bottom - w.top + 6 }; return render(); }
      case 'wc-dup': { if (wcLocked()) return; const c = card(id); const copy = { ...c, id: 'c' + Date.now(), title: c.title + ' (copy)', status: 'todo', logged: 0, assignees: [...c.assignees] }; D.cards.push(copy); S.popover = null; S.undo = () => { D.cards.splice(D.cards.indexOf(copy), 1); render(); }; render(); return toast('Work Card duplicated', true); }
      case 'wc-del': if (wcLocked()) return; S.wc = { mode: 'del', id }; S.overlay = 'wcdel'; S.popover = null; return render();
      case 'wc-del-confirm': { const c = card(S.wc.id); const i = D.cards.indexOf(c); const was = Object.keys(D.focus).filter((k) => D.focus[k] === c.id); D.cards.splice(i, 1); was.forEach((k) => delete D.focus[k]); S.overlay = null; S.undo = () => { D.cards.splice(i, 0, c); was.forEach((k) => { D.focus[k] = c.id; }); render(); }; render(); return toast('Work Card deleted', true); }
      case 'team-filter': S.teamFilter = t.dataset.v; return render();
      case 'team-sort': S.teamSort = t.dataset.v; return render();
      case 'team-toggle': S.teamOpen[id] = !secOpen(id); return render();
      case 'team-select': S.teamSel = { person: t.dataset.person, project: id }; S.teamOpen[t.dataset.person] = true; S.insOpen = true; return render();
      case 'team-open': S.screen = 'board'; S.view = 'board'; S.insOpen = false; S.carryover = false; S.projFilter = null; render(); railJump('staff', id, true); return;
      case 'wc-toggle': S.expanded[id] = !S.expanded[id]; return render();
      case 'rail': return railJump(t.dataset.scope, t.dataset.key);
      case 'proj-tab': S.projTab = t.dataset.v; return render();
      case 'active-only': S.activeOnly = !S.activeOnly; return render();
      case 'proj-search': S.projSearchOpen = !S.projSearchOpen; if (!S.projSearchOpen) S.projSearch = ''; render(); if (S.projSearchOpen) document.getElementById('ps')?.focus(); return;
      case 'toggle-done': case 'mark-done': { const x = task(id); x.status = x.status === 'done' ? 'in_progress' : 'done'; return render(); }
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
  $app.addEventListener('submit', (e) => { if (e.target.id === 'wcf') { e.preventDefault(); saveWc(); } });
  // Jump rails: scroll the staff board or the project list to a person / letter.
  function railJump(scope, key, instant = false) {
    const win = document.getElementById('win'); let target; let sc;
    if (scope === 'staff') { target = win.querySelector(`.lane[data-person="${key}"]`); S.railStaff = key; sc = win.querySelector('.scroller[data-scroll="main"]'); }
    else { target = [...win.querySelectorAll('.proj')].find((e) => e.dataset.letter === key); S.railProj = key; sc = win.querySelector('.pp-list'); }
    if (!target || !sc) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    sc.scrollTo({ top: Math.max(0, target.offsetTop - 2), behavior: reduce || instant ? 'auto' : 'smooth' });
    win.querySelectorAll(`.rail button[data-scope="${scope}"]`).forEach((b) => (b.dataset.key === key ? b.setAttribute('aria-current', 'true') : b.removeAttribute('aria-current')));
  }
  $app.addEventListener('scroll', (e) => {   // keep the rail's highlight in step with what is at the top
    const sc = e.target; if (!(sc instanceof Element)) return;
    const staff = sc.matches('.scroller[data-scroll="main"]'); if (!staff && !sc.matches('.pp-list')) return;
    const els = [...sc.querySelectorAll(staff ? '.lane' : '.proj')]; let cur = null;
    els.forEach((el) => { if (el.offsetTop <= sc.scrollTop + 12) cur = staff ? el.dataset.person : el.dataset.letter; });
    if (!cur && els[0]) cur = staff ? els[0].dataset.person : els[0].dataset.letter;
    if (staff) S.railStaff = cur; else S.railProj = cur;
    sc.closest('.bp-body, .pp-body')?.querySelectorAll('.rail button').forEach((b) => (b.dataset.key === cur ? b.setAttribute('aria-current', 'true') : b.removeAttribute('aria-current')));
  }, true);
  function cardAct(id, v) {
    const c = card(id); const me = S.persona;
    if (v === 'start' || v === 'resume') { c.status = 'in_progress'; D.focus[me] = c.id; }
    else if (v === 'pause') c.status = 'paused';   // focus stays on the paused card, as in V1.3.1
    else if (v === 'focus') { D.focus[me] = c.id; }
    else if (v === 'stop') { c.status = 'todo'; if (D.focus[me] === c.id) delete D.focus[me]; }
    else if (v === 'complete') { c.status = 'done'; Object.keys(D.focus).forEach((k) => { if (D.focus[k] === c.id) delete D.focus[k]; }); }
    render(); toast({ start: 'Started — now Working on this', pause: 'Paused', resume: 'Resumed', focus: 'You’re now working on this card', stop: 'Stopped — back to To do', complete: 'Work Card completed' }[v]);
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
    if (e.target.id === 'ps') { S.projSearch = e.target.value; render(); return; }
    if (e.target.id === 'q') { S.q = e.target.value; S.qSel = 0; patchInner(document.getElementById('results'), resultsHTML()); }
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
      if (k === 'ArrowDown' || k === 'ArrowUp') { e.preventDefault(); const n = flatResults.length; if (n) { S.qSel = (S.qSel + (k === 'ArrowDown' ? 1 : -1) + n) % n; patchInner(document.getElementById('results'), resultsHTML()); document.querySelector('.res[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }); } }
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
    if (a && a.classList && a.classList.contains('srow') && !typing(a)) {
      if (k === 'ArrowDown' || k === 'ArrowUp') { const rows = [...document.querySelectorAll('.srow')]; const n = rows[rows.indexOf(a) + (k === 'ArrowDown' ? 1 : -1)]; if (n) { e.preventDefault(); S.teamSel = { person: n.dataset.person, project: n.dataset.id }; render(); document.querySelector(`[data-fk="${n.dataset.fk}"]`)?.focus(); } return; }
      if (k === 'Enter' || k === ' ') { e.preventDefault(); S.teamSel = { person: a.dataset.person, project: a.dataset.id }; S.insOpen = true; render(); document.querySelector(`[data-fk="${a.dataset.fk}"]`)?.focus(); return; }
    }
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
