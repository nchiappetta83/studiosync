(function attachConfirmDialog(globalScope) {
  function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = String(value || '');
    return div.innerHTML;
  }

  function showDialog(options = {}) {
    return new Promise((resolve) => {
      const existing = document.querySelector('.confirm-dialog-overlay:not(.is-leaving)');
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

  function choose(options = {}) {
    return new Promise((resolve) => {
      const existing = document.querySelector('.confirm-dialog-overlay:not(.is-leaving), .choice-dialog-layer');
      if (existing) {
        resolve({ confirmed: false, choice: null });
        return;
      }

      const title = options.title || 'Choose an option';
      const message = options.message || '';
      const secondaryLabel = options.secondaryLabel || 'Keep separate';
      const primaryLabel = options.primaryLabel || 'Apply to all';
      const layer = document.createElement('div');
      layer.className = 'choice-dialog-layer';
      layer.innerHTML = `
        <section class="choice-dialog" role="dialog" aria-modal="true" aria-labelledby="choice-dialog-title">
          <div class="choice-dialog-copy">
            <h2 id="choice-dialog-title">${escapeHtml(title)}</h2>
            ${message ? `<p>${escapeHtml(message)}</p>` : ''}
          </div>
          <div class="choice-dialog-actions">
            <button type="button" class="btn btn-ghost choice-dialog-secondary">${escapeHtml(secondaryLabel)}</button>
            <button type="button" class="btn btn-primary choice-dialog-primary">${escapeHtml(primaryLabel)}</button>
          </div>
        </section>
      `;
      document.body.appendChild(layer);

      const secondaryBtn = layer.querySelector('.choice-dialog-secondary');
      const primaryBtn = layer.querySelector('.choice-dialog-primary');
      let settled = false;

      const cleanup = (choice = null) => {
        if (settled) return;
        settled = true;
        layer.remove();
        document.removeEventListener('keydown', handleKeydown);
        resolve({ confirmed: Boolean(choice), choice });
      };

      const handleKeydown = (event) => {
        if (event.key === 'Escape') cleanup();
      };

      secondaryBtn?.addEventListener('click', () => cleanup('single'));
      primaryBtn?.addEventListener('click', () => cleanup('all'));
      layer.addEventListener('click', (event) => {
        if (event.target === layer) cleanup();
      });
      document.addEventListener('keydown', handleKeydown);
      requestAnimationFrame(() => primaryBtn?.focus());
    });
  }

  globalScope.ConfirmDialog = {
    show,
    showWithCheckbox: showDialog,
    choose,
  };
})(window);
