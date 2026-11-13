/* StudioSync V2 — Phase 1, round 2 mockup data.
   Entirely fictional. Field names and meanings follow the V1.3 baseline
   (fixtures/v1.3-baseline): tasks carry priority / due / status / lead and NO hours;
   Work Cards carry planned_minutes, optional dates, status, logged_hours.
   Office capacity targets mirror V1.3 MyTasks defaults (8 h/day, 40 h/week). */

const DATA = (() => {
  const TODAY = '2026-11-10';           // Tuesday (matches fixture event timestamps)
  const WEEK_OF = '2026-11-09';         // Monday
  const DAYS = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13'];
  const CAPACITY = { day: 8, week: 40 };

  const people = [
    { id: 'morgan', name: 'Morgan Ellis', init: 'ME', role: 'Partner', lane: false, color: '#3d5a80' },
    { id: 'avery', name: 'Avery Rivera', init: 'AR', role: 'Designer', lane: true, color: '#2f6f68' },
    { id: 'blair', name: 'Blair Jordan', init: 'BJ', role: 'Designer', lane: true, color: '#8a4f66' },
    { id: 'riley', name: 'Riley Chen', init: 'RC', role: 'Senior staff', lane: true, color: '#5b50a0' },
    { id: 'casey', name: 'Casey Morales', init: 'CM', role: 'Designer', lane: true, color: '#9a4b1f' },
    { id: 'devon', name: 'Devon Park', init: 'DP', role: 'Drafter', lane: true, color: '#3d6a9a' },
    { id: 'emery', name: 'Emery Walsh', init: 'EW', role: 'Designer', lane: true, color: '#6b6b1f' },
    { id: 'finley', name: 'Finley Shah', init: 'FS', role: 'Designer', lane: true, color: '#7a3f8f' },
    { id: 'gray', name: 'Gray Okafor', init: 'GO', role: 'Drafter', lane: true, color: '#2f7a4a' },
    { id: 'harper', name: 'Harper Lind', init: 'HL', role: 'Designer', lane: true, color: '#a0392f' },
    { id: 'indigo', name: 'Indigo Reyes', init: 'IR', role: 'Drafter', lane: true, color: '#486581' },
    { id: 'jules', name: 'Jules Bennett', init: 'JB', role: 'Designer', lane: true, color: '#7d4a17' },
  ];
  const pto = { gray: ['2026-11-11', '2026-11-12'] };

  const projectSeed = [
    ['harbor', 'Harbor Point Residences', 'Harbor Point Development', 'current'],
    ['maple', 'Maple Commons', 'Maple Civic Partners', 'current'],
    ['cedar', 'Cedar Row Lofts', 'Cedar Row Group', 'current'],
    ['juniper', 'Juniper Court', 'Juniper Housing Trust', 'current'],
    ['lakeside', 'Lakeside Pavilion', 'Lakeside Parks Board', 'current'],
    ['northgate', 'Northgate Library', 'Northgate Library District', 'current'],
    ['orchard', 'Orchard Hill Townhomes', 'Orchard Hill Builders', 'current'],
    ['pine', 'Pine Street Clinic', 'Pine Street Health', 'current'],
    ['quarry', 'Quarry Bend Hotel', 'Quarry Hospitality', 'current'],
    ['riverside', 'Riverside Annex', 'Riverside Realty', 'current'],
    ['stonebridge', 'Stonebridge School', 'Stonebridge Schools', 'current'],
    ['tidewater', 'Tidewater Offices', 'Tidewater Capital', 'current'],
    ['union', 'Union Square Retail', 'Union Square Partners', 'current'],
    ['vista', 'Vista Ridge Senior Living', 'Vista Care Group', 'current'],
    ['summit', 'Summit Terrace', 'Summit Holdings', 'future'],
    ['willow', 'Willow Creek Community Center', 'Willow Creek Council', 'future'],
    ['alder', 'Alder Park Pavilion', 'Alder Parks Board', 'future'],
    ['beacon', 'Beacon Hill Fire Station', 'Beacon Hill Township', 'future'],
    ['copper', 'Copper Mill Flats', 'Copper Mill Developers', 'future'],
    ['dunmore', 'Dunmore Civic Hall', 'Dunmore Municipality', 'future'],
  ];
  const projects = projectSeed.map(([id, name, client, category], i) => ({
    id, name, client, category, partner: 'morgan', lead: i % 3 === 0 ? 'riley' : 'riley',
    folder: `C:\\Fictional Studio\\${name}`,
  }));

  // ---- deterministic pseudo-random so the mockup is stable between loads ----
  let seed = 11;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

  const taskTitles = ['unit plan coordination', 'drawing QA', 'permit response', 'code review markups', 'RFI log',
    'detail sheets', 'submittal review', 'consultant coordination', 'field survey notes', 'presentation set',
    'door schedule', 'egress diagrams', 'spec section edits', 'client markup pass'];

  const tasks = [
    { id: 't1', project: 'harbor', person: 'avery', title: 'Unit plan coordination', prio: 1, status: 'not_started', due: '2026-11-12', lead: 'riley',
      notes: 'Coordinate the fictional unit-plan update for Harbor Point.',
      actions: [{ t: 'Incorporate client markups', done: false }], comments: [{ who: 'morgan', at: 'Tue 9:14 AM', text: 'Please use the latest fictional client markup set.' }] },
    { id: 't2', project: 'harbor', person: 'blair', title: 'Drawing QA', prio: -1, status: 'in_progress', due: '2026-11-14', lead: 'riley',
      notes: '', actions: [], comments: [{ who: 'riley', at: 'Mon 4:40 PM', text: 'Holding until the client responds on unit count.' }] },
    { id: 't3', project: 'maple', person: 'avery', title: 'Permit response', prio: 2, status: 'in_progress', due: '2026-11-13', lead: 'riley',
      notes: 'Respond to permit review comments.', actions: [{ t: 'Draft comment responses', done: true }, { t: 'Update sheet index', done: false }], comments: [] },
    { id: 't4', project: 'maple', person: 'blair', title: 'Survey reconciliation', prio: 3, status: 'done', due: '2026-11-11', lead: 'riley',
      notes: '', actions: [], comments: [] },
  ];
  const staff = people.filter((p) => p.lane);
  const prioPool = [1, 2, 2, 3, 3, 3, 4, -1];
  const currentIds = projects.filter((p) => p.category === 'current').map((p) => p.id);
  const dueChoices = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-12', '2026-11-13', '2026-11-13', '2026-11-14'];
  let tn = 5;
  staff.forEach((p) => {
    if (p.id === 'devon') {                    // Devon: everything done -> "No projects"
      for (let i = 0; i < 2; i++) tasks.push({ id: 't' + tn++, project: pick(currentIds), person: p.id, title: cap(pick(taskTitles)), prio: 3, status: 'done', due: '2026-11-09', lead: 'riley', notes: '', actions: [], comments: [] });
      return;
    }
    const n = p.id === 'avery' || p.id === 'blair' ? 1 : 3 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) {
      tasks.push({ id: 't' + tn++, project: pick(currentIds), person: p.id, title: cap(pick(taskTitles)), prio: pick(prioPool),
        status: rnd() > 0.55 ? 'in_progress' : 'not_started', due: pick(dueChoices), lead: 'riley',
        notes: '', actions: rnd() > 0.7 ? [{ t: 'Follow up with consultant', done: false }] : [], comments: rnd() > 0.8 ? [{ who: 'riley', at: 'Mon 2:05 PM', text: 'Please confirm scope before issuing.' }] : [] });
    }
  });
  // Carried-over tasks from last week: need an explicit Keep / Delete decision.
  ['t6', 't9', 't13', 't17', 't21', 't26'].forEach((id) => { const t = tasks.find((x) => x.id === id); if (t && t.person !== 'devon') { t.carry = true; if (t.status === 'done') t.status = 'not_started'; } });
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  // ---- Work Cards (shared project work, week of Nov 9) ----
  const cards = [];
  let cn = 1;
  const card = (project, title, assignees, min, start, end, status, logged = 0, extra = {}) =>
    cards.push({ id: 'c' + cn++, project, week: WEEK_OF, title, assignees, min, start, end, status, logged, lead: 'riley', desc: '', ...extra });

  card('harbor', 'Update layout overlay', ['avery', 'blair'], 240, '2026-11-10', '2026-11-12', 'in_progress', 2.5, { desc: 'Fictional coordination card.' });
  card('harbor', 'Run drawing QA', ['blair'], 90, null, null, 'todo');
  card('harbor', 'Confirm unit count', ['avery'], 60, '2026-11-09', '2026-11-09', 'done', 1);
  card('maple', 'Permit comment responses', ['avery'], 360, '2026-11-11', '2026-11-13', 'todo');
  card('maple', 'Survey reconciliation', ['blair'], 180, '2026-11-09', '2026-11-10', 'done', 3);
  card('maple', 'Site photo log', ['emery'], 120, '2026-11-10', '2026-11-11', 'in_progress', 1);
  card('summit', 'Massing options', ['riley'], 300, '2026-11-12', '2026-11-13', 'todo');
  card('cedar', 'Detail sheets', ['blair'], 1200, '2026-11-09', '2026-11-13', 'in_progress', 8);
  card('juniper', 'RFI log', ['blair'], 960, '2026-11-10', '2026-11-13', 'todo');
  card('lakeside', 'Submittal review', ['blair'], 600, null, null, 'paused', 3);
  card('cedar', 'Door schedule', ['avery'], 840, '2026-11-09', '2026-11-13', 'in_progress', 5);
  card('lakeside', 'Wayfinding mockups', ['avery'], 120, null, null, 'todo');
  card('northgate', 'Team review prep', ['riley'], 120, '2026-11-11', '2026-11-11', 'todo');
  // Remaining staff: generated card sets that land on each load state.
  const sets = {
    emery: [600, 720, 480],      // 30 h  On target
    finley: [900, 900, 600],     // 40 h  On target (at 100%)
    gray: [420, 360, 300],       // 18 h  Available
    harper: [720, 600],          // 22 h  On target
    indigo: [1200, 960],         // 36 h  On target
    jules: [1200, 900, 360],     // 41 h  Over capacity
  };
  const cardTitles = ['Plan set markups', 'Finish schedule', 'Consultant overlay', 'Spec review', 'Elevation revisions', 'Code summary'];
  Object.entries(sets).forEach(([pid, mins]) => {
    mins.forEach((m, i) => {
      const proj = currentIds[(pid.length * 3 + i * 4) % currentIds.length];
      const dated = i !== mins.length - 1 || pid === 'finley';
      const s = dated ? DAYS[(i * 2) % 3] : null;
      const e = dated ? DAYS[Math.min(4, (i * 2) % 3 + 1 + (i % 2))] : null;
      card(proj, cardTitles[(pid.length + i) % cardTitles.length], [pid], m, s, e, i === 0 ? 'in_progress' : 'todo', i === 0 ? 2 : 0);
    });
  });
  const focus = { avery: 'c1', blair: 'c8' };   // personal "Work on this" selections

  const privateTasks = [
    { id: 'p1', title: 'Review partner meeting agenda', due: '2026-11-11' },
    { id: 'p2', title: 'Draft staff review notes (private)', due: null },
  ];

  const activity = {
    t1: [{ at: 'Tue 9:14 AM', text: 'Morgan Ellis commented' }, { at: 'Tue 9:10 AM', text: 'Morgan Ellis assigned this to Avery Rivera' }],
    t2: [{ at: 'Mon 4:40 PM', text: 'Riley Chen set priority to Waiting' }],
  };

  return { TODAY, WEEK_OF, DAYS, CAPACITY, people, pto, projects, tasks, cards, focus, privateTasks, activity };
})();
