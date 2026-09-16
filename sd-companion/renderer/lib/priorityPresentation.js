(function () {
  function hexToRgb(color) {
    const value = String(color || '').trim();
    const hexMatch = value.match(/^#([0-9a-f]{6}|[0-9a-f]{3})$/i);
    if (!hexMatch) return null;

    const hex = hexMatch[1].length === 3
      ? hexMatch[1].split('').map((char) => char + char).join('')
      : hexMatch[1];
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
    };
  }

  function rgbToHex({ r, g, b }) {
    const toHex = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  function rgbToHsl({ r, g, b }) {
    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const l = (max + min) / 2;
    let h = 0;
    let s = 0;

    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case rn: h = (gn - bn) / d + (gn < bn ? 6 : 0); break;
        case gn: h = (bn - rn) / d + 2; break;
        default: h = (rn - gn) / d + 4;
      }
      h /= 6;
    }

    return { h, s, l };
  }

  function hslToRgb({ h, s, l }) {
    if (s === 0) {
      const gray = l * 255;
      return { r: gray, g: gray, b: gray };
    }

    const hue2rgb = (p, q, t) => {
      let tt = t;
      if (tt < 0) tt += 1;
      if (tt > 1) tt -= 1;
      if (tt < 1 / 6) return p + (q - p) * 6 * tt;
      if (tt < 1 / 2) return q;
      if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    return {
      r: hue2rgb(p, q, h + 1 / 3) * 255,
      g: hue2rgb(p, q, h) * 255,
      b: hue2rgb(p, q, h - 1 / 3) * 255,
    };
  }

  // Priority colors are admin-configured (any hue) and were only ever tuned for
  // light backgrounds. On a dark surface the same hex used at full opacity as
  // text often has poor contrast, so raise its lightness while keeping the hue.
  function getDarkModeTextColor(color) {
    const rgb = hexToRgb(color);
    if (!rgb) return color;
    const hsl = rgbToHsl(rgb);
    return rgbToHex(hslToRgb({
      h: hsl.h,
      s: Math.min(hsl.s, 0.72),
      l: Math.max(hsl.l, 0.74),
    }));
  }

  function withAlpha(color, alpha, fallback) {
    const rgb = hexToRgb(color);
    if (!rgb) return fallback;
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
  }

  function getPriorityDisplayStyles(overrides = {}) {
    return {
      numbered: { color: '#4D4AD5', ...(overrides?.numbered || {}) },
      wait: { color: '#6E7680', ...(overrides?.wait || {}) },
      clear: { color: '#9CA6B4', ...(overrides?.clear || {}) },
      customDefault: { color: '#5C6B75', ...(overrides?.customDefault || {}) },
    };
  }

  function toneFromColor(baseColor, { isDarkTheme = false, isClear = false } = {}) {
    const color = isDarkTheme ? getDarkModeTextColor(baseColor) : baseColor;
    const bgAlpha = isDarkTheme ? (isClear ? 0.14 : 0.2) : (isClear ? 0.08 : 0.14);
    const borderAlpha = isDarkTheme ? (isClear ? 0.2 : 0.26) : (isClear ? 0.12 : 0.18);
    return {
      color,
      background: withAlpha(color, bgAlpha, '#EEF1F4'),
      border: withAlpha(color, borderAlpha, '#E4EAF0'),
    };
  }

  function getPriorityTone(priority, displayStyles = {}, isDarkTheme = false) {
    const baseColor = getPriorityDisplayStyles(displayStyles).numbered.color;
    return toneFromColor(baseColor, { isDarkTheme });
  }

  function getPriorityStyleForToken(token, displayStyles = {}, isDarkTheme = false) {
    const baseColor = getPriorityDisplayStyles(displayStyles)[token]?.color || '#5C6B75';
    return toneFromColor(baseColor, { isDarkTheme, isClear: token === 'clear' });
  }

  function getPriorityInlineStyle(priority, displayStyles = {}, isDarkTheme = false) {
    const tone = getPriorityTone(priority, displayStyles, isDarkTheme);
    return tone ? `color:${tone.color};background:${tone.background};border:1px solid ${tone.border};` : '';
  }

  function toneInlineStyle(tone) {
    return `color:${tone.color};background:${tone.background};border:1px solid ${tone.border};`;
  }

  function getPriorityPresentation(task, options = {}) {
    const {
      displayStyles = {},
      customPriorities = [],
      isPrioritySet,
      getCustomPriorityLabel,
      PRIORITY_WAIT = -1,
      PRIORITY_CUSTOM = -2,
      isDarkTheme = false,
    } = options;
    const priority = task.priority;
    const priorityIsSet = typeof isPrioritySet === 'function'
      ? isPrioritySet(priority)
      : priority !== null && priority !== undefined && priority !== 0;

    if (!priorityIsSet) {
      const clearTone = getPriorityStyleForToken('clear', displayStyles, isDarkTheme);
      return {
        label: '-',
        className: 'punset',
        inlineStyle: toneInlineStyle(clearTone),
        shortLabel: '-',
      };
    }

    if (priority === PRIORITY_WAIT) {
      const waitTone = getPriorityStyleForToken('wait', displayStyles, isDarkTheme);
      return {
        label: 'W',
        className: 'pw',
        inlineStyle: toneInlineStyle(waitTone),
        shortLabel: 'W',
      };
    }

    if (priority === PRIORITY_CUSTOM && task.priority_label) {
      const customLabel = typeof getCustomPriorityLabel === 'function'
        ? getCustomPriorityLabel(task.priority_label)
        : String(task.priority_label || '').replace(/^cp:/, '');
      const shortLabel = customLabel.length <= 2 ? customLabel.toUpperCase() : customLabel.slice(0, 2).toUpperCase();
      const customPriority = customPriorities.find((item) => item.label === customLabel);
      const customColor = customPriority?.color || getPriorityDisplayStyles(displayStyles).customDefault.color;
      const customTone = toneFromColor(customColor, { isDarkTheme });
      return {
        label: customLabel,
        className: 'pcustom',
        inlineStyle: toneInlineStyle(customTone),
        shortLabel,
      };
    }

    if (typeof priority === 'number' && priority >= 1) {
      return {
        label: String(priority),
        className: 'pnumeric',
        inlineStyle: getPriorityInlineStyle(priority, displayStyles, isDarkTheme),
        shortLabel: String(priority),
      };
    }

    const clearTone = getPriorityStyleForToken('clear', displayStyles, isDarkTheme);
    return {
      label: '-',
      className: 'punset',
      inlineStyle: toneInlineStyle(clearTone),
      shortLabel: '-',
    };
  }

  window.MyTasksPriorityPresentation = {
    withAlpha,
    getPriorityDisplayStyles,
    getPriorityTone,
    getPriorityStyleForToken,
    getPriorityInlineStyle,
    getPriorityPresentation,
  };
})();
