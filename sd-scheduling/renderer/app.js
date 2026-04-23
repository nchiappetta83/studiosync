/**
 * App — main entry point for the renderer process.
 * Handles setup flow, initialization, and component wiring.
 */

const RendererLog = {
  _bound: false,

  bind() {
    if (this._bound || !window.api?.writeLog) return;
    this._bound = true;

    const originals = {
      error: console.error.bind(console),
      warn: console.warn.bind(console),
      log: console.log.bind(console),
    };

    const forward = (level, args) => {
      const message = args.map((arg) => {
        if (arg instanceof Error) return arg.stack || arg.message;
        if (typeof arg === 'string') return arg;
        try {
          return JSON.stringify(arg);
        } catch (_) {
          return String(arg);
        }
      }).join(' ');

      window.api.writeLog({
        level,
        message,
        meta: { scope: 'renderer' },
      }).catch(() => {});
    };

    console.error = (...args) => {
      forward('error', args);
      originals.error(...args);
    };

    console.warn = (...args) => {
      forward('warn', args);
      originals.warn(...args);
    };

    window.addEventListener('error', (event) => {
      window.api.writeLog({
        level: 'error',
        message: 'renderer-window-error',
        meta: {
          scope: 'renderer',
          message: event.message,
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          error: event.error instanceof Error ? {
            name: event.error.name,
            message: event.error.message,
            stack: event.error.stack,
          } : event.error,
        },
      }).catch(() => {});
    });

    window.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason instanceof Error
        ? {
            name: event.reason.name,
            message: event.reason.message,
            stack: event.reason.stack,
          }
        : event.reason;

      window.api.writeLog({
        level: 'error',
        message: 'renderer-unhandled-rejection',
        meta: {
          scope: 'renderer',
          reason,
        },
      }).catch(() => {});
    });

    originals.log('Renderer logging initialized');
  },
};

RendererLog.bind();

const App = {
  _resizeClassTimer: null,
  _backgroundRefreshTimer: null,
  _backgroundRefreshPending: false,
  _backgroundRefreshInFlight: false,
  _backgroundRefreshReason: null,
  _focusAttemptTimer: null,

  _nextFrame() {
    return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  },

  async init() {
    await this._ensureApiBridge();
    this._initWindowChrome();
    this._bindResizePerfMode();
    this._bindBackgroundRefreshGuards();
    this._bindInputDiagnostics();
    this._initUpdatePrompt();
    this._showAuthLoading();
    await this._nextFrame();

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
    window.api.onDataUpdated((payload) => {
      this._logDiagnostics('renderer-data-updated', {
        reason: payload?.reason || 'unknown',
        eventCount: payload?.eventCount || 0,
        eventTypes: payload?.eventTypes || [],
      });
      this._queueBackgroundRefresh({ reason: payload?.reason || 'unknown' });
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

  _bindBackgroundRefreshGuards() {
    if (document.body.dataset.backgroundRefreshBound === 'true') return;
    document.body.dataset.backgroundRefreshBound = 'true';

    const tryFlush = () => {
      if (!this._backgroundRefreshPending || this._shouldDeferBackgroundRefresh()) return;
      this._queueBackgroundRefresh({ force: true });
    };

    document.addEventListener('focusout', () => {
      setTimeout(tryFlush, 0);
    }, true);

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        tryFlush();
      }
    });

    window.addEventListener('focus', tryFlush);
  },

  _bindInputDiagnostics() {
    if (document.body.dataset.inputDiagnosticsBound === 'true') return;
    document.body.dataset.inputDiagnosticsBound = 'true';

    document.addEventListener('focusin', (event) => {
      if (!this._isEditableElement(event.target)) return;
      this._logDiagnostics('editable-focusin', this._captureInteractionContext({
        target: this._describeElement(event.target),
      }));
    }, true);

    document.addEventListener('focusout', (event) => {
      if (!this._isEditableElement(event.target)) return;
      this._logDiagnostics('editable-focusout', this._captureInteractionContext({
        target: this._describeElement(event.target),
      }));
    }, true);

    document.addEventListener('pointerdown', (event) => {
      const editable = this._getEditableTarget(event.target);
      if (!editable) return;

      const targetSummary = this._describeElement(editable);
      const point = { x: event.clientX, y: event.clientY };
      this._logDiagnostics('editable-pointerdown', this._captureInteractionContext({
        target: targetSummary,
        point,
      }));

      if (this._isTextEntryElement(editable) && document.activeElement !== editable) {
        requestAnimationFrame(() => {
          if (!document.contains(editable) || document.activeElement === editable) return;
          editable.focus({ preventScroll: true });
          this._logDiagnostics('editable-focus-assisted', this._captureInteractionContext({
            target: targetSummary,
            point,
          }));
        });
      }

      clearTimeout(this._focusAttemptTimer);
      this._focusAttemptTimer = setTimeout(() => {
        const active = document.activeElement;
        if (active === editable) return;

        const topAtPoint = typeof document.elementFromPoint === 'function'
          ? document.elementFromPoint(point.x, point.y)
          : null;

        this._logDiagnostics('editable-focus-missed', this._captureInteractionContext({
          target: targetSummary,
          point,
          activeElement: this._describeElement(active),
          topAtPoint: this._describeElement(topAtPoint),
        }));
      }, 180);
    }, true);
  },

  _getEditableTarget(target) {
    if (!(target instanceof Element)) return null;
    const editable = target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], [contenteditable]');
    return this._isEditableElement(editable) ? editable : null;
  },

  _isTextEntryElement(element) {
    if (!element || !(element instanceof HTMLElement)) return false;
    if (element.isContentEditable) return true;
    if (element.tagName === 'TEXTAREA') return true;
    if (element.tagName !== 'INPUT') return false;

    const type = (element.getAttribute('type') || 'text').toLowerCase();
    return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file', 'date'].includes(type);
  },

  _isEditableElement(element) {
    if (!element || !(element instanceof HTMLElement)) return false;
    if (element.isContentEditable) return true;

    const tag = element.tagName;
    if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (tag !== 'INPUT') return false;

    const type = (element.getAttribute('type') || 'text').toLowerCase();
    return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file'].includes(type);
  },

  _shouldDeferBackgroundRefresh() {
    const active = document.activeElement;
    return this._isEditableElement(active);
  },

  _armBackgroundRefreshRetry() {
    clearTimeout(this._backgroundRefreshTimer);
    this._backgroundRefreshTimer = setTimeout(() => {
      if (this._backgroundRefreshPending) {
        this._queueBackgroundRefresh({ reason: this._backgroundRefreshReason || 'retry' });
      }
    }, 900);
  },

  async _runBackgroundRefresh(reason = 'unknown') {
    this._backgroundRefreshInFlight = true;
    this._logDiagnostics('refresh-start', this._captureInteractionContext({ reason }));
    try {
      await AppState.refresh();
    } finally {
      this._backgroundRefreshInFlight = false;
      this._logDiagnostics('refresh-complete', this._captureInteractionContext({ reason }));
    }

    if (this._backgroundRefreshPending) {
      this._queueBackgroundRefresh({ reason: this._backgroundRefreshReason || 'pending-follow-up' });
    }
  },

  _queueBackgroundRefresh(options = {}) {
    const force = options.force === true;
    const reason = options.reason || this._backgroundRefreshReason || 'unknown';
    this._backgroundRefreshPending = true;
    this._backgroundRefreshReason = reason;

    if (!force && this._shouldDeferBackgroundRefresh()) {
      this._logDiagnostics('refresh-deferred', this._captureInteractionContext({ reason }));
      this._armBackgroundRefreshRetry();
      return;
    }

    clearTimeout(this._backgroundRefreshTimer);

    if (this._backgroundRefreshInFlight) {
      this._logDiagnostics('refresh-queued-while-inflight', this._captureInteractionContext({ reason }));
      return;
    }

    this._backgroundRefreshPending = false;
    const nextReason = this._backgroundRefreshReason || reason;
    this._backgroundRefreshReason = null;
    this._runBackgroundRefresh(nextReason);
  },

  _captureInteractionContext(extra = {}) {
    const visibleOverlays = Array.from(document.querySelectorAll('.dialog-overlay'))
      .filter((overlay) => !overlay.classList.contains('hidden'))
      .map((overlay) => overlay.id || overlay.className || 'dialog-overlay');

    return {
      activeElement: this._describeElement(document.activeElement),
      editableActive: this._isEditableElement(document.activeElement),
      documentHasFocus: typeof document.hasFocus === 'function' ? document.hasFocus() : true,
      visibleOverlays,
      pendingRefresh: this._backgroundRefreshPending,
      refreshInFlight: this._backgroundRefreshInFlight,
      ...extra,
    };
  },

  _describeElement(element) {
    if (!element || !(element instanceof Element)) return 'none';

    const parts = [element.tagName.toLowerCase()];
    if (element.id) parts.push(`#${element.id}`);

    const classNames = typeof element.className === 'string'
      ? element.className.trim().split(/\s+/).filter(Boolean).slice(0, 3)
      : [];
    if (classNames.length > 0) {
      parts.push(`.${classNames.join('.')}`);
    }

    const type = element.getAttribute?.('type');
    if (type) parts.push(`[type=${type}]`);
    const role = element.getAttribute?.('role');
    if (role) parts.push(`[role=${role}]`);
    const dataId = element.getAttribute?.('data-task-id') || element.getAttribute?.('data-project-id');
    if (dataId) parts.push(`[data=${dataId}]`);

    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      if (element.readOnly) parts.push('[readonly]');
      if (element.disabled) parts.push('[disabled]');
    }

    return parts.join('');
  },

  _logDiagnostics(type, detail = {}) {
    if (!window.api?.logDiagnostics) return;
    window.api.logDiagnostics({
      type,
      ...detail,
    }).catch(() => {});
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

  _showSetup(options = {}) {
    window.api.setWindowMode('auth');
    document.getElementById('setup-screen').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');
    document.getElementById('register-screen').classList.add('hidden');
    document.getElementById('login-screen').classList.add('hidden');

    const selectBtn = document.getElementById('setup-select-folder');
    const pathEl = document.getElementById('setup-path');
    const errorEl = document.getElementById('setup-error');
    const subtitleEl = document.querySelector('#setup-screen .setup-subtitle');

    if (subtitleEl) {
      subtitleEl.textContent = options.subtitle || 'Connect to your team\'s shared drive to get started.';
    }
    pathEl.textContent = '';
    errorEl.textContent = options.error || '';
    selectBtn.textContent = 'Select Shared Folder';
    selectBtn.disabled = false;

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
          const status = await window.api.getRuntimeStatus();
          if (this._renderAuthEntryFromStatus(status)) return;
          this._showLogin();
        }
      } else {
        errorEl.textContent = result.error || 'Failed to connect.';
        selectBtn.textContent = 'Select Shared Folder';
        selectBtn.disabled = false;
      }
    };
  },

  _showRegistration(options = {}) {
    window.api.setWindowMode('auth');
    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('register-screen').classList.remove('hidden');
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app').classList.add('hidden');

    const titleEl = document.querySelector('#register-screen .setup-title');
    const subtitleEl = document.querySelector('#register-screen .setup-subtitle');
    if (titleEl) titleEl.textContent = options.title || 'Welcome';
    if (subtitleEl) {
      subtitleEl.textContent = options.subtitle || 'You\'re not registered yet. Ask a partner to add your account, or set up as the first user.';
    }

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

  _showAuthLoading() {
    window.api.setWindowMode('auth');
    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('register-screen').classList.add('hidden');
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');

    const titleEl = document.getElementById('login-title');
    const subtitleEl = document.getElementById('login-subtitle');
    const loadingEl = document.getElementById('login-loading');
    const formShell = document.getElementById('login-form-shell');
    const helpEl = document.getElementById('login-help');
    const usernameInput = document.getElementById('login-username');
    const submitBtn = document.getElementById('login-submit');
    const errorEl = document.getElementById('login-error');

    if (titleEl) titleEl.textContent = 'Starting Dashboard';
    if (subtitleEl) subtitleEl.textContent = 'Connecting to your shared workspace...';
    if (loadingEl) loadingEl.classList.remove('hidden');
    if (formShell) formShell.classList.add('hidden');
    if (helpEl) helpEl.classList.add('hidden');
    if (usernameInput) {
      usernameInput.value = '';
      usernameInput.disabled = true;
    }
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Connecting...';
    }
    if (errorEl) errorEl.textContent = '';
  },

  _renderAuthEntryFromStatus(status) {
    const authEntry = status?.authEntry;
    if (!authEntry) return false;

    if (authEntry.screen === 'connect') {
      this._showSetup({
        subtitle: authEntry.subtitle,
        error: authEntry.error,
      });
      return true;
    }

    if (authEntry.screen === 'register') {
      this._showRegistration({
        title: authEntry.title,
        subtitle: authEntry.subtitle,
      });
      return true;
    }

    if (authEntry.screen === 'app') {
      return false;
    }

    this._showLogin();
    return true;
  },

  async _initializeWithConfig(sharedPath) {
    const result = await window.api.resumeApp(sharedPath);

    if (result.success && result.user) {
      await this._launchApp();
    } else if (result.success && !result.user) {
      const status = await window.api.getRuntimeStatus();
      if (this._renderAuthEntryFromStatus(status)) return;
      this._showLogin();
    } else {
      this._showSetup({
        error: 'Could not connect to shared drive. Please re-select the folder.',
      });
    }
  },

  _showLogin() {
    window.api.setWindowMode('auth');
    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('register-screen').classList.add('hidden');
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');

    const titleEl = document.getElementById('login-title');
    const subtitleEl = document.getElementById('login-subtitle');
    const loadingEl = document.getElementById('login-loading');
    const formShell = document.getElementById('login-form-shell');
    const helpEl = document.getElementById('login-help');
    const usernameInput = document.getElementById('login-username');
    const submitBtn = document.getElementById('login-submit');
    const errorEl = document.getElementById('login-error');

    if (titleEl) titleEl.textContent = 'Sign In';
    if (subtitleEl) subtitleEl.textContent = 'Enter your username to continue.';
    if (loadingEl) loadingEl.classList.add('hidden');
    if (formShell) formShell.classList.remove('hidden');
    if (helpEl) helpEl.classList.remove('hidden');
    usernameInput.disabled = false;
    usernameInput.value = '';
    usernameInput.placeholder = 'e.g. JSmith';
    submitBtn.disabled = false;
    submitBtn.textContent = 'Sign In';
    errorEl.textContent = '';

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
        const status = await window.api.getRuntimeStatus();
        if (App._renderAuthEntryFromStatus(status) && status?.authEntry?.screen !== 'login') {
          return;
        }
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
    const startupRollover = await window.api.consumeRolloverNotice();
    if (startupRollover?.applied) {
      Toast.show('Weekly rollover complete', 'success');
      return;
    }

    const result = await window.api.checkRollover();
    if (result.needed) {
      await window.api.performRollover();
      await AppState.refresh();
      Toast.show('Weekly rollover complete', 'success');
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
