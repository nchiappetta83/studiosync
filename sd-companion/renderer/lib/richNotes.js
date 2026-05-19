(function attachMyTasksRichNotes(globalScope) {
  function escapeHtml(value) {
    if (!value) return '';
    const div = document.createElement('div');
    div.textContent = value;
    return div.innerHTML;
  }

  function escapeAttr(value) {
    if (!value) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function normalizeLinkTarget(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^www\./i.test(raw)) return `https://${raw}`;
    return raw;
  }

  function stripTrailingLinkPunctuation(value) {
    const trailing = String(value || '').match(/[),.;:!?]+$/)?.[0] || '';
    return {
      clean: trailing ? value.slice(0, -trailing.length) : value,
      trailing,
    };
  }

  function findTextLinks(text) {
    const value = String(text || '');
    const matches = [];
    const patterns = [
      /\b((?:https?:\/\/|file:\/\/|www\.)[^\s<>"']+)/gi,
      /(^|[\s(])((?:[A-Za-z]:[\\/]|\\\\)[^\r\n]+)/g,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(value)) !== null) {
        const raw = match[2] || match[1];
        const prefixLength = match[2] ? match[1].length : 0;
        const start = match.index + prefixLength;
        const { clean, trailing } = stripTrailingLinkPunctuation(raw.trimEnd());
        if (!clean) continue;
        matches.push({
          start,
          end: start + clean.length,
          raw: clean,
          trailing,
        });
      }
    }

    return matches
      .sort((left, right) => left.start - right.start || right.end - left.end)
      .filter((match, index, sorted) => index === 0 || match.start >= sorted[index - 1].end);
  }

  function renderTextWithLinks(value) {
    const text = String(value || '');
    if (!text) return '';

    const links = findTextLinks(text);
    let output = '';
    let lastIndex = 0;

    for (const link of links) {
      output += escapeHtml(text.slice(lastIndex, link.start));
      output += `<a class="note-link" href="#" contenteditable="false" data-open-link="${escapeAttr(normalizeLinkTarget(link.raw))}">${escapeHtml(link.raw)}</a>${escapeHtml(link.trailing)}`;
      lastIndex = link.end + link.trailing.length;
    }

    output += escapeHtml(text.slice(lastIndex));
    return output.replace(/\r?\n/g, '<br>');
  }

  function noteLooksLikeHtml(value) {
    return /<\/?[a-z][\s\S]*>/i.test(String(value || ''));
  }

  function getPlainTextFromRichNote(value) {
    const rawValue = String(value || '');
    if (!noteLooksLikeHtml(rawValue)) return rawValue;
    const template = document.createElement('template');
    template.innerHTML = rawValue;
    return (template.content.textContent || '').replace(/\u00a0/g, ' ');
  }

  function trimEmptyEditorEdges(root) {
    if (!root) return;
    const isEmptyNode = (node) => {
      if (!node) return true;
      if (node.nodeType === Node.TEXT_NODE) return !node.textContent.trim();
      if (node.nodeType !== Node.ELEMENT_NODE) return true;
      if (node.tagName === 'BR') return true;
      return !String(node.textContent || '').trim()
        && !node.querySelector('img, video, iframe, table');
    };

    while (root.firstChild && isEmptyNode(root.firstChild)) {
      root.removeChild(root.firstChild);
    }
    while (root.lastChild && isEmptyNode(root.lastChild)) {
      root.removeChild(root.lastChild);
    }
  }

  function sanitizeRichNoteHtml(value) {
    const template = document.createElement('template');
    template.innerHTML = String(value || '');

    const allowedTags = new Set(['A', 'B', 'BR', 'DIV', 'EM', 'I', 'LI', 'OL', 'P', 'SPAN', 'STRONG', 'U', 'UL']);
    const blockTags = new Set(['DIV', 'P', 'UL', 'OL', 'LI']);
    const allowedFontFamilies = new Set(['Arial', 'Georgia', 'Tahoma', 'Times New Roman', 'Courier New']);
    const cleanNode = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        return document.createTextNode(node.textContent || '');
      }

      if (node.nodeType !== Node.ELEMENT_NODE) {
        return document.createDocumentFragment();
      }

      const tag = node.tagName;
      const replacement = allowedTags.has(tag)
        ? document.createElement(tag.toLowerCase())
        : document.createDocumentFragment();

      if (tag === 'A' && replacement.nodeType === Node.ELEMENT_NODE) {
        const href = node.getAttribute('data-open-link') || node.getAttribute('href') || node.textContent || '';
        replacement.setAttribute('href', '#');
        replacement.setAttribute('contenteditable', 'false');
        replacement.setAttribute('data-open-link', normalizeLinkTarget(href));
        replacement.className = 'note-link';
      }

      if (tag === 'SPAN' && replacement.nodeType === Node.ELEMENT_NODE) {
        const fontSize = node.style?.fontSize || '';
        if (/^(1[0-9]|2[0-9]|3[0-2])px$/.test(fontSize)) {
          replacement.style.fontSize = fontSize;
        }
        const rawFamily = String(node.style?.fontFamily || '').replace(/["']/g, '').split(',')[0].trim();
        if (allowedFontFamilies.has(rawFamily)) {
          replacement.style.fontFamily = rawFamily;
        }
      }

      if (['DIV', 'P', 'LI'].includes(tag) && replacement.nodeType === Node.ELEMENT_NODE) {
        const textAlign = node.style?.textAlign || '';
        if (['left', 'center', 'right'].includes(textAlign)) {
          replacement.style.textAlign = textAlign;
        }
      }

      for (const child of Array.from(node.childNodes)) {
        replacement.appendChild(cleanNode(child));
      }

      if (blockTags.has(tag) && replacement.nodeType === Node.ELEMENT_NODE && !replacement.textContent.trim() && !replacement.querySelector('br')) {
        replacement.appendChild(document.createElement('br'));
      }

      return replacement;
    };

    const output = document.createElement('div');
    for (const child of Array.from(template.content.childNodes)) {
      output.appendChild(cleanNode(child));
    }
    trimEmptyEditorEdges(output);
    return output.innerHTML.trim();
  }

  function normalizeEditorFontTags(editor) {
    if (!editor) return;
    const fontSizes = {
      1: '11px',
      2: '12px',
      3: '13px',
      4: '15px',
      5: '17px',
      6: '20px',
      7: '24px',
    };

    editor.querySelectorAll('font[size]').forEach((font) => {
      const span = document.createElement('span');
      span.style.fontSize = fontSizes[font.getAttribute('size')] || '13px';
      const face = font.getAttribute('face');
      if (face) span.style.fontFamily = face;
      while (font.firstChild) span.appendChild(font.firstChild);
      font.replaceWith(span);
    });

    editor.querySelectorAll('font[face]').forEach((font) => {
      const span = document.createElement('span');
      span.style.fontFamily = font.getAttribute('face');
      while (font.firstChild) span.appendChild(font.firstChild);
      font.replaceWith(span);
    });
  }

  function getRichEditorHtml(editor) {
    if (!editor) return '';
    normalizeEditorFontTags(editor);
    const html = sanitizeRichNoteHtml(editor.innerHTML || '');
    return getPlainTextFromRichNote(html).trim() ? html : '';
  }

  function renderRichNoteHtml(value) {
    const rawValue = String(value || '');
    if (!rawValue) return '';
    return noteLooksLikeHtml(rawValue)
      ? sanitizeRichNoteHtml(rawValue)
      : renderTextWithLinks(rawValue);
  }

  function getEditablePlainText(editor) {
    if (!editor) return '';
    return (editor.innerText || '').replace(/\u00a0/g, ' ').replace(/\n$/, '');
  }

  function renderLinkifiedEditorText(editor, value) {
    if (!editor) return;
    editor.innerHTML = renderTextWithLinks(value);
  }

  globalScope.MyTasksRichNotes = {
    normalizeLinkTarget,
    findTextLinks,
    renderTextWithLinks,
    noteLooksLikeHtml,
    getPlainTextFromRichNote,
    sanitizeRichNoteHtml,
    normalizeEditorFontTags,
    getRichEditorHtml,
    renderRichNoteHtml,
    getEditablePlainText,
    renderLinkifiedEditorText,
  };
})(window);
