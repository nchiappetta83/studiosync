(function attachMyTasksToast(globalScope) {
  let container = null;

  function getContainer() {
    if (container?.isConnected) return container;
    container = document.createElement('div');
    container.className = 'toast-region';
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('aria-relevant', 'additions');
    document.body.appendChild(container);
    return container;
  }

  function show(options = {}) {
    const message = String(options.message || '').trim();
    if (!message) return { close() {} };

    const region = getContainer();
    const toast = document.createElement('div');
    const tone = ['success', 'error', 'warning'].includes(options.tone) ? options.tone : 'neutral';
    toast.className = `app-toast app-toast-${tone}`;
    toast.setAttribute('role', tone === 'error' ? 'alert' : 'status');

    const marker = document.createElement('span');
    marker.className = 'app-toast-marker';
    marker.setAttribute('aria-hidden', 'true');

    const copy = document.createElement('span');
    copy.className = 'app-toast-copy';
    copy.textContent = message;

    toast.append(marker, copy);

    let closed = false;
    let timeoutId = null;
    const close = () => {
      if (closed) return;
      closed = true;
      if (timeoutId) clearTimeout(timeoutId);
      toast.classList.add('is-leaving');
      setTimeout(() => toast.remove(), 180);
    };

    if (options.actionLabel && typeof options.onAction === 'function') {
      const action = document.createElement('button');
      action.className = 'app-toast-action';
      action.type = 'button';
      action.textContent = options.actionLabel;
      action.addEventListener('click', async () => {
        action.disabled = true;
        try {
          await options.onAction();
          close();
        } catch (error) {
          action.disabled = false;
          show({ message: error?.message || 'That action could not be completed.', tone: 'error' });
        }
      });
      toast.appendChild(action);
    }

    const dismiss = document.createElement('button');
    dismiss.className = 'app-toast-dismiss';
    dismiss.type = 'button';
    dismiss.setAttribute('aria-label', 'Dismiss notification');
    dismiss.textContent = '\u00d7';
    dismiss.addEventListener('click', close);
    toast.appendChild(dismiss);

    region.prepend(toast);
    [...region.children].slice(4).forEach((item) => item.remove());
    requestAnimationFrame(() => toast.classList.add('is-visible'));

    const duration = Number(options.duration) || (options.actionLabel ? 7000 : 3800);
    timeoutId = setTimeout(close, duration);
    return { close };
  }

  globalScope.MyTasksToast = { show };
})(window);
