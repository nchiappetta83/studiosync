const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class ExportEngine {
  constructor(db) {
    this.db = db;
  }

  /**
   * Build a short hash for change detection in the HTML export.
   */
  _hash(str) {
    return crypto.createHash('md5').update(str).digest('hex').slice(0, 10);
  }

  _esc(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /**
   * Get the Monday–Friday date range string for the current week.
   */
  _weekRange() {
    const now = new Date();
    const day = now.getDay();
    const mon = new Date(now);
    mon.setDate(now.getDate() - ((day + 6) % 7));
    const fri = new Date(mon);
    fri.setDate(mon.getDate() + 4);

    const fmt = (d) => {
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return `${months[d.getMonth()]} ${d.getDate()}`;
    };

    return `Week of ${fmt(mon)}–${fmt(fri)}, ${fri.getFullYear()}`;
  }

  /**
   * Get initials from a display name.
   */
  _initials(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  /**
   * Shorten a display name: "John Smith" → "John S."
   */
  _shortName(name) {
    if (!name) return '';
    const parts = name.trim().split(/\s+/);
    if (parts.length <= 1) return name;
    return parts[0] + ' ' + parts.slice(1).map(p => p[0] + '.').join(' ');
  }

  /**
   * Get partner initials for a task (by partner_id on the task).
   */
  _getPartnerBadge(task, usersById, projectsById) {
    const project = task.project_id ? projectsById[task.project_id] : null;
    if (project?.partner_initials) return project.partner_initials;

    const partnerId = task.partner_id || project?.partner_id;
    if (!partnerId) return '';
    const partner = usersById[partnerId];
    if (!partner) return '';
    return this._initials(partner.display_name);
  }

  /**
   * Priority pill background/text colors (V4 convention).
   */
  _priorityStyle(priority) {
    const map = {
      1: { bg: '#FBE8E8', color: '#D95F5F' },
      2: { bg: '#FBEEE0', color: '#D4883A' },
      3: { bg: '#E0F5ED', color: '#2EAD7F' },
      4: { bg: '#E0EDF7', color: '#4880C8' }
    };
    return map[priority] || { bg: '#F2F4F6', color: '#94A3AF' };
  }

  /**
   * Show weekday names for dates in the current Monday-Sunday week.
   */
  _formatDueDisplay(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;

    const date = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    if (date >= weekStart && date <= weekEnd) {
      return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][date.getDay()];
    }

    return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
  }

  /**
   * Sort tasks using V4 convention: confirmed first, then priority 1→2→3→4→unset→W, then sort_order.
   */
  _sortTasks(tasks) {
    const sortKey = (p) => {
      if (p >= 1 && p <= 4) return p;
      if (p === -2) return 50;   // custom priorities after numbered
      if (p === 0 || p === null || p === undefined) return 100;
      if (p === -1) return 200;  // W always last
      return 150;
    };
    return [...tasks].sort((a, b) => {
      // Confirmed first
      const confA = a.confirmed ?? 1;
      const confB = b.confirmed ?? 1;
      if (confB !== confA) return confB - confA;
      // Priority
      const pa = sortKey(a.priority);
      const pb = sortKey(b.priority);
      if (pa !== pb) return pa - pb;
      // Sort order
      return (a.sort_order || 0) - (b.sort_order || 0);
    });
  }

  exportHTML(filePath, options = {}) {
    const reloadInterval = (options.reloadInterval || 60) * 1000;
    const users = this.db.getUsers();
    const allTasks = this.db.getTasks();
    const projects = this.db.getProjects();
    const pto = this.db.getPTO();
    const roles = this.db.getBusinessRoles();

    // Build lookup maps
    const usersById = {};
    for (const u of users) usersById[u.id] = u;

    const rolesById = {};
    for (const r of roles) rolesById[r.id] = r;

    const projectsById = {};
    for (const project of projects) projectsById[project.id] = project;

    // Group tasks by assigned user
    const tasksByUser = {};
    for (const u of users) tasksByUser[u.id] = [];
    for (const t of allTasks) {
      if (tasksByUser[t.assigned_to]) tasksByUser[t.assigned_to].push(t);
    }

    // PTO map
    const ptoByUser = {};
    for (const p of pto) ptoByUser[p.user_id] = p.label;

    const weekRange = this._weekRange();
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const totalTasks = allTasks.length;
    const staffCount = users.filter(u => u.role === 'staff').length;

    // Build staff sections
    let staffHtml = '';
    const filterOptions = [`<option value="__all__" selected>All Staff</option>`];

    for (const user of users) {
      const userTasks = this._sortTasks(tasksByUser[user.id] || []);
      const roleName = user.business_role_id ? (rolesById[user.business_role_id]?.name || '') : '';
      const ptoLabel = ptoByUser[user.id];
      const shortName = this._shortName(user.display_name);
      const initials = this._initials(user.display_name);
      const taskCount = userTasks.length;

      filterOptions.push(
        `<option value="${this._esc(user.display_name)}">${this._esc(shortName)} (${taskCount})</option>`
      );

      const ptoBadgeHtml = ptoLabel
        ? `<span class="pto-badge">${this._esc(ptoLabel)}</span>`
        : '';

      let tasksHtml = '';
      if (taskCount === 0) {
        tasksHtml = '<div class="empty-tasks">No tasks assigned</div>';
      } else {
        for (const task of userTasks) {
          let ps = this._priorityStyle(task.priority);
          if (task.priority === -2 && task.priority_label) {
            const cpLabel = task.priority_label.replace(/^cp:/, '');
            const cpDef = this.db.getCustomPriorities().find(p => p.label === cpLabel);
            if (cpDef) ps = { bg: cpDef.color + '18', color: cpDef.color };
          }
          let priorityLabel = '—';
          if (task.priority === -2 && task.priority_label) {
            priorityLabel = task.priority_label.replace(/^cp:/, '');
          } else if (task.priority === -1) {
            priorityLabel = 'W';
          } else if (task.priority && task.priority > 0) {
            priorityLabel = String(task.priority);
          }
          const dueStr = task.due_date ? this._formatDueDisplay(task.due_date) : '';
          const partnerBadge = this._getPartnerBadge(task, usersById, projectsById);
          const hashStr = this._hash(user.id + task.title + task.priority + task.due_date + task.notes);
          const unconfirmedClass = (task.confirmed === 0) ? ' unconfirmed' : '';

          // Header right: due badge + partner badge
          let headerRight = '';
          if (dueStr) headerRight += `<span class="due-badge">${this._esc(dueStr)}</span>`;
          if (partnerBadge) headerRight += `<span class="partner-badge">${this._esc(partnerBadge)}</span>`;

          tasksHtml += `<div class="task-card${unconfirmedClass}" data-hash="${hashStr}">
                        <div class="card-header">
                            <span class="priority-pill" style="background:${ps.bg};color:${ps.color};">${priorityLabel}</span>
                            <div class="card-header-right">${headerRight}</div>
                        </div>
                        <div class="card-body">
                            <div class="card-section">
                                <span class="card-section-label">Project</span>
                                <div class="card-name">${this._esc(task.title)}</div>
                            </div>
                            <div class="card-divider"></div>
                        <div class="card-section">
                            <span class="card-section-label">Notes</span>
                            <div class="card-notes">${task.notes ? this._esc(task.notes) : '<span class="notes-empty">&mdash;</span>'}</div>
                        </div>
                        </div>
                        <div class="strike-line"></div>
                    </div>`;
        }
      }

      staffHtml += `<div class="staff-section" data-staff="${this._esc(user.display_name)}">
                <div class="staff-header">
                    <div class="avatar" style="background:${user.avatar_color || '#5856A6'}">${initials}</div>
                    <div class="staff-info">
                        <span class="staff-name">${this._esc(shortName)}</span>
                        ${roleName ? `<span class="role-label">${this._esc(roleName)}</span>` : ''}
                    </div>
                    <div class="header-right">
                        <span class="task-count">${taskCount} task${taskCount !== 1 ? 's' : ''}</span>
                        ${ptoBadgeHtml}
                    </div>
                </div>
                <div class="tasks-container">${tasksHtml}</div>
            </div>`;
    }

    const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
<meta http-equiv="Pragma" content="no-cache">
<meta http-equiv="Expires" content="0">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>StudioSync - ${this._esc(weekRange)}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Inter', -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif;
  background: #F0F2F5; color: #1A2328; min-height: 100vh; }

/* ---- Top bar ---- */
.top-bar { background: #2A3439; color: #E8ECF0; padding: 16px 32px;
  display: flex; align-items: center; justify-content: space-between;
  position: sticky; top: 0; z-index: 100; box-shadow: 0 2px 8px rgba(0,0,0,0.15); }
.top-bar h1 { font-size: 18px; font-weight: 800; letter-spacing: 0.5px; }
.top-bar .week { font-size: 13px; color: #8A9AA6; margin-left: 16px; }
.top-bar .right { display: flex; align-items: center; gap: 16px; }
.top-bar .stats { font-size: 12px; color: #8A9AA6; }
.top-bar .updated { font-size: 11px; color: #5C6B75; }

/* ---- Filter bar ---- */
.filter-bar { background: #FFFFFF; border-bottom: 1px solid #E4EAF0;
  padding: 12px 32px; display: flex; align-items: center; gap: 12px;
  position: sticky; top: 56px; z-index: 99; }
.filter-bar label { font-size: 12px; font-weight: 600; color: #5C6B75;
  text-transform: uppercase; letter-spacing: 0.5px; }
.filter-select { font-family: inherit; font-size: 14px; padding: 6px 12px;
  border: 1px solid #D8DEE4; border-radius: 8px; background: #FAFBFC;
  color: #2A3439; min-width: 220px; cursor: pointer;
  transition: border-color 0.15s; }
.filter-select:focus { outline: none; border-color: #4D4AD5; }
.hint { font-size: 11px; color: #94A3AF; margin-left: auto; }

/* ---- Content ---- */
.content { max-width: 1400px; margin: 0 auto; padding: 24px 32px 80px; }

/* ---- Staff section ---- */
.staff-section { background: #FFFFFF; border-radius: 12px; margin-bottom: 16px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.06); overflow: hidden;
  transition: opacity 0.2s; }
.staff-section.hidden { display: none; }
.staff-header { display: flex; align-items: center; gap: 12px;
  padding: 14px 20px; border-bottom: 1px solid #F0F4F7; }
.avatar { width: 34px; height: 34px; border-radius: 10px; display: flex;
  align-items: center; justify-content: center; color: #FFF;
  font-size: 12px; font-weight: 700; flex-shrink: 0; }
.staff-info { flex: 1; min-width: 0; }
.staff-name { font-size: 15px; font-weight: 700; display: block; }
.role-label { font-size: 11px; color: #94A3AF; font-weight: 500; }
.header-right { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
.task-count { font-size: 12px; color: #94A3AF; font-weight: 500; }
.pto-badge { background: #FDF0E0; color: #D4883A; font-size: 11px;
  font-weight: 700; padding: 3px 10px; border-radius: 6px; }

/* ---- Task card grid ---- */
.tasks-container { padding: 12px; display: grid;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 10px; }
.task-card { position: relative; background: #FFFFFF; border: 1px solid #E4EAF0;
  border-radius: 10px; cursor: pointer; transition: all 0.2s;
  user-select: none; overflow: hidden; display: flex; flex-direction: column; }
.task-card.unconfirmed { opacity: 0.6; }
.task-card:hover { transform: translateY(-1px); box-shadow: 0 3px 10px rgba(0,0,0,0.08); }
.task-card .strike-line { position: absolute; left: 14px; right: 14px; top: 50%;
  height: 2px; background: #D95F5F; transform: scaleX(0); transform-origin: left;
  transition: transform 0.3s ease; pointer-events: none; border-radius: 1px; }
.task-card.struck .strike-line { transform: scaleX(1); }
.task-card.struck { opacity: 0.3; }

/* Card header */
.card-header { display: flex; align-items: center; justify-content: space-between;
  padding: 6px 12px; background: #F5F7FA; border-bottom: 1px solid #E4EAF0; }
.priority-pill { font-size: 11px; font-weight: 700; padding: 3px 10px;
  border-radius: 10px; flex-shrink: 0; text-align: center; min-width: 28px; }
.card-header-right { display: flex; gap: 5px; align-items: center; flex-wrap: wrap;
  justify-content: flex-end; }

/* Card body */
.card-body { padding: 12px 14px 14px; flex: 1; display: flex; flex-direction: column; }
.card-section { }
.card-section-label { font-size: 9px; font-weight: 700; color: #94A3AF;
  text-transform: uppercase; letter-spacing: 0.8px; display: block; margin-bottom: 3px; }
.card-name { font-size: 14px; font-weight: 600; line-height: 1.35; color: #1A2328;
  overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2;
  -webkit-box-orient: vertical; word-break: break-word; }
.card-divider { height: 1px; background: #E4EAF0; margin: 10px 0; }
.card-notes { font-size: 13px; color: #5C6B75; line-height: 1.4;
  overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3;
  -webkit-box-orient: vertical; }
.notes-empty { color: #C8CED4; }

/* Badges */
.due-badge { font-size: 10px; color: #94A3AF; background: rgba(0,0,0,0.05);
  padding: 2px 7px; border-radius: 4px; white-space: nowrap; }
.partner-badge { font-size: 10px; color: #5C6B75; background: rgba(0,0,0,0.06);
  padding: 2px 7px; border-radius: 4px; font-weight: 600; white-space: nowrap; }
.empty-tasks { font-size: 13px; color: #B0B8C0; font-style: italic;
  padding: 16px 8px; text-align: center; grid-column: 1 / -1; }

/* Change highlight */
.task-card.changed { border-color: #D95F5F !important;
  box-shadow: 0 0 0 2px rgba(217,95,95,0.25); }
.task-card.changed::after { content: ''; position: absolute; top: 42px; right: 8px;
  width: 7px; height: 7px; border-radius: 50%; background: #D95F5F;
  animation: pulse-dot 2s ease-in-out infinite; }
@keyframes pulse-dot { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

/* ---- Print ---- */
@media print {
  .top-bar, .filter-bar { position: static; }
  .task-card { cursor: default; break-inside: avoid; }
  .task-card:hover { transform: none; box-shadow: none; }
  .hint { display: none; }
  .content { max-width: none; padding: 0; }
  .staff-section { box-shadow: none; break-inside: avoid; }
  .tasks-container { grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); }
}
</style></head><body>

<div class="top-bar">
  <div style="display:flex;align-items:baseline;">
    <h1>STUDIOSYNC</h1>
    <span class="week">${this._esc(weekRange)}</span>
  </div>
  <div class="right">
    <span class="stats">${totalTasks} tasks &middot; ${staffCount} staff</span>
    <span class="updated">Updated ${timeStr}</span>
  </div>
</div>

<div class="filter-bar">
  <label for="staff-filter">View</label>
  <select id="staff-filter" class="filter-select" onchange="filterStaff(this.value)">
    ${filterOptions.join('\n')}
  </select>
  <span class="hint">Click a task to strike through</span>
</div>

<div class="content" id="content">
${staffHtml}
</div>

<script>
/* ---- Staff filter ---- */
function filterStaff(val) {
  document.querySelectorAll('.staff-section').forEach(function(sec) {
    if (val === '__all__') { sec.classList.remove('hidden'); }
    else { sec.classList.toggle('hidden', sec.dataset.staff !== val); }
  });
  localStorage.setItem('sd_filter', val);
}
/* Restore filter on load */
(function() {
  var saved = localStorage.getItem('sd_filter');
  if (saved && saved !== '__all__') {
    var sel = document.getElementById('staff-filter');
    if (sel) { sel.value = saved; filterStaff(saved); }
  }
})();

/* ---- Strike-through with persistence ---- */
function getTaskKey(card) {
  var section = card.closest('.staff-section');
  var staff = section ? section.querySelector('.staff-name').textContent.trim() : 'unknown';
  var task = card.querySelector('.card-name').textContent.trim();
  return 'struck::' + staff + '::' + task;
}
document.querySelectorAll('.task-card').forEach(function(card) {
  var key = getTaskKey(card);
  if (localStorage.getItem(key) === '1') { card.classList.add('struck'); }
  card.addEventListener('click', function() {
    var k = getTaskKey(card);
    if (card.classList.toggle('struck')) { localStorage.setItem(k, '1'); }
    else { localStorage.removeItem(k); }
  });
});

/* ---- Change detection — highlight new/modified tasks ---- */
(function() {
  var STORAGE_KEY = 'sd_task_hashes';
  var prev = {};
  try { prev = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch(e) {}
  var current = {};
  document.querySelectorAll('.staff-section').forEach(function(sec) {
    var staff = sec.dataset.staff;
    sec.querySelectorAll('.task-card').forEach(function(card, i) {
      var k = staff + '::' + i;
      var h = card.dataset.hash;
      current[k] = h;
      if (prev[k] !== undefined && prev[k] !== h) {
        card.classList.add('changed');
      } else if (prev[k] === undefined && Object.keys(prev).length > 0) {
        card.classList.add('changed');
      }
    });
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  /* Auto-clear highlights after 3 minutes */
  setTimeout(function() {
    document.querySelectorAll('.task-card.changed').forEach(function(c) {
      c.classList.remove('changed');
    });
  }, 180000);
})();

/* ---- Auto-reload ---- */
setTimeout(function() { location.reload(); }, ${reloadInterval});
<\/script>

</body></html>`;

    fs.writeFileSync(filePath, html, 'utf-8');
    return filePath;
  }

  exportPDF(filePath) {
    const htmlPath = filePath.replace(/\.pdf$/, '.html');
    this.exportHTML(htmlPath);
    return htmlPath;
  }
}

module.exports = ExportEngine;
