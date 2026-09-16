(function attachMyTasksModalManager() {
  const modalState = new WeakMap();
  let lastOutsideFocus = document.activeElement;

  function isVisible(overlay) {
    return overlay?.isConnected && !overlay.classList.contains('hidden');
  }

  function getFocusable(card) {
    return [...card.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
      .filter((element) => !element.disabled && element.offsetParent !== null);
  }

  function prepareOverlay(overlay) {
    const card = overlay.querySelector('.dialog-card');
    if (!card) return;

    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    const title = card.querySelector('.dialog-title, .update-dialog-title');
    if (title) {
      if (!title.id) title.id = `dialog-title-${Math.random().toString(36).slice(2, 9)}`;
      card.setAttribute('aria-labelledby', title.id);
    }

    card.querySelectorAll('.detail-close').forEach((button) => {
      if (!button.hasAttribute('type')) button.setAttribute('type', 'button');
      if (!button.hasAttribute('aria-label')) button.setAttribute('aria-label', 'Close dialog');
    });

    if (isVisible(overlay) && !modalState.has(overlay)) {
      modalState.set(overlay, { opener: lastOutsideFocus });
    }
  }

  function restoreFocus(overlay) {
    const opener = modalState.get(overlay)?.opener;
    modalState.delete(overlay);
    if (opener?.isConnected && typeof opener.focus === 'function') {
      requestAnimationFrame(() => opener.focus({ preventScroll: true }));
    }
  }

  function inspectNode(node) {
    if (!(node instanceof Element)) return;
    if (node.matches('.dialog-overlay')) prepareOverlay(node);
    node.querySelectorAll?.('.dialog-overlay').forEach(prepareOverlay);
  }

  document.querySelectorAll('.dialog-overlay').forEach(prepareOverlay);

  document.addEventListener('focusin', (event) => {
    if (!event.target.closest?.('.dialog-overlay:not(.hidden)')) {
      lastOutsideFocus = event.target;
    }
  });

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes') {
        const overlay = mutation.target;
        if (isVisible(overlay)) prepareOverlay(overlay);
        else restoreFocus(overlay);
        continue;
      }

      mutation.addedNodes.forEach(inspectNode);
      mutation.removedNodes.forEach((node) => {
        if (!(node instanceof Element)) return;
        if (node.matches('.dialog-overlay')) restoreFocus(node);
        node.querySelectorAll?.('.dialog-overlay').forEach(restoreFocus);
      });
    }
  });

  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ['class'],
    childList: true,
    subtree: true,
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const overlays = [...document.querySelectorAll('.dialog-overlay:not(.hidden)')];
    const overlay = overlays[overlays.length - 1];
    const card = overlay?.querySelector('.dialog-card');
    if (!card) return;

    const focusable = getFocusable(card);
    if (focusable.length === 0) {
      event.preventDefault();
      card.tabIndex = -1;
      card.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    } else if (!card.contains(document.activeElement)) {
      event.preventDefault();
      first.focus();
    }
  }, true);
})();
