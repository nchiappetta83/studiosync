(function attachMyTasksContextMenu(globalScope) {
  function escapeHtml(value) {
    if (!value) return '';
    const div = document.createElement('div');
    div.textContent = value;
    return div.innerHTML;
  }

  function positionMenu(menu, x, y) {
    menu.style.top = `${y}px`;
    menu.style.left = `${x}px`;

    requestAnimationFrame(() => {
      const rect = menu.getBoundingClientRect();
      if (rect.bottom > window.innerHeight - 8) {
        menu.style.top = `${Math.max(8, window.innerHeight - rect.height - 8)}px`;
      }
      if (rect.right > window.innerWidth - 8) {
        menu.style.left = `${Math.max(8, window.innerWidth - rect.width - 8)}px`;
      }
    });
  }

  const ContextMenu = {
    _current: null,

    create(items) {
      this.dismiss();

      const menu = document.createElement('div');
      menu.className = 'context-menu';
      this._appendItems(menu, items);

      document.body.appendChild(menu);
      this._current = menu;

      setTimeout(() => {
        document.addEventListener('click', this._onOutsideClick);
        document.addEventListener('keydown', this._onEscape);
      }, 0);

      return menu;
    },

    _appendItems(container, items) {
      for (const item of items) {
        if (item.divider) {
          const divider = document.createElement('div');
          divider.className = 'context-menu-divider';
          container.appendChild(divider);
          continue;
        }

        const btn = document.createElement(item.submenu ? 'div' : 'button');
        if (!item.submenu) btn.type = 'button';
        btn.className = `context-menu-item ${item.danger ? 'danger' : ''}${item.submenu ? ' has-submenu' : ''}`;

        let iconHtml = '';
        if (item.icon) {
          iconHtml = item.icon;
        } else if (item.color) {
          iconHtml = `<span style="width:10px;height:10px;border-radius:50%;background:${item.color};flex-shrink:0;"></span>`;
        }

        const chevronHtml = item.submenu
          ? '<span class="context-menu-chevron" aria-hidden="true">&#8250;</span>'
          : '';

        btn.innerHTML = `${iconHtml}<span class="context-menu-label">${escapeHtml(item.label)}</span>${chevronHtml}`;

        if (item.submenu) {
          const submenu = document.createElement('div');
          submenu.className = 'context-menu context-submenu';
          this._appendItems(submenu, item.submenu);
          btn.appendChild(submenu);

          const positionSubmenu = () => {
            requestAnimationFrame(() => {
              const rect = submenu.getBoundingClientRect();
              btn.classList.toggle('open-left', rect.right > window.innerWidth - 8);
              btn.classList.toggle('open-up', rect.bottom > window.innerHeight - 8);
            });
          };

          btn.addEventListener('mouseenter', positionSubmenu);
          btn.addEventListener('focusin', positionSubmenu);
        } else {
          btn.addEventListener('click', () => {
            this.dismiss();
            if (item.action) item.action();
          });
        }

        container.appendChild(btn);
      }
    },

    dismiss() {
      if (this._current) {
        this._current.remove();
        this._current = null;
      }
      document.removeEventListener('click', this._onOutsideClick);
      document.removeEventListener('keydown', this._onEscape);
    },

    _onOutsideClick(e) {
      if (ContextMenu._current && !ContextMenu._current.contains(e.target)) {
        ContextMenu.dismiss();
      }
    },

    _onEscape(e) {
      if (e.key === 'Escape') {
        ContextMenu.dismiss();
      }
    },
  };

  globalScope.ContextMenu = ContextMenu;
  globalScope.positionMenu = positionMenu;
})(window);
