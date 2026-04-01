/**
 * Print/Export Dialog — PDF or HTML export options.
 */

const PrintDialog = {
  show() {
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    overlay.innerHTML = `
      <div class="dialog">
        <div class="dialog-header">
          <div class="dialog-title">Export Schedule</div>
          <div class="dialog-subtitle">Choose an export format</div>
        </div>
        <div class="dialog-body">
          <div class="export-option selected" data-format="html">
            <div class="export-option-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="16 18 22 12 16 6"></polyline>
                <polyline points="8 6 2 12 8 18"></polyline>
              </svg>
            </div>
            <div class="export-option-text">
              <h3>HTML (Interactive)</h3>
              <p>Clickable task list — staff can mark tasks as done. Place on a shared drive for easy access.</p>
            </div>
          </div>
          <div class="export-option" data-format="pdf">
            <div class="export-option-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
            </div>
            <div class="export-option-text">
              <h3>PDF (For Printing)</h3>
              <p>Static two-column layout formatted for 11\u00D717 paper.</p>
            </div>
          </div>
        </div>
        <div class="dialog-footer">
          <button class="btn btn-ghost" id="dialog-cancel">Cancel</button>
          <button class="btn btn-primary" id="dialog-export">Export</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    let selectedFormat = 'html';
    const close = () => {
      document.removeEventListener('keydown', onEsc);
      overlay.remove();
    };

    // Toggle selection
    overlay.querySelectorAll('.export-option').forEach(opt => {
      opt.addEventListener('click', () => {
        overlay.querySelectorAll('.export-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        selectedFormat = opt.dataset.format;
      });
    });

    // Cancel
    overlay.querySelector('#dialog-cancel').addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });

    // Export
    overlay.querySelector('#dialog-export').addEventListener('click', async () => {
      close();

      try {
        let result;
        if (selectedFormat === 'pdf') {
          result = await window.api.exportPDF();
        } else {
          result = await window.api.exportHTML();
        }

        if (result) {
          Toast.show(`Exported to ${result}`, 'success');
        }
      } catch (err) {
        Toast.show('Export failed: ' + err.message, 'error');
      }
    });

    const onEsc = (e) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onEsc);
  }
};
