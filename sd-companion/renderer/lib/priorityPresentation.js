(function () {
  function withAlpha(color, alpha, fallback) {
    const value = String(color || '').trim();
    const hexMatch = value.match(/^#([0-9a-f]{6}|[0-9a-f]{3})$/i);
    if (!hexMatch) return fallback;

    const hex = hexMatch[1].length === 3
      ? hexMatch[1].split('').map((char) => char + char).join('')
      : hexMatch[1];
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function getPriorityDisplayStyles(overrides = {}) {
    return {
      numbered: { color: '#4D4AD5', ...(overrides?.numbered || {}) },
      wait: { color: '#6E7680', ...(overrides?.wait || {}) },
      clear: { color: '#9CA6B4', ...(overrides?.clear || {}) },
      customDefault: { color: '#5C6B75', ...(overrides?.customDefault || {}) },
    };
  }

  function getPriorityTone(priority, displayStyles = {}) {
    const baseColor = getPriorityDisplayStyles(displayStyles).numbered.color;
    return {
      color: baseColor,
      background: withAlpha(baseColor, 0.14, '#EEEDFE'),
      border: withAlpha(baseColor, 0.18, '#DCDFF7'),
    };
  }

  function getPriorityStyleForToken(token, displayStyles = {}) {
    const baseColor = getPriorityDisplayStyles(displayStyles)[token]?.color || '#5C6B75';
    const isClear = token === 'clear';
    return {
      color: baseColor,
      background: withAlpha(baseColor, isClear ? 0.08 : 0.14, '#EEF1F4'),
      border: withAlpha(baseColor, isClear ? 0.12 : 0.18, '#E4EAF0'),
    };
  }

  function getPriorityInlineStyle(priority, displayStyles = {}) {
    const tone = getPriorityTone(priority, displayStyles);
    return tone ? `color:${tone.color};background:${tone.background};border:1px solid ${tone.border};` : '';
  }

  function getPriorityPresentation(task, options = {}) {
    const {
      displayStyles = {},
      customPriorities = [],
      isPrioritySet,
      getCustomPriorityLabel,
      PRIORITY_WAIT = -1,
      PRIORITY_CUSTOM = -2,
    } = options;
    const priority = task.priority;
    const priorityIsSet = typeof isPrioritySet === 'function'
      ? isPrioritySet(priority)
      : priority !== null && priority !== undefined && priority !== 0;

    if (!priorityIsSet) {
      const clearTone = getPriorityStyleForToken('clear', displayStyles);
      return {
        label: '-',
        className: 'punset',
        inlineStyle: `color:${clearTone.color};background:${clearTone.background};border:1px solid ${clearTone.border};`,
        shortLabel: '-',
      };
    }

    if (priority === PRIORITY_WAIT) {
      const waitTone = getPriorityStyleForToken('wait', displayStyles);
      return {
        label: 'W',
        className: 'pw',
        inlineStyle: `color:${waitTone.color};background:${waitTone.background};border:1px solid ${waitTone.border};`,
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
      return {
        label: customLabel,
        className: 'pcustom',
        inlineStyle: `color:${customColor};background:${withAlpha(customColor, 0.14, '#EEF1F4')};border:1px solid ${withAlpha(customColor, 0.18, '#E4EAF0')};`,
        shortLabel,
      };
    }

    if (typeof priority === 'number' && priority >= 1) {
      return {
        label: String(priority),
        className: 'pnumeric',
        inlineStyle: getPriorityInlineStyle(priority, displayStyles),
        shortLabel: String(priority),
      };
    }

    const clearTone = getPriorityStyleForToken('clear', displayStyles);
    return {
      label: '-',
      className: 'punset',
      inlineStyle: `color:${clearTone.color};background:${clearTone.background};border:1px solid ${clearTone.border};`,
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
