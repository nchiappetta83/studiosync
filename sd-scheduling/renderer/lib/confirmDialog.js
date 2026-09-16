(function attachConfirmDialog(globalScope) {
  function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = String(value || '');
    return div.innerHTML;
  }

  function showDialog(options = {}) {
    return new Promise((resolve) => {
      const existing = document.querySelector('.confirm-dialog-overlay');
      if (existing) {
        existing.querySelector('.confirm-dialog-confirm')?.focus();
        resolve({ confirmed: false, checked: false });
        return;
      }

      const title = options.title || 'Confirm action';
      const subtitle = options.subtitle || '';
      const message = options.message || 'Are you sure?';
      const confirmLabel = options.confirmLabel || 'Confirm';
      const cancelLabel = options.cancelLabel || 'Cancel';
      const tone = options.tone === 'danger' ? 'danger' : 'primary';
      const checkbox = options.checkbox || null;

      const overlay = document.createElement('div');
      overlay.className = 'dialog-overlay confirm-dialog-overlay';
      overlay.innerHTML = `
        <div class="dialog dialog-confirm" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
          <div class="dialog-header">
            <h2 class="dialog-title" id="confirm-dialog-title">${escapeHtml(title)}</h2>
            ${subtitle ? `<p class="dialog-subtitle">${escapeHtml(subtitle)}</p>` : ''}
          </div>
          <div class="dialog-body">
            <p class="dialog-confirm-copy">${escapeHtml(message)}</p>
            ${checkbox ? `
              <label class="dialog-checkbox-row">
                <input type="checkbox" class="confirm-dialog-checkbox" ${checkbox.checked ? 'checked' : ''}>
                <span class="dialog-checkbox-copy">
                  <span class="dialog-checkbox-label">${escapeHtml(checkbox.label)}</span>
                  ${checkbox.help ? `<span class="dialog-checkbox-help">${escapeHtml(checkbox.help)}</span>` : ''}
                </span>
              </label>
            ` : ''}
          </div>
          <div class="dialog-footer">
            <button type="button" class="btn btn-ghost confirm-dialog-cancel">${escapeHtml(cancelLabel)}</button>
            <button type="button" class="btn ${tone === 'danger' ? 'btn-danger' : 'btn-primary'} confirm-dialog-confirm">${escapeHtml(confirmLabel)}</button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      const checkboxEl = overlay.querySelector('.confirm-dialog-checkbox');
      const cancelBtn = overlay.querySelector('.confirm-dialog-cancel');
      const confirmBtn = overlay.querySelector('.confirm-dialog-confirm');
      let settled = false;

      const cleanup = (confirmed) => {
        if (settled) return;
        settled = true;
        const checked = Boolean(checkboxEl?.checked);
        overlay.remove();
        document.removeEventListener('keydown', handleKeydown);
        resolve({ confirmed, checked });
      };

      const handleKeydown = (event) => {
        if (event.key === 'Escape') cleanup(false);
      };

      cancelBtn?.addEventListener('click', () => cleanup(false));
      confirmBtn?.addEventListener('click', () => cleanup(true));
      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) cleanup(false);
      });
      document.addEventListener('keydown', handleKeydown);

      requestAnimationFrame(() => confirmBtn?.focus());
    });
  }

  async function show(options = {}) {
    const result = await showDialog(options);
    return result.confirmed;
  }

  globalScope.ConfirmDialog = {
    show,
    showWithCheckbox: showDialog,
  };
})(window);
