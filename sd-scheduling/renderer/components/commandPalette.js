/**
 * Command palette (Ctrl+K): the shared UI engine. Keep this file identical in the Dashboard and
 * MyTasks (the smoke tests check that). Each app supplies its own data and actions through
 * CommandPalette.register(provider) in components/paletteItems.js.
 *
 * Provider:
 *   groups       group names in display order
 *   limits       max results per group while searching, e.g. { Tasks: 8 }
 *   emptyGroups  groups shown when nothing has been typed
 *   placeholder  optional input placeholder and accessible name
 *   emptyHint    optional text shown under "No results"
 *   canOpen()    optional; return false to refuse to open (not signed in, a dialog is open...)
 *   beforeOpen() optional; close menus and popups that should not stay open behind the palette
 *   buildItems() returns [{ group, label, hint?, keywords?, kbd?, iconHtml, run() }]
 *
 * Matching and ranking live in lib/paletteSearch.js.
 *
 * Accessibility: the input is a combobox that owns a listbox. Focus stays in the input and
 * aria-activedescendant points at the highlighted option. Escape closes the palette and
 * returns focus to wherever it was.
 */
const CommandPalette = {
  provider: null,

  ICONS: {
    command: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>',
    project: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
    task: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8.5 12 2.5 2.5 4.5-5"/></svg>',
    settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    view: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 10v10"/></svg>',
    search: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
  },

  DEFAULT_PLACEHOLDER: 'Search people, projects, tasks, or commands...',

  _overlay: null,
  _input: null,
  _list: null,
  _status: null,
  _items: [],
  _results: [],
  _active: -1,
  _opener: null,

  register(provider) {
    this.provider = provider;
  },

  isOpen() {
    return Boolean(this._overlay);
  },

  toggle() {
    if (this.isOpen()) this.close();
    else this.open();
  },

  open() {
    if (this._overlay || !this.provider) return;
    if (this.provider.canOpen && !this.provider.canOpen()) return;
    if (this.provider.beforeOpen) this.provider.beforeOpen();

    this._opener = document.activeElement;
    this._items = this.provider.buildItems(this);
    const placeholder = this.provider.placeholder || this.DEFAULT_PLACEHOLDER;

    const overlay = document.createElement('div');
    overlay.className = 'palette-overlay';
    overlay.innerHTML = `
      <div class="palette" role="dialog" aria-modal="true" aria-label="Command palette">
        <div class="palette-search">
          <span class="palette-search-icon" aria-hidden="true">${this.ICONS.search}</span>
          <input type="text" class="palette-input" id="palette-input" role="combobox"
            aria-expanded="true" aria-controls="palette-list" aria-autocomplete="list" aria-activedescendant=""
            aria-label="${this.esc(placeholder.replace(/\.\.\.$/, ''))}"
            placeholder="${this.esc(placeholder)}" autocomplete="off" spellcheck="false">
        </div>
        <div class="palette-list" id="palette-list" role="listbox" aria-label="Results"></div>
        <div class="palette-footer" aria-hidden="true">
          <span><kbd>&uarr;</kbd><kbd>&darr;</kbd> Navigate</span>
          <span><kbd>&crarr;</kbd> Open</span>
          <span><kbd>Esc</kbd> Close</span>
        </div>
        <div class="palette-sr" role="status" aria-live="polite"></div>
      </div>`;
    document.body.appendChild(overlay);

    this._overlay = overlay;
    this._input = overlay.querySelector('#palette-input');
    this._list = overlay.querySelector('#palette-list');
    this._status = overlay.querySelector('.palette-sr');

    this._input.addEventListener('input', () => this._render());
    overlay.addEventListener('keydown', (event) => this._onKeydown(event));
    overlay.addEventListener('mousedown', (event) => {
      if (event.target === overlay) this.close();
    });
    // Keep focus in the input so typing and aria-activedescendant keep working.
    this._list.addEventListener('mousedown', (event) => event.preventDefault());
    this._list.addEventListener('click', (event) => {
      const row = event.target.closest('.palette-item');
      if (!row) return;
      this._setActive(Number(row.dataset.index), { scroll: false });
      this._runActive();
    });
    this._list.addEventListener('mousemove', (event) => {
      const row = event.target.closest('.palette-item');
      if (row && Number(row.dataset.index) !== this._active) {
        this._setActive(Number(row.dataset.index), { scroll: false });
      }
    });
    overlay.addEventListener('focusout', (event) => {
      if (event.relatedTarget && overlay.contains(event.relatedTarget)) return;
      setTimeout(() => {
        if (this._overlay === overlay && !overlay.contains(document.activeElement)) this._input.focus();
      }, 0);
    });

    this._render();
    this._input.focus();
  },

  close() {
    if (!this._overlay) return;
    const opener = this._opener;
    this._overlay.remove();
    this._overlay = null;
    this._input = null;
    this._list = null;
    this._status = null;
    this._results = [];
    this._active = -1;
    this._opener = null;
    if (opener && opener.isConnected && typeof opener.focus === 'function') {
      opener.focus({ preventScroll: true });
    }
  },

  // ── Keyboard ─────────────────────────────────────────

  _onKeydown(event) {
    if (event.isComposing) return;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this._move(1, true);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this._move(-1, true);
        break;
      case 'PageDown':
        event.preventDefault();
        this._move(5, false);
        break;
      case 'PageUp':
        event.preventDefault();
        this._move(-5, false);
        break;
      case 'Home':
        if (!event.ctrlKey) return;
        event.preventDefault();
        this._setActive(0);
        break;
      case 'End':
        if (!event.ctrlKey) return;
        event.preventDefault();
        this._setActive(this._results.length - 1);
        break;
      case 'Enter':
        event.preventDefault();
        this._runActive();
        break;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation(); // do not also trigger the app-wide Escape handling
        this.close();
        break;
      case 'Tab':
        event.preventDefault(); // modal: focus stays in the palette
        break;
      default:
        return;
    }
  },

  _move(delta, wrap) {
    const count = this._results.length;
    if (!count) return;
    let next = this._active + delta;
    if (wrap) next = (next + count) % count;
    else next = Math.max(0, Math.min(count - 1, next));
    this._setActive(next);
  },

  _setActive(index, { scroll = true } = {}) {
    const rows = this._list ? this._list.querySelectorAll('.palette-item') : [];
    rows.forEach((row) => {
      row.classList.remove('is-active');
      row.setAttribute('aria-selected', 'false');
    });
    this._active = index;
    const row = index >= 0 ? this._list.querySelector(`.palette-item[data-index="${index}"]`) : null;
    if (row) {
      row.classList.add('is-active');
      row.setAttribute('aria-selected', 'true');
      if (scroll) row.scrollIntoView({ block: 'nearest' });
    }
    this._input.setAttribute('aria-activedescendant', row ? row.id : '');
  },

  _runActive() {
    const result = this._results[this._active];
    if (!result) return;
    const { item } = result;
    this.close();
    // Run after focus has been handed back, so an action that opens a dialog or moves focus wins.
    setTimeout(() => item.run(), 0);
  },

  // ── Rendering ────────────────────────────────────────

  esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  _highlight(label, ranges) {
    const text = String(label ?? '');
    if (!ranges.length) return this.esc(text);
    let html = '';
    let cursor = 0;
    for (const [start, end] of ranges) {
      html += this.esc(text.slice(cursor, start));
      html += `<mark>${this.esc(text.slice(start, end))}</mark>`;
      cursor = end;
    }
    return html + this.esc(text.slice(cursor));
  },

  _render() {
    const query = this._input.value;
    this._results = PaletteSearch.filter(this._items, query, {
      groupOrder: this.provider.groups,
      limits: this.provider.limits,
      emptyGroups: this.provider.emptyGroups,
    });

    let html = '';
    let lastGroup = null;
    this._results.forEach((result, index) => {
      const group = result.item.group;
      if (group !== lastGroup) {
        if (lastGroup !== null) html += '</div>';
        const slug = group.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        html += `<div class="palette-group" role="group" aria-labelledby="palette-group-${slug}">`
          + `<div class="palette-group-label" id="palette-group-${slug}">${this.esc(group)}</div>`;
        lastGroup = group;
      }
      html += this._itemHtml(result, index);
    });
    if (lastGroup !== null) html += '</div>';

    if (!this._results.length) {
      const trimmed = query.trim();
      html = `<div class="palette-empty">
        <div class="palette-empty-title">${trimmed ? `No results for “${this.esc(trimmed)}”` : 'Nothing to show'}</div>
        <div class="palette-empty-text">${this.esc(this.provider.emptyHint || 'Try a person, a project, or a command.')}</div>
      </div>`;
    }

    this._list.innerHTML = html;
    this._status.textContent = this._results.length
      ? `${this._results.length} result${this._results.length === 1 ? '' : 's'}`
      : 'No results';
    this._setActive(this._results.length ? 0 : -1, { scroll: false });
    this._list.scrollTop = 0;
  },

  _itemHtml(result, index) {
    const { item } = result;
    const keys = item.kbd
      ? `<span class="palette-item-kbd" aria-hidden="true">${item.kbd.map((key) => `<kbd>${this.esc(key)}</kbd>`).join('')}</span>`
      : '';
    const shortcut = item.kbd ? ` aria-keyshortcuts="${this.esc(item.kbd.map((key) => (key === 'Ctrl' ? 'Control' : key)).join('+'))}"` : '';
    const hint = item.hint ? `<span class="palette-item-hint">${this.esc(item.hint)}</span>` : '';
    return `<div class="palette-item" role="option" id="palette-option-${index}" data-index="${index}" aria-selected="false"${shortcut}>`
      + `<span class="palette-item-icon" aria-hidden="true">${item.iconHtml || this.ICONS.command}</span>`
      + `<span class="palette-item-text"><span class="palette-item-label">${this._highlight(item.label, result.ranges)}</span>${hint}</span>`
      + `${keys}</div>`;
  },

  // ── Helpers for providers ────────────────────────────

  // True when a control exists and is not hidden by class or inline style.
  isVisible(id) {
    const el = document.getElementById(id);
    return Boolean(el) && el.style.display !== 'none' && !el.classList.contains('hidden');
  },

  // The lists re-render a moment after state changes, so wait for the element to exist.
  whenElement(selector, callback, { tries = 25, delay = 40, firstDelay = 60 } = {}) {
    let attempts = 0;
    const attempt = () => {
      const el = document.querySelector(selector);
      if (el) {
        callback(el);
        return;
      }
      if (++attempts < tries) setTimeout(attempt, delay);
    };
    setTimeout(attempt, firstDelay);
  },

  // Move focus to an element that is not normally focusable, with the app's focus ring.
  focusEl(el) {
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
    el.classList.add('palette-landed');
    el.addEventListener('blur', () => el.classList.remove('palette-landed'), { once: true });
    el.focus({ preventScroll: true });
  },

  // Briefly marks the row or card the palette just jumped to.
  flash(el) {
    el.classList.remove('palette-flash');
    void el.offsetWidth; // restart the animation if it is already running
    el.classList.add('palette-flash');
    setTimeout(() => el.classList.remove('palette-flash'), 1800);
  },
};
