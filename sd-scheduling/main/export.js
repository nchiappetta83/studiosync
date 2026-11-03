const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  PRIORITY_NONE,
  PRIORITY_WAIT,
  PRIORITY_CUSTOM,
  getCustomPriorityLabel,
} = require('./priority');

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

  _safeAvatarColor(value) {
    return typeof value === 'string' && /^#[0-9A-Fa-f]{6}(?:[0-9A-Fa-f]{2})?$/.test(value)
      ? value.toUpperCase()
      : '#5856A6';
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

    return `Week of ${fmt(mon)} - ${fmt(fri)}, ${fri.getFullYear()}`;
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

  _getTaskDisplayTitle(task, projectsById) {
    const project = task.project_id ? projectsById[task.project_id] : null;
    if (project) {
      return project.client ? `${project.client} | ${project.name}` : (project.name || '');
    }

    const rawTitle = String(task.title || '').trim();
    if (rawTitle.includes('|')) {
      return rawTitle
        .split('|')
        .map((part) => part.trim())
        .filter(Boolean)
        .join(' | ');
    }
    return rawTitle.replace(/\s+[-\u2013\u2014]\s+/, ' | ');
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

    const dayOfWeek = today.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() + mondayOffset);
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
    const staffUsers = users.filter(user => user.role === 'staff');
    const staffUserIds = new Set(staffUsers.map(user => user.id));
    const allTasks = this.db.getTasks();
    const staffTasks = allTasks.filter(task => staffUserIds.has(task.assigned_to));
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
    for (const u of staffUsers) tasksByUser[u.id] = [];
    for (const t of staffTasks) {
      if (tasksByUser[t.assigned_to]) tasksByUser[t.assigned_to].push(t);
    }

    // PTO map
    const ptoByUser = {};
    for (const p of pto) ptoByUser[p.user_id] = p.label;

    const weekRange = this._weekRange();
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const totalTasks = staffTasks.length;
    const staffCount = staffUsers.length;

    // Build staff sections
    let staffHtml = '';
    const filterOptions = [`<option value="__all__" selected>All Staff</option>`];

    for (const user of staffUsers) {
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
      let printRowsHtml = '';
      if (taskCount === 0) {
        tasksHtml = '<div class="empty-tasks">No tasks assigned</div>';
      } else {
        for (const task of userTasks) {
          let ps = this._priorityStyle(task.priority);
          if (task.priority === PRIORITY_CUSTOM && task.priority_label) {
            const cpLabel = getCustomPriorityLabel(task.priority_label);
            const cpDef = this.db.getCustomPriorities().find(p => p.label === cpLabel);
            if (cpDef) ps = { bg: cpDef.color + '18', color: cpDef.color };
          }
          let priorityLabel = '-';
          if (task.priority === PRIORITY_CUSTOM && task.priority_label) {
            priorityLabel = getCustomPriorityLabel(task.priority_label);
          } else if (task.priority === PRIORITY_WAIT) {
            priorityLabel = 'W';
          } else if (task.priority !== PRIORITY_NONE && task.priority > 0) {
            priorityLabel = String(task.priority);
          }
          const dueStr = task.due_date ? this._formatDueDisplay(task.due_date) : '';
          const partnerBadge = this._getPartnerBadge(task, usersById, projectsById);
          const displayTitle = this._getTaskDisplayTitle(task, projectsById);
          const hashStr = this._hash(user.id + displayTitle + task.priority + task.due_date + task.notes);
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
                                <div class="card-name">${this._esc(displayTitle)}</div>
                            </div>
                            <div class="card-divider"></div>
                        <div class="card-section">
                            <span class="card-section-label">Notes</span>
                            <div class="card-notes">${task.notes ? this._esc(task.notes) : '<span class="notes-empty">-</span>'}</div>
                        </div>
                        </div>
                        <div class="strike-line"></div>
                    </div>`;

          printRowsHtml += `<tr class="${unconfirmedClass ? 'print-row-unconfirmed' : ''}">
                    <td class="print-priority-cell"><span class="print-priority" style="background:${ps.bg};color:${ps.color};">${this._esc(priorityLabel)}</span></td>
                    <td class="print-project-cell">${this._esc(displayTitle)}</td>
                    <td class="print-due-cell">${dueStr ? this._esc(dueStr) : '<span class="print-empty">-</span>'}</td>
                    <td class="print-partner-cell">${partnerBadge ? `<span class="print-partner">${this._esc(partnerBadge)}</span>` : '<span class="print-empty">-</span>'}</td>
                    <td class="print-notes-cell">${task.notes ? this._esc(task.notes) : '<span class="print-empty">-</span>'}</td>
                </tr>`;
        }
      }

      staffHtml += `<section class="staff-section${taskCount === 0 ? ' empty' : ''}" data-staff="${this._esc(user.display_name)}">
                <div class="staff-header">
                    <div class="avatar" style="background:${this._safeAvatarColor(user.avatar_color)}">${initials}</div>
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
                <table class="print-task-table" aria-label="${this._esc(shortName)} task schedule">
                    <colgroup>
                        <col class="print-col-priority">
                        <col class="print-col-project">
                        <col class="print-col-due">
                        <col class="print-col-partner">
                        <col class="print-col-notes">
                    </colgroup>
                    <thead>
                        <tr class="print-staff-heading"><th colspan="5">
                            <div class="print-staff-header">
                                <span class="print-avatar" style="background:${this._safeAvatarColor(user.avatar_color)}">${initials}</span>
                                <span class="print-staff-copy">
                                    <span class="print-staff-name">${this._esc(shortName)}</span>
                                    ${roleName ? `<span class="print-role-label">${this._esc(roleName)}</span>` : ''}
                                </span>
                                <span class="print-staff-meta">
                                    <span>${taskCount} task${taskCount !== 1 ? 's' : ''}</span>
                                    ${ptoBadgeHtml}
                                </span>
                            </div>
                        </th></tr>
                        <tr class="print-column-heading"><th>Priority</th><th>Project</th><th>Due</th><th>Partner</th><th>Notes</th></tr>
                    </thead>
                    <tbody>${printRowsHtml}</tbody>
                </table>
            </section>`;
    }

    const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
<meta http-equiv="Pragma" content="no-cache">
<meta http-equiv="Expires" content="0">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>StudioSync - ${this._esc(weekRange)}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Rubik:wght@500;600;700&family=Source+Sans+3:wght@400;500;600;700&display=swap');
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Source Sans 3', 'Segoe UI Variable Text', 'Segoe UI', sans-serif;
  background: #F4F7F8; color: #17242B; min-height: 100vh; }

/* ---- Top bar ---- */
.top-bar { background: #29353B; color: #FFFFFF; position: sticky; top: 0;
  z-index: 100; border-bottom: 1px solid #1F292E; }
.top-bar-inner { width: min(100%, 1440px); min-height: 58px; margin: 0 auto;
  padding: 0 28px; display: flex; align-items: center; justify-content: space-between; gap: 24px; }
.brand-lockup { display: flex; align-items: center; gap: 11px; min-width: 0; }
.brand-mark { width: 30px; height: 30px; border-radius: 6px; background: #FFFFFF;
  color: #29353B; display: grid; place-items: center; font-family: 'Rubik', sans-serif;
  font-size: 12px; font-weight: 700; flex: 0 0 auto; }
.brand-copy { display: flex; flex-direction: column; min-width: 0; }
.top-bar h1 { font-family: 'Rubik', 'Segoe UI', sans-serif; font-size: 15px;
  line-height: 1.1; font-weight: 700; letter-spacing: 0; }
.product-label { color: #AFC0C9; font-size: 10px; font-weight: 700;
  line-height: 1.2; text-transform: uppercase; letter-spacing: 0.7px; }
.top-bar .week { font-size: 13px; color: #D8E1E5; padding-left: 18px;
  border-left: 1px solid #4A575D; white-space: nowrap; }
.top-bar .right { display: flex; align-items: center; gap: 0; flex-shrink: 0; }
.top-bar .stats, .top-bar .updated { font-size: 11px; color: #CBD5DA;
  padding: 0 13px; white-space: nowrap; }
.top-bar .updated { color: #91A3AC; border-left: 1px solid #4A575D; padding-right: 0; }

/* ---- Filter bar ---- */
.filter-bar { background: #FFFFFF; border-bottom: 1px solid #DDE5E9;
  position: sticky; top: 58px; z-index: 99; }
.filter-inner { width: min(100%, 1440px); min-height: 52px; margin: 0 auto;
  padding: 0 28px; display: flex; align-items: center; gap: 12px; }
.filter-bar label { font-size: 12px; font-weight: 600; color: #5C6B75;
  text-transform: uppercase; letter-spacing: 0.6px; }
.filter-select { font-family: inherit; font-size: 13px; font-weight: 600; padding: 7px 34px 7px 11px;
  border: 1px solid #CFD9DE; border-radius: 5px; background: #FFFFFF;
  color: #29353B; min-width: 220px; cursor: pointer; transition: border-color 0.15s, box-shadow 0.15s; }
.filter-select:focus { outline: none; border-color: #4D4AD5;
  box-shadow: 0 0 0 3px rgba(77,74,213,0.12); }
.hint { font-size: 11px; color: #83949D; margin-left: auto; }

/* ---- Content ---- */
.content { max-width: 1440px; margin: 0 auto; padding: 20px 28px 72px; }

/* ---- Staff section ---- */
.staff-section { background: #FFFFFF; border: 1px solid #DDE5E9; border-radius: 7px;
  margin-bottom: 12px; overflow: hidden; transition: opacity 0.2s, border-color 0.2s; }
.staff-section.hidden { display: none; }
.staff-header { display: flex; align-items: center; gap: 12px;
  padding: 11px 14px; border-bottom: 1px solid #E8EEF1; }
.avatar { width: 32px; height: 32px; border-radius: 6px; display: flex;
  align-items: center; justify-content: center; color: #FFF;
  font-size: 12px; font-weight: 700; flex-shrink: 0; }
.staff-info { flex: 1; min-width: 0; }
.staff-name { font-family: 'Rubik', 'Segoe UI', sans-serif; font-size: 14px;
  font-weight: 600; display: block; }
.role-label { font-size: 11px; color: #7D8E97; font-weight: 500; }
.header-right { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
.task-count { font-size: 11px; color: #788A93; font-weight: 600; }
.pto-badge { background: #FDF0E0; color: #D4883A; font-size: 11px;
  font-weight: 700; padding: 3px 8px; border-radius: 4px; }

/* ---- Task card grid ---- */
.tasks-container { padding: 10px; display: grid; background: #FAFBFC;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 8px; }
.task-card { position: relative; background: #FFFFFF; border: 1px solid #DDE5E9;
  border-radius: 5px; cursor: pointer; transition: border-color 0.15s, box-shadow 0.15s;
  user-select: none; overflow: hidden; display: flex; flex-direction: column; }
.task-card.unconfirmed { opacity: 0.78; }
.task-card:hover { border-color: #B8C6CD; box-shadow: 0 2px 7px rgba(30,48,58,0.08); }
.task-card .strike-line { position: absolute; left: 14px; right: 14px; top: 50%;
  height: 2px; background: #D95F5F; transform: scaleX(0); transform-origin: left;
  transition: transform 0.3s ease; pointer-events: none; border-radius: 1px; }
.task-card.struck .strike-line { transform: scaleX(1); }
.task-card.struck { opacity: 0.3; }

/* Card header */
.card-header { display: flex; align-items: center; justify-content: space-between;
  min-height: 30px; padding: 5px 10px; background: #F5F8F9; border-bottom: 1px solid #E5EBEE; }
.priority-pill { font-size: 10px; font-weight: 700; padding: 2px 8px;
  border-radius: 4px; flex-shrink: 0; text-align: center; min-width: 26px; }
.card-header-right { display: flex; gap: 5px; align-items: center; flex-wrap: wrap;
  justify-content: flex-end; }

/* Card body */
.card-body { padding: 10px 12px 12px; flex: 1; display: flex; flex-direction: column; }
.card-section { }
.card-section-label { font-size: 9px; font-weight: 700; color: #83949D;
  text-transform: uppercase; letter-spacing: 0.7px; display: block; margin-bottom: 2px; }
.card-name { font-size: 13px; font-weight: 600; line-height: 1.35; color: #17242B;
  overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2;
  -webkit-box-orient: vertical; word-break: break-word; }
.card-divider { height: 1px; background: #E8EDF0; margin: 8px 0; }
.card-notes { font-size: 12px; color: #60727B; line-height: 1.35;
  overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3;
  -webkit-box-orient: vertical; }
.notes-empty { color: #C8CED4; }

/* Badges */
.due-badge { font-size: 10px; color: #788A93; background: #E9EEF1;
  padding: 2px 6px; border-radius: 3px; white-space: nowrap; }
.partner-badge { font-size: 10px; color: #41545E; background: #E6ECEF;
  padding: 2px 6px; border-radius: 3px; font-weight: 700; white-space: nowrap; }
.empty-tasks { font-size: 13px; color: #93A1A8; font-style: italic;
  padding: 10px 8px; text-align: left; grid-column: 1 / -1; }
.print-task-table { display: none; }

/* Change highlight */
.task-card.changed { border-color: #D95F5F !important;
  box-shadow: 0 0 0 2px rgba(217,95,95,0.2); }
.task-card.changed::after { content: ''; position: absolute; top: 38px; right: 8px;
  width: 7px; height: 7px; border-radius: 50%; background: #D95F5F;
  animation: pulse-dot 2s ease-in-out infinite; }
@keyframes pulse-dot { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

/* ---- Print ---- */
@media print {
  @page { size: 11in 17in; margin: 0.42in; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  body { background: #FFFFFF; font-size: 9pt; }
  .top-bar { position: static; background: #FFFFFF; color: #17242B;
    border-bottom: 2px solid #29353B; }
  .top-bar-inner { min-height: 0; padding: 0 0 9px; }
  .brand-mark { width: 25px; height: 25px; background: #29353B; color: #FFFFFF;
    border-radius: 4px; font-size: 9px; }
  .top-bar h1 { font-size: 13px; }
  .product-label { color: #667983; font-size: 8px; }
  .top-bar .week { color: #43545D; font-size: 9px; border-left-color: #C9D4D9; }
  .top-bar .stats, .top-bar .updated { color: #60727B; font-size: 8px; }
  .top-bar .updated { border-left-color: #C9D4D9; }
  .filter-bar { display: none; }
  .content { max-width: none; padding: 6px 0 0; }
  .staff-section { margin-bottom: 4px; border: 0; border-radius: 0; overflow: visible;
    break-inside: auto; }
  .staff-section.empty { display: none; }
  .staff-header { display: none; }
  .tasks-container { display: none; }
  .print-task-table { display: table; width: 100%; border-collapse: collapse;
    table-layout: fixed; background: #FFFFFF; border: 1px solid #CBD6DB; }
  .print-task-table thead { display: table-header-group; }
  .print-task-table tr { break-inside: avoid; }
  .print-column-heading th { padding: 4px 7px; background: #EEF3F5; color: #60727B;
    border-bottom: 1px solid #CBD6DB; text-align: left; font-size: 7px;
    font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
  .print-staff-heading th { padding: 4px 7px; background: #FFFFFF;
    border-bottom: 1px solid #DCE4E8; text-align: left; }
  .print-staff-header { display: flex; align-items: center; gap: 7px; }
  .print-avatar { width: 22px; height: 22px; border-radius: 4px; display: flex;
    align-items: center; justify-content: center; color: #FFFFFF; font-size: 8px;
    font-weight: 700; flex: 0 0 auto; }
  .print-staff-copy { display: flex; flex: 1; min-width: 0; flex-direction: column; }
  .print-staff-name { color: #17242B; font-family: 'Rubik', 'Segoe UI', sans-serif;
    font-size: 9px; font-weight: 600; }
  .print-role-label { color: #7D8E97; font-size: 7px; font-weight: 500; }
  .print-staff-meta { display: flex; align-items: center; gap: 6px; color: #788A93;
    font-size: 7px; font-weight: 600; white-space: nowrap; }
  .print-staff-meta .pto-badge { padding: 2px 5px; font-size: 7px; }
  .print-task-table td { padding: 5px 7px; border-bottom: 1px solid #E0E7EA;
    color: #25343C; font-size: 8.5px; line-height: 1.25; vertical-align: top;
    overflow-wrap: anywhere; }
  .print-task-table tbody tr:last-child td { border-bottom: 0; }
  .print-row-unconfirmed { opacity: 0.76; }
  .print-col-priority { width: 8%; }
  .print-col-project { width: 37%; }
  .print-col-due { width: 13%; }
  .print-col-partner { width: 11%; }
  .print-col-notes { width: 31%; }
  .print-priority { display: inline-flex; align-items: center; justify-content: center;
    min-width: 22px; min-height: 15px; padding: 1px 5px; border-radius: 3px;
    font-size: 7px; font-weight: 700; white-space: nowrap; }
  .print-due-cell, .print-partner-cell { white-space: nowrap; }
  .print-partner { display: inline-block; padding: 1px 5px; border-radius: 3px;
    background: #E6ECEF; color: #41545E; font-size: 7px; font-weight: 700; }
  .print-notes-cell { color: #52666F !important; }
  .print-empty { color: #A7B3B9; }
}
@media (max-width: 760px) {
  .top-bar-inner, .filter-inner { padding-left: 16px; padding-right: 16px; }
  .top-bar-inner { align-items: flex-start; padding-top: 12px; padding-bottom: 12px; }
  .top-bar .week, .top-bar .updated { display: none; }
  .content { padding: 14px 12px 48px; }
  .tasks-container { grid-template-columns: 1fr; }
  .hint { display: none; }
}
</style></head><body>

<div class="top-bar">
  <div class="top-bar-inner">
    <div class="brand-lockup">
      <span class="brand-mark">SS</span>
      <span class="brand-copy">
        <h1>STUDIOSYNC</h1>
        <span class="product-label">Weekly Schedule</span>
      </span>
      <span class="week">${this._esc(weekRange)}</span>
    </div>
    <div class="right">
      <span class="stats">${totalTasks} tasks &middot; ${staffCount} staff</span>
      <span class="updated">Updated ${timeStr}</span>
    </div>
  </div>
</div>

<div class="filter-bar">
  <div class="filter-inner">
    <label for="staff-filter">View</label>
    <select id="staff-filter" class="filter-select" onchange="filterStaff(this.value)">
      ${filterOptions.join('\n')}
    </select>
    <span class="hint">Click a task to mark it off</span>
  </div>
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
    if (sel && Array.from(sel.options).some(function(option) { return option.value === saved; })) {
      sel.value = saved;
      filterStaff(saved);
    }
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
