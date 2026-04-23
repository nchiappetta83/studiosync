/**
 * Project panel — project cards with Current/Future tabs, Active Only toggle,
 * pop-out project search, and Excel import.
 */

const ProjectPanel = {
  _projectSearchQuery: '',
  _pendingScrollAnchor: null,

  init() {
    this._container = document.getElementById('projects-container');
    this._scroller = document.getElementById('projects-scroll');
    this._tabs = document.getElementById('projects-tabs');
    this._addBtn = document.getElementById('btn-add-project');
    this._importBtn = document.getElementById('btn-import-projects');
    this._activeOnlyCheckbox = document.getElementById('projects-active-only');
    this._searchToggle = document.getElementById('btn-project-search');
    this._searchBar = document.getElementById('project-search-bar');
    this._searchInput = document.getElementById('project-search-input');
    this._searchClose = document.getElementById('btn-close-project-search');

    // Tab switching
    this._tabs.addEventListener('click', (e) => {
      const tab = e.target.closest('.tab');
      if (!tab) return;
      AppState.set('projectTab', tab.dataset.tab);
    });

    // Add project
    this._addBtn.addEventListener('click', () => {
      const activeTab = AppState.get('projectTab');
      TaskDialog.showProjectDialog({}, false, {
        defaultCategory: activeTab === 'future' ? 'future' : 'current'
      });
    });

    // Excel import
    if (this._importBtn) {
      this._importBtn.addEventListener('click', async () => {
        this._importBtn.disabled = true;
        try {
          const result = await window.api.importExcel();
          if (result && !result.error) {
            await AppState.refresh();
            Toast.show(`Imported ${result.imported} new, updated ${result.updated} projects`, 'success');
          } else if (result && result.error) {
            Toast.show(result.error, 'error');
          }
        } catch (err) {
          Toast.show('Import failed: ' + err.message, 'error');
        }
        this._importBtn.disabled = false;
      });
    }

    // Active Only toggle
    if (this._activeOnlyCheckbox) {
      this._activeOnlyCheckbox.addEventListener('change', () => {
        const nextProjects = this._getFilteredProjects({
          activeOnly: this._activeOnlyCheckbox.checked,
        });
        const allowedIds = new Set(nextProjects.map((project) => String(project.id)));
        this._pendingScrollAnchor = this._captureScrollAnchor({ allowedIds });
        this.render();
      });
    }

    // Pop-out project search
    if (this._searchToggle) {
      this._searchToggle.addEventListener('click', () => {
        const isOpen = !this._searchBar.classList.contains('hidden');
        if (isOpen) {
          this._closeSearch();
        } else {
          this._openSearch();
        }
      });
    }

    if (this._searchClose) {
      this._searchClose.addEventListener('click', () => this._closeSearch());
    }

    if (this._searchInput) {
      let debounce;
      this._searchInput.addEventListener('input', () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => {
          this._projectSearchQuery = this._searchInput.value;
          this.render();
        }, 150);
      });

      this._searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') this._closeSearch();
      });
    }

    this._renderListener = this._renderListener || (() => this.render());
    this._tabListener = this._tabListener || (() => this._updateTabs());
    AppState.on('projects', this._renderListener);
    AppState.on('projectTab', this._tabListener);
    AppState.on('projectTab', this._renderListener);
    this._updateTabs();
    this.render();

    // Initialize alpha strip
    AlphaStrip.init();
  },

  _openSearch() {
    this._searchBar.classList.remove('hidden');
    this._searchToggle.classList.add('active');
    this._searchInput.focus();
  },

  _closeSearch() {
    this._searchBar.classList.add('hidden');
    this._searchToggle.classList.remove('active');
    this._searchInput.value = '';
    this._projectSearchQuery = '';
    this.render();
  },

  _updateTabs() {
    const activeTab = AppState.get('projectTab');
    this._tabs.querySelectorAll('.tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === activeTab);
    });
  },

  _getFilteredProjects(options = {}) {
    const tab = AppState.get('projectTab');
    const activeOnly = options.activeOnly ?? (this._activeOnlyCheckbox?.checked ?? true);
    const query = this._projectSearchQuery.toLowerCase();
    let projects = AppState.get('projects') || [];

    // Tab filter — "Current" shows current category, "Future" shows future category
    if (tab === 'active') {
      // Current tab
      if (activeOnly) {
        projects = projects.filter(p => (p.category || 'current') === 'current' && p.status === 'active');
      } else {
        projects = projects.filter(p => (p.category || 'current') === 'current');
      }
    } else if (tab === 'future') {
      if (activeOnly) {
        projects = projects.filter(p => (p.category || 'current') === 'future' && p.status === 'active');
      } else {
        projects = projects.filter(p => (p.category || 'current') === 'future');
      }
    }

    // Search filter
    if (query) {
      projects = projects.filter(p =>
        (p.name && p.name.toLowerCase().includes(query)) ||
        (p.client && p.client.toLowerCase().includes(query)) ||
        (p.notes && p.notes.toLowerCase().includes(query))
      );
    }

    return [...projects].sort((a, b) => {
      const clientCompare = String(a.client || '').localeCompare(String(b.client || ''), undefined, { sensitivity: 'base' });
      if (clientCompare !== 0) return clientCompare;
      return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
    });
  },

  render() {
    const scrollAnchor = this._pendingScrollAnchor || this._captureScrollAnchor();
    this._pendingScrollAnchor = null;
    const projects = this._getFilteredProjects();

    if (projects.length === 0) {
      const tab = AppState.get('projectTab');
      const query = this._projectSearchQuery;
      let emptyMsg;

      if (query) {
        emptyMsg = `No projects matching "${query}"`;
      } else if (tab === 'active') {
        emptyMsg = 'No active projects. Import from Excel or add manually.';
      } else {
        emptyMsg = 'No projects in this category.';
      }

      this._container.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
          </svg>
          <div class="empty-state-title">No projects</div>
          <div class="empty-state-text">${emptyMsg}</div>
        </div>
      `;
      this._restoreScrollAnchor(scrollAnchor);
      return;
    }

    let html = '';
    for (const project of projects) {
      html += ProjectCard.render(project);
    }

    this._container.innerHTML = html;
    ProjectCard.bindEvents(this._container);

    // Update alpha strip with current projects
    AlphaStrip.update(projects);
    this._restoreScrollAnchor(scrollAnchor);
  },

  prepareAnchorNearProject(projectId, options = {}) {
    if (!this._container || !this._scroller) return;

    const cards = Array.from(this._container.querySelectorAll('.project-card'));
    const index = cards.findIndex((card) => card.dataset.projectId === String(projectId));
    if (index < 0) return;

    let anchorCard = cards[index];
    if (options.preferNeighbor === true) {
      anchorCard = cards[index + 1] || cards[index - 1] || anchorCard;
    }

    const scrollerRect = this._scroller.getBoundingClientRect();
    this._pendingScrollAnchor = this._buildAnchorForCard(anchorCard, cards, scrollerRect);
  },

  _buildAnchorForCard(card, cards, scrollerRect) {
    const cardRect = card.getBoundingClientRect();
    return {
      id: card.dataset.projectId || null,
      orderedIds: cards.map((item) => item.dataset.projectId).filter(Boolean),
      index: cards.indexOf(card),
      offset: cardRect.top - scrollerRect.top,
      scrollTop: this._scroller.scrollTop,
    };
  },

  _pickAnchorCard(cards, scrollerRect, options = {}) {
    if (!Array.isArray(cards) || cards.length === 0) return null;

    const allowedIds = options.allowedIds instanceof Set ? options.allowedIds : null;
    const focusBandRatio = 0.4;
    const focusY = scrollerRect.top + (scrollerRect.height * focusBandRatio);
    const candidates = cards
      .map((card) => {
        const rect = card.getBoundingClientRect();
        const visibleTop = Math.max(rect.top, scrollerRect.top);
        const visibleBottom = Math.min(rect.bottom, scrollerRect.bottom);
        const visibleHeight = Math.max(0, visibleBottom - visibleTop);
        const visibleRatio = rect.height > 0 ? visibleHeight / rect.height : 0;
        const centerY = rect.top + (rect.height / 2);

        return {
          card,
          rect,
          centerY,
          visibleHeight,
          visibleRatio,
          distanceToFocus: Math.abs(centerY - focusY),
          allowed: !allowedIds || allowedIds.has(card.dataset.projectId),
        };
      })
      .filter((item) => item.allowed && item.visibleHeight > 0);

    if (candidates.length === 0) {
      return cards[0] || null;
    }

    const nearestToFocus = candidates.reduce((best, item) => {
      if (!best) return item;

      if (item.distanceToFocus !== best.distanceToFocus) {
        return item.distanceToFocus < best.distanceToFocus ? item : best;
      }

      if (item.visibleRatio !== best.visibleRatio) {
        return item.visibleRatio > best.visibleRatio ? item : best;
      }

      return item.visibleHeight > best.visibleHeight ? item : best;
    }, null);

    return nearestToFocus?.card || candidates[0].card;
  },

  _captureScrollAnchor(options = {}) {
    if (!this._container || !this._scroller) return null;

    const cards = Array.from(this._container.querySelectorAll('.project-card'));
    if (cards.length === 0) {
      return {
        id: null,
        orderedIds: [],
        index: -1,
        offset: 0,
        scrollTop: this._scroller.scrollTop,
      };
    }

    const scrollerRect = this._scroller.getBoundingClientRect();
    const allowedIds = options.allowedIds instanceof Set ? options.allowedIds : null;
    const anchorCard = this._pickAnchorCard(cards, scrollerRect, { allowedIds }) || cards[0];
    return this._buildAnchorForCard(anchorCard, cards, scrollerRect);
  },

  _restoreScrollAnchor(anchor) {
    if (!anchor || !this._container || !this._scroller) return;

    requestAnimationFrame(() => {
      const cards = Array.from(this._container.querySelectorAll('.project-card'));
      const cardsById = new Map(cards.map((card) => [card.dataset.projectId, card]));
      let target = anchor.id ? cardsById.get(anchor.id) : null;

      if (!target && Array.isArray(anchor.orderedIds) && anchor.orderedIds.length > 0) {
        const startIndex = Number.isInteger(anchor.index) ? anchor.index : anchor.orderedIds.indexOf(anchor.id);
        const safeIndex = startIndex >= 0 ? startIndex : 0;

        for (let i = safeIndex + 1; i < anchor.orderedIds.length; i += 1) {
          target = cardsById.get(anchor.orderedIds[i]);
          if (target) break;
        }

        if (!target) {
          for (let i = Math.min(safeIndex - 1, anchor.orderedIds.length - 1); i >= 0; i -= 1) {
            target = cardsById.get(anchor.orderedIds[i]);
            if (target) break;
          }
        }
      }

      if (target) {
        const nextScrollTop = target.offsetTop - (anchor.offset || 0);
        this._scroller.scrollTop = Math.max(0, nextScrollTop);
        return;
      }

      const maxScroll = Math.max(0, this._scroller.scrollHeight - this._scroller.clientHeight);
      this._scroller.scrollTop = Math.min(anchor.scrollTop || 0, maxScroll);
    });
  }
};
