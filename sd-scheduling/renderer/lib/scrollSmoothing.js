(function (globalScope) {
  'use strict';

  // Keep precision touchpads and scrollbar drags native. This only softens the
  // larger, discrete wheel steps commonly produced by a traditional mouse.
  const MOUSE_WHEEL_THRESHOLD = 48;
  const LINE_HEIGHT = 16;
  const states = new WeakMap();

  function prefersReducedMotion() {
    return Boolean(globalScope.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  }

  function wheelPixels(event, surface) {
    if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return event.deltaY * LINE_HEIGHT;
    if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return event.deltaY * surface.clientHeight;
    return event.deltaY;
  }

  function isTraditionalWheel(event) {
    if (event.deltaMode !== WheelEvent.DOM_DELTA_PIXEL) return true;
    return Math.abs(event.deltaY) >= MOUSE_WHEEL_THRESHOLD;
  }

  function getSurface(target, selector) {
    if (!(target instanceof Element)) return null;
    const surface = target.closest(selector);
    if (!surface) return null;
    return surface.scrollHeight > surface.clientHeight + 1 ? surface : null;
  }

  function stop(state) {
    if (state.frame) cancelAnimationFrame(state.frame);
    state.frame = null;
    state.active = false;
  }

  function animate(surface, state) {
    const current = surface.scrollTop;
    const distance = state.target - current;
    if (Math.abs(distance) < 0.75) {
      surface.scrollTop = state.target;
      state.active = false;
      state.frame = null;
      return;
    }

    surface.scrollTop = current + (distance * 0.34);
    state.frame = requestAnimationFrame(() => animate(surface, state));
  }

  function init({ selector } = {}) {
    if (!selector || prefersReducedMotion() || document.documentElement.dataset.studiosyncScrollSmoothing === 'true') return;
    document.documentElement.dataset.studiosyncScrollSmoothing = 'true';

    document.querySelectorAll(selector).forEach((surface) => {
      surface.dataset.studiosyncScrollSurface = 'true';
    });

    document.addEventListener('wheel', (event) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.buttons || event.deltaY === 0) return;
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY) || !isTraditionalWheel(event)) return;

      const surface = getSurface(event.target, selector);
      if (!surface) return;

      const delta = wheelPixels(event, surface);
      const maximum = Math.max(0, surface.scrollHeight - surface.clientHeight);
      const state = states.get(surface) || { target: surface.scrollTop, active: false, frame: null };
      const current = surface.scrollTop;
      const previousDirection = Math.sign(state.target - current);
      const nextDirection = Math.sign(delta);
      if (!state.active || (previousDirection && nextDirection && previousDirection !== nextDirection)) {
        state.target = current;
      }

      const nextTarget = Math.max(0, Math.min(maximum, state.target + delta));
      // Let normal scroll chaining handle an edge instead of trapping a wheel
      // gesture inside a finished list.
      if (Math.abs(nextTarget - current) < 0.5 && Math.abs(nextTarget - state.target) < 0.5) return;

      event.preventDefault();
      state.target = nextTarget;
      states.set(surface, state);
      if (!state.active) {
        state.active = true;
        state.frame = requestAnimationFrame(() => animate(surface, state));
      }
    }, { passive: false });

    document.addEventListener('pointerdown', () => {
      // A thumb drag or direct click should take over immediately.
      document.querySelectorAll('[data-studiosync-scroll-surface="true"]').forEach((surface) => {
        const state = states.get(surface);
        if (state?.active) stop(state);
      });
    }, { passive: true });
  }

  globalScope.StudioSyncScrollSmoothing = { init };
})(window);
