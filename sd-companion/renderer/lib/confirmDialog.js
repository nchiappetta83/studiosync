(function attachMyTasksConfirmDialog(globalScope) {
  const { escapeHtml } = globalScope.MyTasksHtml || {
    escapeHtml(value) {
      const div = document.createElement('div');
      div.textContent = String(value || '');
      return div.innerHTML;
    },
  };

  function createDialog(options = {}) {
    return new Promise((resolve) => {
      const existing = document.querySelector('.confirm-dialog-overlay');
      if (existing) {
        existing.querySelector('.confirm-dialog-confirm')?.focus();
        resolve(options.cancelValue);
        return;
      }

      const title = options.title || 'Confirm action';
      const message = options.message || 'Are you sure?';
      const confirmLabel = options.confirmLabel || 'Confirm';
      const cancelLabel = options.cancelLabel || 'Cancel';
      const tone = options.tone === 'danger' ? 'danger' : 'primary';
      const showCancel = options.showCancel !== false;

      const overlay = document.createElement('div');
      overlay.className = 'dialog-overlay confirm-dialog-overlay';
      overlay.innerHTML = `
        <div class="dialog-card confirm-dialog-card" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
          <div class="dialog-header">
            <h2 class="dialog-title" id="confirm-dialog-title">${escapeHtml(title)}</h2>
          </div>
          <div class="dialog-body">
            <p class="dialog-confirm-copy">${escapeHtml(message)}</p>
          </div>
          <div class="dialog-footer">
            ${showCancel ? `<button type="button" class="btn btn-ghost confirm-dialog-cancel">${escapeHtml(cancelLabel)}</button>` : ''}
            <button type="button" class="btn ${tone === 'danger' ? 'btn-danger' : 'btn-primary'} confirm-dialog-confirm">${escapeHtml(confirmLabel)}</button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      const cancelBtn = overlay.querySelector('.confirm-dialog-cancel');
      const confirmBtn = overlay.querySelector('.confirm-dialog-confirm');
      let settled = false;

      const cleanup = (result) => {
        if (settled) return;
        settled = true;
        overlay.remove();
        document.removeEventListener('keydown', handleKeydown);
        resolve(result);
      };

      const handleKeydown = (event) => {
        if (event.key === 'Escape') cleanup(options.cancelValue);
      };

      cancelBtn?.addEventListener('click', () => cleanup(options.cancelValue));
      confirmBtn?.addEventListener('click', () => cleanup(options.confirmValue));
      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) cleanup(options.cancelValue);
      });
      document.addEventListener('keydown', handleKeydown);

      requestAnimationFrame(() => confirmBtn?.focus());
    });
  }

  function show(options = {}) {
    return createDialog({
      ...options,
      cancelValue: false,
      confirmValue: true,
      showCancel: options.showCancel,
    });
  }

  function alert(options = {}) {
    return createDialog({
      title: options.title || 'Notice',
      message: options.message || '',
      confirmLabel: options.confirmLabel || 'OK',
      tone: options.tone,
      cancelValue: undefined,
      confirmValue: undefined,
      showCancel: false,
    });
  }

  globalScope.MyTasksConfirmDialog = { alert, show };
})(window);
