/**
 * Matching and ranking for the command palette. Pure functions only (no DOM),
 * so the behaviour can be unit-tested in the smoke tests.
 *
 * An item looks like { group, label, hint?, keywords? }. Every word of the
 * query has to match somewhere in the item; matches in the label rank above
 * matches in the hint or keywords, and word-start matches above mid-word ones.
 */
(function attachPaletteSearch(globalScope) {
  // Lower-case and strip accents so "jose" finds "José".
  function normalize(value) {
    return String(value ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '');
  }

  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // "Maple Civic | Maple Commons" is searched by words, not as one phrase.
  function tokenize(query) {
    return normalize(query).split(/[\s|]+/).filter(Boolean);
  }

  const WORD_START = (token) => new RegExp(`(^|[\\s|\\-_/(])${escapeRegExp(token)}`);

  // Returns -1 when any token is missing, otherwise a score where higher is better.
  function scoreItem(item, tokens) {
    if (!tokens.length) return 0;
    const label = normalize(item.label);
    const haystack = `${label} ${normalize(item.hint)} ${normalize(item.keywords)}`;
    let total = 0;
    for (const token of tokens) {
      let best = -1;
      if (label.startsWith(token)) best = 100;
      else if (WORD_START(token).test(label)) best = 70;
      else if (label.includes(token)) best = 40;
      else if (WORD_START(token).test(haystack)) best = 20;
      else if (haystack.includes(token)) best = 10;
      if (best < 0) return -1;
      total += best;
    }
    // Break ties in favour of shorter, more specific labels.
    return total - Math.min(label.length, 80) / 100;
  }

  // [start, end) ranges of the label that match the query, merged and sorted.
  function highlightRanges(label, tokens) {
    const text = normalize(label);
    const ranges = [];
    for (const token of tokens) {
      let from = 0;
      while (from <= text.length - token.length) {
        const at = text.indexOf(token, from);
        if (at < 0) break;
        ranges.push([at, at + token.length]);
        from = at + token.length;
      }
    }
    ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const merged = [];
    for (const range of ranges) {
      const last = merged[merged.length - 1];
      if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
      else merged.push([range[0], range[1]]);
    }
    return merged;
  }

  /**
   * Filter and rank items for a query.
   * options.groupOrder  - groups appear in this order
   * options.limits      - max results per group, e.g. { Tasks: 8 }
   * options.emptyGroups - groups shown when the query is empty (default: all)
   */
  function filter(items, query, options = {}) {
    const tokens = tokenize(query);
    const groupOrder = options.groupOrder || [];
    const limits = options.limits || {};
    const emptyGroups = options.emptyGroups ? new Set(options.emptyGroups) : null;
    const rankOf = (group) => {
      const index = groupOrder.indexOf(group);
      return index < 0 ? groupOrder.length : index;
    };

    const scored = [];
    items.forEach((item, index) => {
      if (!tokens.length && emptyGroups && !emptyGroups.has(item.group)) return;
      const score = scoreItem(item, tokens);
      if (score < 0) return;
      scored.push({ item, score, index });
    });

    scored.sort((a, b) => rankOf(a.item.group) - rankOf(b.item.group)
      || b.score - a.score
      || a.index - b.index);

    const counts = {};
    const results = [];
    for (const entry of scored) {
      const group = entry.item.group;
      counts[group] = (counts[group] || 0) + 1;
      const limit = limits[group];
      if (limit && counts[group] > limit) continue;
      results.push({ item: entry.item, score: entry.score, ranges: highlightRanges(entry.item.label, tokens) });
    }
    return results;
  }

  globalScope.PaletteSearch = { normalize, tokenize, scoreItem, highlightRanges, filter };
})(window);
