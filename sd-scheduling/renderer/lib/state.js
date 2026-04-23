/**
 * Simple reactive state manager.
 * Components subscribe to state changes and re-render when data updates.
 */

const AppState = {
  _listeners: {},
  _batchDepth: 0,
  _pendingKeys: new Set(),
  _tasksByStaffCache: null,
  _refreshPromise: null,
  _refreshQueued: false,
  _data: {
    currentUser: null,
    users: [],
    tasks: [],
    projects: [],
    pto: [],
    businessRoles: [],
    customPriorities: [],
    priorityMenuOrder: [],
    priorityDisplayStyles: {},
    selectedStaffId: 'all',  // 'all', a user ID, or an array of user IDs
    selectedPartnerId: null, // null or a partner user ID (filters projects)
    projectTab: 'active',    // 'active', 'inactive', 'all'
    searchQuery: '',
    sidebarSort: 'name',     // 'name' (A-Z) or 'role'
    filterPriority: null,    // null or a priority number
  },

  get(key) {
    return this._data[key];
  },

  set(key, value) {
    this._data[key] = value;
    this._invalidateCaches(key);
    this._notify(key);
  },

  on(key, callback) {
    if (!this._listeners[key]) this._listeners[key] = [];
    this._listeners[key].push(callback);
    return () => {
      this._listeners[key] = this._listeners[key].filter(cb => cb !== callback);
    };
  },

  _notify(key) {
    if (this._batchDepth > 0) {
      this._pendingKeys.add(key);
      return;
    }

    if (this._listeners[key]) {
      for (const cb of this._listeners[key]) {
        try { cb(this._data[key]); } catch (e) { console.error('State listener error:', e); }
      }
    }
    // Also notify wildcard listeners
    if (this._listeners['*']) {
      for (const cb of this._listeners['*']) {
        try { cb(key, this._data[key]); } catch (e) { console.error('State listener error:', e); }
      }
    }
  },

  batch(callback) {
    this._batchDepth += 1;
    try {
      return callback();
    } finally {
      this._batchDepth -= 1;
      if (this._batchDepth === 0) {
        this._flushPending();
      }
    }
  },

  _flushPending() {
    if (this._pendingKeys.size === 0) return;

    const keys = [...this._pendingKeys];
    this._pendingKeys.clear();

    const specificListeners = new Set();
    for (const key of keys) {
      for (const cb of this._listeners[key] || []) {
        specificListeners.add(cb);
      }
    }

    for (const cb of specificListeners) {
      try { cb(); } catch (e) { console.error('State listener error:', e); }
    }

    if (this._listeners['*']) {
      for (const key of keys) {
        for (const cb of this._listeners['*']) {
          try { cb(key, this._data[key]); } catch (e) { console.error('State listener error:', e); }
        }
      }
    }
  },

  _invalidateCaches(key) {
    if (['users', 'tasks', 'projects', 'customPriorities', 'priorityMenuOrder', 'selectedStaffId', 'selectedPartnerId'].includes(key)) {
      this._tasksByStaffCache = null;
    }
  },

  /**
   * Reload all data from the backend
   */
  async refresh() {
    if (this._refreshPromise) {
      this._refreshQueued = true;
      await this._refreshPromise;
      if (this._refreshQueued) {
        this._refreshQueued = false;
        return this.refresh();
      }
      return;
    }

    this._refreshPromise = (async () => {
      const [users, tasks, projects, pto, currentUser, businessRoles, customPriorities, priorityMenuOrder, priorityDisplayStyles] = await Promise.all([
        window.api.getUsers(),
        window.api.getTasks({}),
        window.api.getProjects(),
        window.api.getPTO(),
        window.api.getCurrentUser(),
        window.api.getBusinessRoles(),
        window.api.getCustomPriorities(),
        window.api.getPriorityMenuOrder(),
        window.api.getPriorityDisplayStyles()
      ]);

      this.batch(() => {
        this._data.users = users;
        this._data.tasks = tasks;
        this._data.projects = projects;
        this._data.pto = pto;
        this._data.currentUser = currentUser;
        this._data.businessRoles = businessRoles;
        this._data.customPriorities = customPriorities;
        this._data.priorityMenuOrder = Array.isArray(priorityMenuOrder) ? priorityMenuOrder : [];
        this._data.priorityDisplayStyles = priorityDisplayStyles && typeof priorityDisplayStyles === 'object'
          ? priorityDisplayStyles
          : {};
        this._tasksByStaffCache = null;

        this._notify('users');
        this._notify('tasks');
        this._notify('projects');
        this._notify('pto');
        this._notify('currentUser');
        this._notify('businessRoles');
        this._notify('customPriorities');
        this._notify('priorityMenuOrder');
        this._notify('priorityDisplayStyles');
      });
    })();

    try {
      await this._refreshPromise;
    } finally {
      this._refreshPromise = null;
    }

    if (this._refreshQueued) {
      this._refreshQueued = false;
      return this.refresh();
    }
  },

  // ── Helpers ──────────────────────────────────────────

  getTasksForUser(userId) {
    if (userId === 'all') return this._data.tasks;
    return this._data.tasks.filter(t => t.assigned_to === userId);
  },

  getTasksByStaffGrouped() {
    const cache = this._tasksByStaffCache;
    if (
      cache
      && cache.users === this._data.users
      && cache.tasks === this._data.tasks
      && cache.projects === this._data.projects
      && cache.selectedStaffId === this._data.selectedStaffId
      && cache.selectedPartnerId === this._data.selectedPartnerId
    ) {
      return cache.value;
    }

    const groups = {};
    const users = this._data.users;
    const selectedId = this._data.selectedStaffId;
    const selectedPartnerId = this._data.selectedPartnerId;

    let relevantUsers;
    if (selectedId === 'all') {
      relevantUsers = users;
    } else if (Array.isArray(selectedId)) {
      relevantUsers = users.filter(u => selectedId.includes(u.id));
    } else {
      relevantUsers = users.filter(u => u.id === selectedId);
    }

    for (const user of relevantUsers) {
      groups[user.id] = {
        user,
        tasks: this._data.tasks
          .filter(t => t.assigned_to === user.id)
          .filter(t => this._matchesSelectedPartner(t, selectedPartnerId))
          .sort((a, b) => {
            // V4 style: confirmed before unconfirmed
            const ac = a.confirmed ?? 1, bc = b.confirmed ?? 1;
            if (ac !== bc) return bc - ac;
            // Then by priority: 1-4 first (ascending), 0 (unset) after, -1 (W) last
            const ap = this._prioritySortKey(a);
            const bp = this._prioritySortKey(b);
            if (ap !== bp) return ap - bp;
            return a.sort_order - b.sort_order;
          })
      };
    }

    this._tasksByStaffCache = {
      users: this._data.users,
      tasks: this._data.tasks,
      projects: this._data.projects,
      selectedStaffId: this._data.selectedStaffId,
      selectedPartnerId: this._data.selectedPartnerId,
      value: groups,
    };

    return groups;
  },

  getFilteredProjects() {
    const tab = this._data.projectTab;
    const query = this._data.searchQuery.toLowerCase();

    let filtered = this._data.projects;

    if (tab === 'active') {
      filtered = filtered.filter(p => (p.category || 'current') === 'current' && p.status === 'active');
    } else if (tab === 'future') {
      filtered = filtered.filter(p => (p.category || 'current') === 'future');
    } else if (tab === 'inactive') {
      filtered = filtered.filter(p => p.status === 'inactive');
    }

    if (query) {
      filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(query) ||
        p.client.toLowerCase().includes(query) ||
        (p.notes && p.notes.toLowerCase().includes(query))
      );
    }

    return filtered;
  },

  getSearchFilteredTasks() {
    const query = this._data.searchQuery.toLowerCase();
    if (!query) return this._data.tasks;
    return this._data.tasks.filter(t =>
      t.title.toLowerCase().includes(query) ||
      (t.notes && t.notes.toLowerCase().includes(query))
    );
  },

  getUserById(id) {
    return this._data.users.find(u => u.id === id);
  },

  getPTOForUser(userId) {
    return this._data.pto.find(p => p.user_id === userId);
  },

  getTaskCountForUser(userId) {
    return this._data.tasks.filter(t => t.assigned_to === userId).length;
  },

  isPartner() {
    const u = this._data.currentUser;
    return u && (u.role === 'partner' || u.is_admin === 1);
  },

  isAdmin() {
    const u = this._data.currentUser;
    return u && (u.is_admin === 1 || u.role === 'partner');
  },

  isStaffSelected(userId) {
    const sel = this._data.selectedStaffId;
    if (sel === 'all') return false;
    if (Array.isArray(sel)) return sel.includes(userId);
    return sel === userId;
  },

  getBusinessRoleById(id) {
    return this._data.businessRoles.find(r => r.id === id);
  },

  _prioritySortKey(task) {
    const p = task?.priority;
    const customPriorities = this._data.customPriorities || [];
    const validTokens = [
      'numbered',
      ...customPriorities.map((item) => `custom:${item.id}`),
      'wait',
      'clear',
    ];
    const savedTokens = Array.isArray(this._data.priorityMenuOrder)
      ? this._data.priorityMenuOrder
      : [];
    const orderedTokens = [];

    for (const token of savedTokens) {
      if (validTokens.includes(token) && !orderedTokens.includes(token)) {
        orderedTokens.push(token);
      }
    }

    for (const token of validTokens) {
      if (!orderedTokens.includes(token)) {
        orderedTokens.push(token);
      }
    }

    let token = 'clear';
    let offset = 0;

    if (typeof p === 'number' && p >= 1) {
      token = 'numbered';
      offset = p;
    } else if (p === -1) {
      token = 'wait';
    } else if (p === -2) {
      const label = String(task?.priority_label || '').replace(/^cp:/, '');
      const customPriority = customPriorities.find((item) => item.label === label);
      token = customPriority ? `custom:${customPriority.id}` : 'clear';
    }

    const index = orderedTokens.indexOf(token);
    const base = (index >= 0 ? index : orderedTokens.length) * 100;
    return base + offset;
  },

  _matchesSelectedPartner(task, selectedPartnerId) {
    if (!selectedPartnerId) return true;
    if (task.partner_id === selectedPartnerId) return true;

    const project = this._data.projects.find(p => p.id === task.project_id);
    if (!project) return false;
    if (project.partner_id === selectedPartnerId) return true;

    try {
      const partnerIds = JSON.parse(project.partner_ids || '[]');
      return Array.isArray(partnerIds) && partnerIds.includes(selectedPartnerId);
    } catch (_) {
      return false;
    }
  }
};
