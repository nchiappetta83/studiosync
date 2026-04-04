/**
 * App — main entry point for the renderer process.
 * Handles setup flow, initialization, and component wiring.
 */

const App = {
  _resizeClassTimer: null,

  _nextFrame() {
    return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  },

  async init() {
    await this._ensureApiBridge();
    this._initWindowChrome();
    this._bindResizePerfMode();
    this._initUpdatePrompt();

    // Check if we have a saved config
    const config = await window.api.getConfig();

    if (config && config.sharedDrivePath) {
      // Try to initialize with existing config
      await this._initializeWithConfig(config.sharedDrivePath);
    } else {
      // Show setup screen
      this._showSetup();
    }

    // Listen for sync updates
    window.api.onDataUpdated(() => {
      AppState.refresh();
    });

    // Panel resizer
    this._initResizer();

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      const mod = e.ctrlKey || e.metaKey;

      // Ctrl+F — focus search
      if (mod && e.key === 'f') {
        e.preventDefault();
        document.getElementById('search-input')?.focus();
      }
      // Ctrl+N — add task (admin/partner only)
      if (mod && e.key === 'n') {
        e.preventDefault();
        if (AppState.isAdmin()) {
          const selectedId = AppState.get('selectedStaffId');
          TaskDialog.show({ assigned_to: selectedId !== 'all' ? selectedId : null });
        }
      }
      // Ctrl+P — export (print dialog)
      if (mod && e.key === 'p') {
        e.preventDefault();
        PrintDialog.show();
      }
      // Ctrl+E — refresh Excel import
      if (mod && e.key === 'e') {
        e.preventDefault();
        if (AppState.isAdmin()) {
          window.api.refreshExcel().then(result => {
            if (result && !result.error) {
              AppState.refresh();
              Toast.show(`Excel refreshed: ${result.imported || 0} new, ${result.updated || 0} updated`, 'success');
            } else if (result && result.error) {
              Toast.show(result.error, 'error');
            }
          });
        }
      }
      // Escape — close dialogs/overlays, clear search
      if (e.key === 'Escape') {
        // Close any open dialog overlay
        const overlay = document.querySelector('.dialog-overlay:not(.hidden)');
        if (overlay) {
          if (overlay.id === 'update-overlay') {
            App._deferUpdatePrompt();
          } else {
            overlay.remove();
          }
          return;
        }
        // Close context menu
        const ctxMenu = document.querySelector('.context-menu');
        if (ctxMenu) {
          ctxMenu.remove();
          return;
        }
        // Clear and blur search
        const searchInput = document.getElementById('search-input');
        if (searchInput && document.activeElement === searchInput) {
          searchInput.value = '';
          searchInput.dispatchEvent(new Event('input'));
          searchInput.blur();
        }
      }
    });

    const pendingUpdate = await window.api.getPendingUpdate();
    if (pendingUpdate) {
      this._showUpdatePrompt(pendingUpdate);
    }
  },

  _ensureApiBridge() {
    if (window.api) return Promise.resolve();

    const existing = document.querySelector('script[data-mock-api="true"]');
    if (existing) {
      return new Promise((resolve, reject) => {
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => reject(new Error('Failed to load mock API bridge.')), { once: true });
      });
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'lib/mock.js';
      script.dataset.mockApi = 'true';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load mock API bridge.'));
      document.head.appendChild(script);
    });
  },

  _initWindowChrome() {
    if (document.body.dataset.windowChromeBound === 'true') return;
    document.body.dataset.windowChromeBound = 'true';

    document.querySelectorAll('[data-window-action]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const action = btn.dataset.windowAction;
        if (action === 'minimize') {
          await window.api.minimizeWindow();
        } else if (action === 'maximize') {
          const state = await window.api.toggleMaximizeWindow();
          this._applyWindowState(state);
        } else if (action === 'close') {
          await window.api.closeWindow();
        }
      });
    });

    document.querySelectorAll('.toolbar, .setup-screen').forEach((region) => {
      region.addEventListener('dblclick', async (e) => {
        if (e.target.closest('.window-controls, .setup-card, .toolbar-center, .toolbar-right')) return;
        const state = await window.api.toggleMaximizeWindow();
        this._applyWindowState(state);
      });
    });

    window.api.onWindowStateChanged((state) => {
      this._applyWindowState(state);
    });

    window.api.getWindowState().then((state) => {
      this._applyWindowState(state);
    });
  },

  _bindResizePerfMode() {
    if (document.body.dataset.resizePerfBound === 'true') return;
    document.body.dataset.resizePerfBound = 'true';

    const markResizing = () => {
      document.body.classList.add('window-resizing');
      clearTimeout(this._resizeClassTimer);
      this._resizeClassTimer = setTimeout(() => {
        document.body.classList.remove('window-resizing');
      }, 140);
    };

    window.addEventListener('resize', markResizing, { passive: true });
  },

  _applyWindowState(state) {
    const isMaximized = Boolean(state?.isMaximized);
    document.querySelectorAll('[data-window-action="maximize"]').forEach((btn) => {
      btn.title = isMaximized ? 'Restore' : 'Maximize';
      btn.setAttribute('aria-label', isMaximized ? 'Restore' : 'Maximize');
      btn.querySelector('.maximize')?.classList.toggle('hidden', isMaximized);
      btn.querySelector('.restore')?.classList.toggle('hidden', !isMaximized);
    });
  },

  _initUpdatePrompt() {
    const overlay = document.getElementById('update-overlay');
    if (!overlay || overlay.dataset.bound === 'true') return;

    overlay.dataset.bound = 'true';
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        this._deferUpdatePrompt();
      }
    });

    document.getElementById('update-later')?.addEventListener('click', async () => {
      await this._deferUpdatePrompt();
    });

    document.getElementById('update-install')?.addEventListener('click', async () => {
      const button = document.getElementById('update-install');
      const originalText = button.textContent;
      button.disabled = true;
      button.textContent = 'Launching Installer...';
      const result = await window.api.installUpdate();
      if (!result?.success) {
        button.disabled = false;
        button.textContent = originalText;
        Toast.show(result?.error || 'Unable to launch installer', 'error');
      }
    });

    window.api.onUpdateAvailable((payload) => {
      this._showUpdatePrompt(payload);
    });
  },

  _showUpdatePrompt(payload) {
    const overlay = document.getElementById('update-overlay');
    if (!overlay || !payload) return;

    overlay.dataset.version = payload.latestVersion || '';
    document.getElementById('update-title').textContent = `${payload.latestVersion || 'New'} is ready for install`;
    document.getElementById('update-subtitle').textContent = 'A newer build was found in your shared update folder. Install it now or come back to it later.';
    document.getElementById('update-current-version').textContent = payload.currentVersion || '-';
    document.getElementById('update-latest-version').textContent = payload.latestVersion || '-';
    document.getElementById('update-installer-name').textContent = payload.installerName || '-';
    const installBtn = document.getElementById('update-install');
    if (installBtn) {
      installBtn.disabled = false;
      installBtn.textContent = 'Install Update';
    }
    overlay.classList.remove('hidden');
  },

  _hideUpdatePrompt() {
    const overlay = document.getElementById('update-overlay');
    if (!overlay) return;
    overlay.classList.add('hidden');
  },

  async _deferUpdatePrompt() {
    const overlay = document.getElementById('update-overlay');
    if (!overlay) return;
    await window.api.dismissUpdate(overlay.dataset.version || null);
    this._hideUpdatePrompt();
  },

  _showSetup() {
    window.api.setWindowMode('auth');
    document.getElementById('setup-screen').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');
    document.getElementById('register-screen').classList.add('hidden');
    document.getElementById('login-screen').classList.add('hidden');

    const selectBtn = document.getElementById('setup-select-folder');
    const pathEl = document.getElementById('setup-path');
    const errorEl = document.getElementById('setup-error');

    selectBtn.onclick = async () => {
      const folderPath = await window.api.selectFolder();
      if (!folderPath) return;

      pathEl.textContent = folderPath;
      errorEl.textContent = '';
      selectBtn.textContent = 'Connecting...';
      selectBtn.disabled = true;

      const result = await window.api.initializeApp(folderPath);

      if (result.success) {
        if (result.user) {
          await this._launchApp();
        } else {
          const users = await window.api.getUsers();
          if (users.length === 0) {
            this._showRegistration();
          } else {
            this._showLogin();
          }
        }
      } else {
        errorEl.textContent = result.error || 'Failed to connect.';
        selectBtn.textContent = 'Select Shared Folder';
        selectBtn.disabled = false;
      }
    };
  },

  _showRegistration() {
    window.api.setWindowMode('auth');
    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('register-screen').classList.remove('hidden');
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app').classList.add('hidden');

    // All users self-register — first user gets admin
    window.api.getUsers().then(users => {
      const isFirstUser = users.length === 0;

      document.getElementById('first-user-setup').classList.remove('hidden');
      document.getElementById('register-status').textContent = isFirstUser
        ? 'You\'re the first user. Create your account to get started.'
        : 'Enter your name to register.';

      document.getElementById('register-submit').textContent = 'Create Account';

      document.getElementById('register-submit').onclick = async () => {
        const name = document.getElementById('register-name').value.trim();
        if (!name) return;

        const parts = name.trim().split(/\s+/);
        const firstName = parts[0] || '';
        const lastName = parts.slice(1).join(' ') || '';
        const username = firstName && lastName
          ? (firstName[0] + lastName).toLowerCase().replace(/\s+/g, '')
          : name.toLowerCase().replace(/\s+/g, '');

        await window.api.createUser({
          username: username,
          first_name: firstName,
          last_name: lastName,
          display_name: name,
          role: isFirstUser ? 'bootstrap' : 'staff',
          is_admin: isFirstUser ? 1 : 0
        });

        // Log in as this new user
        await window.api.login(username);
        await this._launchApp();
      };
    });
  },

  async _initializeWithConfig(sharedPath) {
    const result = await window.api.initializeApp(sharedPath);

    if (result.success && result.user) {
      await this._launchApp();
    } else if (result.success && !result.user) {
      // Check if there are any users yet — if not, show registration; otherwise show login
      const users = await window.api.getUsers();
      if (users.length === 0) {
        this._showRegistration();
      } else {
        this._showLogin();
      }
    } else {
      // Config exists but can't connect — show setup with error
      this._showSetup();
      const errorEl = document.getElementById('setup-error');
      errorEl.textContent = 'Could not connect to shared drive. Please re-select the folder.';
    }
  },

  _showLogin() {
    window.api.setWindowMode('auth');
    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('register-screen').classList.add('hidden');
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');

    const usernameInput = document.getElementById('login-username');
    const submitBtn = document.getElementById('login-submit');
    const errorEl = document.getElementById('login-error');

    async function attemptLogin() {
      const username = usernameInput.value.trim().toLowerCase();
      if (!username) return;

      submitBtn.disabled = true;
      submitBtn.textContent = 'Signing in...';
      errorEl.textContent = '';

      const user = await window.api.login(username);
      if (user) {
        document.getElementById('login-screen').classList.add('hidden');
        await App._nextFrame();
        await App._launchApp();
      } else {
        errorEl.textContent = 'Username not found. Check with your administrator.';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Sign In';
        usernameInput.focus();
      }
    }

    submitBtn.onclick = attemptLogin;
    usernameInput.onkeydown = (e) => {
      if (e.key === 'Enter') attemptLogin();
    };
    usernameInput.focus();
  },

  async _launchApp() {
    await window.api.setWindowMode('main');
    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('register-screen').classList.add('hidden');
    document.getElementById('login-screen').classList.add('hidden');

    // Load data
    await AppState.refresh();

    // Apply role-based visibility
    this._applyRole();

    // Initialize all components
    MiniCalendar.init();
    Sidebar.init();
    Toolbar.init();
    TaskPanel.init();
    ProjectPanel.init();
    document.getElementById('app').classList.remove('hidden');

    // Check weekly rollover (V4 behavior)
    await this._checkWeeklyRollover();
  },

  async _checkWeeklyRollover() {
    // Initialize rollover week tracking if first time
    await window.api.initRolloverWeek();

    const result = await window.api.checkRollover();
    if (result.needed && AppState.isAdmin()) {
      const doRollover = confirm(
        'A new week has started.\n\n' +
        'This will mark all current tasks as "Last Week" (unconfirmed), clear PTO, and reset priorities.\n\n' +
        'Proceed with weekly rollover?'
      );
      if (doRollover) {
        await window.api.performRollover();
        await AppState.refresh();
        Toast.show('Weekly rollover complete', 'success');
      }
    }
  },

  _applyRole() {
    const user = AppState.get('currentUser');
    if (!user) return;

    const hasAdmin = AppState.isAdmin();

    if (hasAdmin) {
      document.body.classList.add('role-partner');
      document.body.classList.remove('role-staff');
    } else {
      document.body.classList.add('role-staff');
      document.body.classList.remove('role-partner');
    }

    // Hide partner-only (admin) elements for regular staff
    document.querySelectorAll('.partner-only').forEach(el => {
      el.style.display = hasAdmin ? '' : 'none';
    });
  },

  _initResizer() {
    const resizer = document.getElementById('panel-resizer');
    const tasksPanel = document.getElementById('tasks-panel');
    const projectsPanel = document.getElementById('projects-panel');

    if (!resizer || !tasksPanel || !projectsPanel) return;

    let isResizing = false;

    resizer.addEventListener('mousedown', (e) => {
      isResizing = true;
      resizer.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const startX = e.clientX;
      const startTasksWidth = tasksPanel.offsetWidth;
      const startProjectsWidth = projectsPanel.offsetWidth;

      const onMove = (moveE) => {
        if (!isResizing) return;
        const dx = moveE.clientX - startX;
        const newTasksWidth = Math.max(450, startTasksWidth + dx);
        const newProjectsWidth = Math.max(340, startProjectsWidth - dx);

        tasksPanel.style.flex = 'none';
        projectsPanel.style.flex = 'none';
        tasksPanel.style.width = newTasksWidth + 'px';
        projectsPanel.style.width = newProjectsWidth + 'px';
      };

      const onUp = () => {
        isResizing = false;
        resizer.classList.remove('dragging');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }
};

// Start the app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
