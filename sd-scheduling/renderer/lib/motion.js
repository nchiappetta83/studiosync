/**
 * Motion helpers, shared by the Dashboard and MyTasks (keep this file identical in both; the smoke
 * tests check). The look lives in styles/motion.css. Everything here stands down when the user has
 * asked for reduced motion, and none of it is required for the app to work.
 *
 * Load this before the rest of the scripts so exits apply from the first popup onward.
 */
(function attachMotion(globalScope) {
  'use strict';

  const query = globalScope.matchMedia ? globalScope.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const reduced = () => Boolean(query && query.matches);

  // Read a motion token from CSS so JavaScript-driven motion uses the same timing as the stylesheet.
  const root = document.documentElement;
  const token = (name) => globalScope.getComputedStyle(root).getPropertyValue(name).trim();
  const tokenMs = (name) => {
    const value = token(name);
    return value.endsWith('ms') ? parseFloat(value) : parseFloat(value) * 1000;
  };

  // ── Exits ──────────────────────────────────────────────
  // Dialogs, menus and toasts are removed with el.remove(), which would make them vanish. Instead a
  // removed one is marked .is-leaving, made inert, and really removed once its exit animation ends.
  const EXIT_SELECTOR = '.dialog-overlay, .palette-overlay, .context-menu, .priority-menu, .date-picker-popup, .toast';
  const EXIT_FALLBACK_MS = 240;
  const nativeRemove = Element.prototype.remove;

  function leave(el) {
    el.dataset.motionLeaving = 'true';
    // Free the ids so a dialog or menu opened right away is not shadowed by this one.
    el.removeAttribute('id');
    el.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'));
    el.setAttribute('inert', '');
    el.setAttribute('aria-hidden', 'true');
    el.classList.add('is-leaving');

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      nativeRemove.call(el);
    };
    el.addEventListener('animationend', (event) => {
      if (event.target === el) finish();
    });
    setTimeout(finish, EXIT_FALLBACK_MS);
  }

  Element.prototype.remove = function remove() {
    if (this instanceof HTMLElement
      && this.isConnected
      && !this.dataset.motionLeaving
      && !reduced()
      && this.matches(EXIT_SELECTOR)) {
      leave(this);
      return;
    }
    nativeRemove.call(this);
  };

  // ── Sliding indicator ──────────────────────────────────
  // One underline that glides to the active tab instead of each tab switching its own on and off.
  // The position is published as CSS variables so motion.css owns the look and the spring.
  function indicator(container, { item = '.tab', active = '.tab.active', bottom = '0px' } = {}) {
    if (!container || container.dataset.motionIndicator) return;
    container.dataset.motionIndicator = 'true';
    if (globalScope.getComputedStyle(container).position === 'static') container.style.position = 'relative';
    container.style.setProperty('--indicator-bottom', bottom);

    const bar = document.createElement('span');
    bar.className = 'motion-indicator';
    bar.setAttribute('aria-hidden', 'true');
    container.appendChild(bar);

    let ready = false;
    let lastX = null;
    let lastW = null;
    const update = () => {
      const target = container.querySelector(active);
      if (!target || !container.contains(target) || target.offsetWidth === 0) {
        if (container.classList.contains('has-motion-indicator')) container.classList.remove('has-motion-indicator');
        return;
      }
      const x = target.offsetLeft;
      const w = target.offsetWidth;
      if (x !== lastX || w !== lastW) {
        lastX = x;
        lastW = w;
        container.style.setProperty('--indicator-x', `${x}px`);
        container.style.setProperty('--indicator-w', `${w}px`);
      }
      if (!container.classList.contains('has-motion-indicator')) container.classList.add('has-motion-indicator');
      if (!ready) {
        ready = true;
        // Place it without animating the first time, then let later moves glide.
        requestAnimationFrame(() => container.classList.add('is-indicator-ready'));
      }
    };

    new MutationObserver(update).observe(container, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'aria-selected'],
    });
    if (globalScope.ResizeObserver) new ResizeObserver(update).observe(container);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(update);
    update();
  }

  // ── Content swap ───────────────────────────────────────
  // When a panel switches to different content (another person, project or tab), its new children
  // rise in softly. The same content re-rendering (a refresh) is left alone, so nothing flickers.
  function swap(el, key) {
    if (!el || reduced()) return;
    const next = String(key);
    const hadKey = el.dataset.motionKey !== undefined;
    if (el.dataset.motionKey === next) return;
    el.dataset.motionKey = next;
    if (!hadKey) return; // first render: nothing to animate from
    el.classList.remove('motion-swap-in');
    void el.offsetWidth; // restart if it is already running
    el.classList.add('motion-swap-in');
    clearTimeout(el._motionSwapTimer);
    el._motionSwapTimer = setTimeout(() => el.classList.remove('motion-swap-in'), 400);
  }

  // ── Lists that move ────────────────────────────────────
  // When a person's own action changes a list (completing, reprioritising, reassigning, moving a
  // Work Card, choosing someone in the sidebar), items glide from where they were to where they are
  // now, and new items ease in. This is FLIP (First, Last, Invert, Play), done without touching the
  // apps' render code:
  //   First:  the moment the person clicks or presses a key, record where every item is.
  //   Last:   whenever items change in the page shortly afterwards, measure again.
  //   Play:   animate each element that moved from its old position to its new one.
  // The live elements are animated, so the page stays interactive and text stays sharp. Changes that
  // do not follow a click or key press (background syncs) and typing in a field never animate.
  const ITEM_SELECTOR = [
    '.task-card[data-task-id]',
    '.project-card[data-project-id]',
    '.personal-project-card[data-project-id]',
    '.project-work-card[data-work-card-id]',
    '.my-week-card[data-work-card-id]',
    '.staff-project-row[data-project-id][data-staff-id]',
  ].join(', ');
  const INTENT_WINDOW_MS = 900; // how long after a click or key press a change counts as the person's own
  const BURST_MS = 260;         // one action often renders several times in a row; replay from the same start
  const MAX_ENTERING = 14;      // large list swaps animate the first screenful, not hundreds of rows

  let snapshot = null;          // { at, items, fills, checked }: how things looked when the person last clicked or pressed a key
  let burstUntil = 0;
  let animatedInBurst = new WeakSet();

  // If the app renders again while items are still gliding (the old elements are replaced), a new
  // glide must start from where each item currently appears, not from where it began, or it would
  // jump back. So, while items glide, their on-screen position is sampled every frame.
  const gliding = new Map();    // key -> element currently gliding
  const lastSeen = new Map();   // key -> where that item last appeared on screen
  let sampling = false;

  function sampleGliding() {
    if (sampling) return;
    sampling = true;
    const tick = () => {
      let any = false;
      gliding.forEach((el, key) => {
        if (!el.isConnected || el.getAnimations().length === 0) {
          gliding.delete(key); // replaced or finished; lastSeen keeps its final position
          return;
        }
        lastSeen.set(key, el.getBoundingClientRect());
        any = true;
      });
      if (any) requestAnimationFrame(tick);
      else sampling = false;
    };
    requestAnimationFrame(tick);
  }

  const isTypingTarget = (el) => Boolean(el && (el.isContentEditable
    || el.tagName === 'TEXTAREA'
    || el.tagName === 'SELECT'
    || (el.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'submit'].includes(el.type))));

  function itemKey(el) {
    return [el.dataset.taskId, el.dataset.projectId, el.dataset.workCardId, el.dataset.staffId]
      .filter(Boolean)
      .join('|');
  }

  // Where every on-screen item is right now (including any move still in progress).
  function measure() {
    const items = new Map();
    const limitBottom = globalScope.innerHeight + 200;
    document.querySelectorAll(ITEM_SELECTOR).forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0 || rect.bottom < -200 || rect.top > limitBottom) return;
      const key = itemKey(el);
      if (!items.has(key)) items.set(key, { el, rect });
    });
    return items;
  }

  // Bars (capacity, load, schedule progress) carry their width inline and are re-rendered from scratch,
  // so a CSS transition can never run on them. They are matched by the id of the thing they belong to
  // plus their position within it, and eased from the old width to the new one.
  const FILL_SELECTOR = '.staff-load-bar > i, .my-week-load-bar > b, .work-card-progress > i';
  const HOST_SELECTOR = '[data-work-card-id], [data-task-id], [data-project-id], [data-user-id], [data-staff-id], [data-day]';

  function fillKey(el) {
    const host = el.closest(HOST_SELECTOR);
    const id = host
      ? (host.dataset.workCardId || host.dataset.taskId || host.dataset.projectId || host.dataset.userId || host.dataset.staffId || host.dataset.day)
      : '';
    const scope = host || document;
    return `${id}#${[...scope.querySelectorAll(FILL_SELECTOR)].indexOf(el)}`;
  }

  function measureFills() {
    const fills = new Map();
    document.querySelectorAll(FILL_SELECTOR).forEach((el) => {
      const percent = parseFloat(el.style.width);
      if (Number.isNaN(percent)) return;
      const key = fillKey(el);
      if (!fills.has(key)) fills.set(key, { el, percent });
    });
    return fills;
  }

  // Completed checkboxes, so one that has just become checked can pop.
  const CHECKED_SELECTOR = '.task-checkbox.checked[data-task-id]';
  const measureChecked = () => new Set([...document.querySelectorAll(CHECKED_SELECTOR)].map((el) => el.dataset.taskId));

  // Animate what changed since the snapshot. Returns true if anything animated.
  function play(snap) {
    const before = snap.items;
    const after = measure();
    const moveMs = tokenMs('--spring-snappy-duration');
    const enterMs = tokenMs('--motion-base');
    const moveEasing = token('--spring-snappy') || 'ease-out';
    const enterEasing = token('--ease-standard') || 'ease-out';
    let entering = 0;
    let animated = false;

    // A checkbox that has just become checked pops.
    const popMs = tokenMs('--spring-gentle-duration');
    const popEasing = token('--spring-gentle') || 'ease-out';
    document.querySelectorAll(CHECKED_SELECTOR).forEach((el) => {
      if (snap.checked.has(el.dataset.taskId) || animatedInBurst.has(el)) return;
      el.animate([{ transform: 'scale(0.7)' }, { transform: 'scale(1)' }], { duration: popMs, easing: popEasing });
      animatedInBurst.add(el);
      animated = true;
    });

    // A bar whose value changed eases to its new width.
    const fillMs = tokenMs('--motion-slow');
    measureFills().forEach((now, key) => {
      const was = snap.fills.get(key);
      if (!was || animatedInBurst.has(now.el) || Math.abs(was.percent - now.percent) < 0.5) return;
      now.el.animate([{ width: `${was.percent}%` }, { width: `${now.percent}%` }], { duration: fillMs, easing: enterEasing });
      animatedInBurst.add(now.el);
      animated = true;
    });

    after.forEach((now, key) => {
      if (animatedInBurst.has(now.el)) return; // already animating from an earlier render in this burst
      // Where it appeared a moment ago: its live position if it was mid-glide, else the snapshot.
      const seen = lastSeen.get(key);
      const from = seen || (before.get(key) && before.get(key).rect);
      if (from) {
        const dx = from.left - now.rect.left;
        const dy = from.top - now.rect.top;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
        now.el.animate(
          [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
          { duration: moveMs, easing: moveEasing },
        );
        animatedInBurst.add(now.el);
        gliding.set(key, now.el);
        lastSeen.set(key, from);
        animated = true;
      } else if (entering < MAX_ENTERING) {
        now.el.animate(
          [{ opacity: 0, transform: 'translateY(8px) scale(0.985)' }, { opacity: 1, transform: 'none' }],
          { duration: enterMs, easing: enterEasing, delay: Math.min(entering * 18, 160), fill: 'backwards' },
        );
        animatedInBurst.add(now.el);
        entering += 1;
        animated = true;
      }
    });
    if (gliding.size) sampleGliding();
    return animated;
  }

  function capture() {
    snapshot = { at: performance.now(), items: measure(), fills: measureFills(), checked: measureChecked() };
    burstUntil = 0;
    animatedInBurst = new WeakSet();
    gliding.clear();
    lastSeen.clear();
  }

  if (typeof Element.prototype.animate === 'function') {
    // The positions at the moment of the click or key press are the "before". Typing in a field is
    // never the person asking for a list to move, so it clears the snapshot instead.
    ['pointerdown', 'pointerup', 'keydown'].forEach((type) => {
      document.addEventListener(type, (event) => {
        if (reduced()) return;
        if (isTypingTarget(event.target)) {
          snapshot = null;
        } else {
          capture();
        }
      }, true);
    });
    // Scrolling or resizing moves everything on screen, which is not a list change.
    document.addEventListener('wheel', () => { snapshot = null; }, { capture: true, passive: true });
    globalScope.addEventListener('resize', () => { snapshot = null; });

    const observe = () => {
      new MutationObserver(() => {
        if (!snapshot || reduced()) return;
        const now = performance.now();
        const expired = burstUntil ? now > burstUntil : now - snapshot.at > INTENT_WINDOW_MS;
        if (expired) {
          snapshot = null;
          return;
        }
        if (play(snapshot) && !burstUntil) burstUntil = now + BURST_MS;
      }).observe(document.body, { childList: true, subtree: true });
    };
    if (document.body) observe();
    else document.addEventListener('DOMContentLoaded', observe, { once: true });
  }

  globalScope.Motion = { reduced, indicator, swap };
})(window);
