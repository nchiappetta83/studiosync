/**
 * AlphaStrip — V4-style alphabetical jump strip for the project list.
 * Fills full height with evenly spaced letters and separator dots.
 * Features a floating dot indicator that tracks current scroll position.
 */

const AlphaStrip = {
  _el: null,
  _scrollEl: null,
  _canvas: null,
  _ctx: null,
  _chars: ['#', 'A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z'],
  _activeLetters: new Set(),
  _dotLetter: null,
  _dotFrac: 0.0,
  _showDot: false,
  _resizeObserver: null,

  init() {
    this._el = document.getElementById('alpha-strip');
    this._scrollEl = document.getElementById('projects-scroll');
    if (!this._el || !this._scrollEl) return;

    // Replace content with a canvas for custom painting (V4 style)
    this._el.innerHTML = '';
    this._canvas = document.createElement('canvas');
    this._canvas.style.width = '100%';
    this._canvas.style.height = '100%';
    this._canvas.style.cursor = 'pointer';
    this._el.appendChild(this._canvas);
    this._ctx = this._canvas.getContext('2d');

    // Click handler
    this._canvas.addEventListener('click', (e) => {
      const rect = this._canvas.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const dpr = window.devicePixelRatio || 1;
      const positions = this._letterPositions();
      if (!positions.length) return;

      // Find closest letter
      let closest = null;
      let minDist = Infinity;
      for (const pos of positions) {
        const dist = Math.abs(y * dpr - pos.cy);
        if (dist < minDist) {
          minDist = dist;
          closest = pos;
        }
      }

      if (closest && this._activeLetters.has(closest.ch)) {
        this._scrollToLetter(closest.ch);
      }
    });

    // Track scroll position to update the dot (use rAF to avoid jitter)
    this._scrollRafId = null;
    this._scrollEl.addEventListener('scroll', () => {
      if (this._scrollRafId) return;
      this._scrollRafId = requestAnimationFrame(() => {
        this._scrollRafId = null;
        this._updateDotFromScroll();
      });
    }, { passive: true });

    // Re-paint on resize
    this._resizeObserver = new ResizeObserver(() => this._paint());
    this._resizeObserver.observe(this._el);

    this._paint();
  },

  update(projects) {
    this._activeLetters.clear();
    for (const p of projects) {
      const client = (p.client || '').trim();
      if (!client) continue;
      const first = client[0].toUpperCase();
      if (/\d/.test(first)) {
        this._activeLetters.add('#');
      } else if (/[A-Z]/.test(first)) {
        this._activeLetters.add(first);
      }
    }
    this._paint();
    // Delay dot update so cards have rendered
    setTimeout(() => this._updateDotFromScroll(), 50);
  },

  _letterPositions() {
    const dpr = window.devicePixelRatio || 1;
    const h = this._canvas.height;
    const n = this._chars.length;

    // Letters get 2 parts of space, separators get 1 part
    const totalParts = n * 2 + (n - 1);
    const marginTop = 6 * dpr;
    const marginBottom = 6 * dpr;
    const usableH = h - marginTop - marginBottom;
    const partH = usableH / totalParts;

    const positions = [];
    let y = marginTop;
    for (let i = 0; i < n; i++) {
      const letterH = partH * 2;
      const cy = y + letterH / 2;
      positions.push({ ch: this._chars[i], cy, h: letterH });
      y += letterH;
      if (i < n - 1) {
        y += partH; // separator space
      }
    }
    return positions;
  },

  _dotY(positions) {
    if (!this._dotLetter || !positions.length) return null;
    for (let i = 0; i < positions.length; i++) {
      if (positions[i].ch === this._dotLetter) {
        if (this._dotFrac > 0 && i + 1 < positions.length) {
          const nextCy = positions[i + 1].cy;
          return positions[i].cy + this._dotFrac * (nextCy - positions[i].cy);
        }
        return positions[i].cy;
      }
    }
    return null;
  },

  _paint() {
    if (!this._canvas || !this._ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = this._el.getBoundingClientRect();
    this._canvas.width = rect.width * dpr;
    this._canvas.height = rect.height * dpr;

    const ctx = this._ctx;
    const w = this._canvas.width;
    ctx.clearRect(0, 0, w, this._canvas.height);

    const positions = this._letterPositions();
    if (!positions.length) return;

    const dotRadius = 9 * dpr;
    const dotCy = this._showDot ? this._dotY(positions) : null;

    // Colors from design tokens
    const activeColor = '#5C6B75';   // text_secondary
    const inactiveColor = '#E4EAF0'; // border
    const dotColor = '#5C6B75';      // text_secondary
    const sepColor = '#94A3AF';      // text_tertiary

    // Draw floating dot (behind text)
    if (dotCy !== null) {
      ctx.fillStyle = dotColor;
      ctx.beginPath();
      ctx.arc(w / 2, dotCy, dotRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    const activeFontSize = Math.round(8 * dpr);
    const inactiveFontSize = Math.round(8 * dpr);

    // Draw letters and separator dots
    for (let i = 0; i < positions.length; i++) {
      const { ch, cy, h: lh } = positions[i];
      const isActive = this._activeLetters.has(ch);
      const underDot = dotCy !== null && Math.abs(cy - dotCy) < dotRadius;

      // Letter
      if (underDot) {
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `bold ${activeFontSize}px Inter, sans-serif`;
      } else if (isActive) {
        ctx.fillStyle = activeColor;
        ctx.font = `bold ${activeFontSize}px Inter, sans-serif`;
      } else {
        ctx.fillStyle = inactiveColor;
        ctx.font = `normal ${inactiveFontSize}px Inter, sans-serif`;
      }

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(ch, w / 2, cy);

      // Separator dot between letters
      if (i < positions.length - 1) {
        const sepCy = cy + lh / 2 + (positions[i + 1].cy - cy - lh) / 2;
        const underDotSep = dotCy !== null && Math.abs(sepCy - dotCy) < dotRadius;

        ctx.fillStyle = underDotSep ? '#FFFFFF' : sepColor;
        ctx.beginPath();
        ctx.arc(w / 2, sepCy, 1.5 * dpr, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  },

  _getCardLetter(card) {
    const titleEl = card.querySelector('.project-card-title');
    if (!titleEl) return null;
    const title = titleEl.textContent.trim();
    if (!title) return null;
    const first = title[0].toUpperCase();
    return /\d/.test(first) ? '#' : (/[A-Z]/.test(first) ? first : null);
  },

  _updateDotFromScroll() {
    const container = document.getElementById('projects-container');
    const scrollEl = this._scrollEl;
    if (!container || !scrollEl) {
      this._showDot = false;
      this._paint();
      return;
    }

    const cards = Array.from(container.querySelectorAll('.project-card'));
    if (!cards.length) {
      this._showDot = false;
      this._paint();
      return;
    }

    const viewTop = scrollEl.scrollTop + 4;

    // Find the first visible card
    let visibleIdx = -1;
    for (let i = 0; i < cards.length; i++) {
      if (cards[i].offsetTop + cards[i].offsetHeight > viewTop) {
        visibleIdx = i;
        break;
      }
    }
    if (visibleIdx < 0) {
      this._showDot = false;
      this._paint();
      return;
    }

    const currentLetter = this._getCardLetter(cards[visibleIdx]);
    if (!currentLetter) {
      this._showDot = false;
      this._paint();
      return;
    }

    // Find the top of the current letter group and the top of the next letter group
    let groupStart = cards[visibleIdx].offsetTop;
    for (let i = visibleIdx - 1; i >= 0; i--) {
      if (this._getCardLetter(cards[i]) === currentLetter) {
        groupStart = cards[i].offsetTop;
      } else break;
    }

    // Find start of next letter group
    let nextGroupStart = null;
    for (let i = visibleIdx + 1; i < cards.length; i++) {
      if (this._getCardLetter(cards[i]) !== currentLetter) {
        nextGroupStart = cards[i].offsetTop;
        break;
      }
    }

    // Calculate smooth fraction: 0 at group start, approaches 1 at next group
    let frac = 0;
    if (nextGroupStart !== null) {
      const groupHeight = nextGroupStart - groupStart;
      if (groupHeight > 0) {
        frac = Math.max(0, Math.min(1, (viewTop - groupStart) / groupHeight));
      }
    }

    this._dotLetter = currentLetter;
    this._dotFrac = frac;
    this._showDot = true;
    this._paint();
  },

  _scrollToLetter(letter) {
    const container = document.getElementById('projects-container');
    const scrollEl = this._scrollEl;
    if (!container || !scrollEl) return;

    const cards = container.querySelectorAll('.project-card');
    for (const card of cards) {
      const titleEl = card.querySelector('.project-card-title');
      if (!titleEl) continue;
      const title = titleEl.textContent.trim();
      if (!title) continue;

      const first = title[0].toUpperCase();
      const match = (letter === '#' && /\d/.test(first)) || (first === letter);

      if (match) {
        const cardTop = card.offsetTop;
        scrollEl.scrollTo({ top: cardTop - 4, behavior: 'smooth' });

        // Brief highlight
        card.classList.add('alpha-highlight');
        setTimeout(() => card.classList.remove('alpha-highlight'), 800);
        return;
      }
    }
  }
};
