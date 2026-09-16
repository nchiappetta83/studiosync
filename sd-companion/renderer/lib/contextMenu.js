(function attachMyTasksContextMenu(globalScope) {
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

        const isLabel = item.type === 'label';
        const btn = document.createElement(item.submenu || isLabel ? 'div' : 'button');
        if (!item.submenu && !isLabel) btn.type = 'button';
        btn.className = `context-menu-item ${item.danger ? 'danger' : ''}${item.submenu ? ' has-submenu' : ''}${isLabel ? ' context-menu-info' : ''}`;

        if (item.icon) {
          const iconTemplate = document.createElement('template');
          iconTemplate.innerHTML = String(item.icon);
          btn.appendChild(iconTemplate.content.cloneNode(true));
        } else if (item.color) {
          const colorDot = document.createElement('span');
          colorDot.style.width = '10px';
          colorDot.style.height = '10px';
          colorDot.style.borderRadius = '50%';
          colorDot.style.background = item.color;
          colorDot.style.flexShrink = '0';
          btn.appendChild(colorDot);
        }

        const label = document.createElement('span');
        label.className = 'context-menu-label';
        label.textContent = item.label || '';
        btn.appendChild(label);

        if (item.submenu) {
          const chevron = document.createElement('span');
          chevron.className = 'context-menu-chevron';
          chevron.setAttribute('aria-hidden', 'true');
          chevron.textContent = String.fromCharCode(8250);
          btn.appendChild(chevron);
        }

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
        } else if (!isLabel) {
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
