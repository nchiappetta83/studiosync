(function () {
  const params = new URLSearchParams(window.location.search);
  const projectId = params.get('projectId');
  const listEl = document.getElementById('project-notes-list');
  const mainEl = document.getElementById('project-notes-main');
  const subtitleEl = document.getElementById('project-notes-window-subtitle');
  const addBtn = document.getElementById('project-notes-add');

  const {
    escapeHtml,
    escapeAttr,
  } = window.MyTasksHtml;
  const {
    getPlainTextFromRichNote,
    getRichEditorHtml,
    renderRichNoteHtml,
    normalizeEditorFontTags,
  } = window.MyTasksRichNotes;
  const {
    orderProjectNotes,
    buildProjectNoteDrafts,
    hasProjectNotePersistedChanges,
    formatProjectNoteTimestamp,
  } = window.MyTasksProjectNotes;

  let currentUser = null;
  let users = [];
  let project = null;
  let drafts = new Map();
  let activeNoteId = null;
  let autosaveTimer = null;
  let saveChain = Promise.resolve();
  let savedEditorRange = null;
  let selectionSaveRaf = null;
  let ignoreDataUpdatesUntil = 0;
  let saveStatus = 'saved';
  let saveStatusTimer = null;
  const STYLE_PREFERENCES_KEY = 'mytasks:style-preferences';

  const fontSizeByCommandValue = {
    1: 11,
    2: 12,
    3: 13,
    4: 15,
    5: 17,
    6: 20,
    7: 24,
  };

  function getUserScopedStorageKey(baseKey) {
    return `${baseKey}:${currentUser?.id || 'unknown'}`;
  }

  function applyStoredThemePreference() {
    try {
      const raw = window.localStorage?.getItem(getUserScopedStorageKey(STYLE_PREFERENCES_KEY));
      const prefs = raw ? JSON.parse(raw) : null;
      document.body.classList.toggle('theme-dark', prefs?.theme === 'dark');
      document.body.classList.toggle('theme-light', prefs?.theme !== 'dark');
    } catch (_) {
      document.body.classList.remove('theme-dark');
      document.body.classList.add('theme-light');
    }
  }

  const orderedDrafts = () => orderProjectNotes([...drafts.values()]);
  const getActiveDraft = () => (activeNoteId ? drafts.get(activeNoteId) || null : null);
  const getAuthorName = (userId) => users.find((user) => user.id === userId)?.display_name || 'StudioSync';

  function getNotePreview(note) {
    const plainText = getPlainTextFromRichNote(note?.notes || '').replace(/\s+/g, ' ').trim();
    if (!plainText) return 'No details yet';
    return plainText.length > 84 ? `${plainText.slice(0, 81)}...` : plainText;
  }

  function updateSaveStatusElement() {
    const statusEl = document.getElementById('project-note-save-status');
    if (!statusEl) return;

    const labels = {
      saved: 'Saved',
      saving: 'Saving...',
      error: 'Save failed',
    };
    statusEl.textContent = labels[saveStatus] || labels.saved;
    statusEl.dataset.status = saveStatus;
  }

  function setSaveStatus(status) {
    saveStatus = status || 'saved';
    updateSaveStatusElement();

    if (saveStatusTimer) {
      clearTimeout(saveStatusTimer);
      saveStatusTimer = null;
    }

    if (saveStatus === 'saved') {
      saveStatusTimer = setTimeout(() => {
        updateSaveStatusElement();
      }, 1200);
    }
  }

  function markLocalSave() {
    ignoreDataUpdatesUntil = Date.now() + 800;
  }

  function syncDraftFromInputs() {
    const draft = getActiveDraft();
    if (!draft) return null;

    const titleInput = document.getElementById('project-note-title-input');
    if (titleInput) draft.title = titleInput.value.trim() || 'Untitled Note';

    const bodyInput = document.getElementById('project-note-body-input');
    if (bodyInput) draft.notes = getRichEditorHtml(bodyInput);

    draft.updated_by = currentUser?.id || draft.updated_by || null;
    renderList();
    return draft;
  }

  function saveEditorSelection() {
    const bodyEditor = document.getElementById('project-note-body-input');
    const selection = window.getSelection?.();
    if (!bodyEditor || !selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (!bodyEditor.contains(range.commonAncestorContainer)) return;
    savedEditorRange = range.cloneRange();
    updateEditorToolbarState();
  }

  function queueEditorSelectionSave() {
    if (selectionSaveRaf) cancelAnimationFrame(selectionSaveRaf);
    selectionSaveRaf = requestAnimationFrame(() => {
      selectionSaveRaf = null;
      saveEditorSelection();
    });
  }

  function restoreEditorSelection() {
    if (!savedEditorRange) return;
    const bodyEditor = document.getElementById('project-note-body-input');
    if (!bodyEditor || !bodyEditor.contains(savedEditorRange.commonAncestorContainer)) return;
    const selection = window.getSelection?.();
    if (!selection) return;
    selection.removeAllRanges();
    selection.addRange(savedEditorRange);
  }

  function getSelectionElement() {
    const bodyEditor = document.getElementById('project-note-body-input');
    const selection = window.getSelection?.();
    const range = savedEditorRange || (selection?.rangeCount ? selection.getRangeAt(0) : null);
    if (!bodyEditor || !range || !bodyEditor.contains(range.commonAncestorContainer)) return bodyEditor;

    const node = range.startContainer.nodeType === Node.ELEMENT_NODE
      ? range.startContainer
      : range.startContainer.parentElement;
    return node instanceof Element ? node : bodyEditor;
  }

  function getFontSizeCommandValueForSelection() {
    const element = getSelectionElement();
    if (!element) return '3';

    const pxValue = parseFloat(window.getComputedStyle(element).fontSize || '13');
    let bestValue = '3';
    let bestDelta = Number.POSITIVE_INFINITY;
    for (const [value, size] of Object.entries(fontSizeByCommandValue)) {
      const delta = Math.abs(size - pxValue);
      if (delta < bestDelta) {
        bestValue = value;
        bestDelta = delta;
      }
    }
    return bestValue;
  }

  function updateEditorToolbarState() {
    const fontSizeSelect = document.getElementById('project-notes-font-size');
    if (fontSizeSelect) fontSizeSelect.value = getFontSizeCommandValueForSelection();

    for (const command of ['bold', 'italic', 'underline', 'insertUnorderedList', 'insertOrderedList']) {
      const button = document.querySelector(`.project-notes-tool-btn[data-editor-command="${command}"]`);
      if (!button) continue;
      let isActive = false;
      try {
        isActive = document.queryCommandState(command);
      } catch (_) {
        isActive = false;
      }
      button.classList.toggle('active', isActive);
    }
  }

  function applyEditorCommand(command, value = null) {
    const bodyEditor = document.getElementById('project-note-body-input');
    if (!bodyEditor) return;
    restoreEditorSelection();
    bodyEditor.focus({ preventScroll: true });

    const inlineCommands = ['bold', 'italic', 'underline'];
    const preservedInlineCommands = inlineCommands
      .filter((item) => item !== command)
      .filter((item) => {
        try {
          const button = document.querySelector(`.project-notes-tool-btn[data-editor-command="${item}"]`);
          return document.queryCommandState(item) || button?.classList.contains('active');
        } catch (_) {
          return false;
        }
      });

    document.execCommand(command, false, value);

    if (inlineCommands.includes(command)) {
      for (const preservedCommand of preservedInlineCommands) {
        try {
          if (!document.queryCommandState(preservedCommand)) {
            document.execCommand(preservedCommand, false, null);
          }
        } catch (_) {}
      }
    }

    normalizeEditorFontTags(bodyEditor);
    saveEditorSelection();
    syncDraftFromInputs();
    updateEditorToolbarState();
    scheduleAutosave();
  }

  function selectionIsInListItem() {
    const bodyEditor = document.getElementById('project-note-body-input');
    const element = getSelectionElement();
    return Boolean(bodyEditor && element?.closest?.('li') && bodyEditor.contains(element.closest('li')));
  }

  function handleEditorTabKey(event) {
    if (event.key !== 'Tab') return;

    event.preventDefault();
    const bodyEditor = document.getElementById('project-note-body-input');
    if (!bodyEditor) return;

    bodyEditor.focus({ preventScroll: true });
    if (selectionIsInListItem()) {
      document.execCommand(event.shiftKey ? 'outdent' : 'indent', false, null);
    } else if (!event.shiftKey) {
      document.execCommand('insertText', false, '\u00a0\u00a0\u00a0\u00a0');
    }

    saveEditorSelection();
    syncDraftFromInputs();
    updateEditorToolbarState();
    scheduleAutosave();
  }

  function renderEditorToolbar() {
    return `
      <div class="project-notes-toolbar" role="toolbar" aria-label="Note formatting">
        <button class="project-notes-tool-btn" type="button" data-editor-command="undo" title="Undo" aria-label="Undo">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 8H5V4M5 8c2.2-2.5 5.8-3.4 8.9-2.1 3.2 1.3 5.1 4.4 5.1 7.7 0 2.2-.9 4.2-2.3 5.7"></path></svg>
        </button>
        <button class="project-notes-tool-btn" type="button" data-editor-command="redo" title="Redo" aria-label="Redo">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 8h4V4M19 8c-2.2-2.5-5.8-3.4-8.9-2.1C6.9 7.2 5 10.3 5 13.6c0 2.2.9 4.2 2.3 5.7"></path></svg>
        </button>
        <span class="project-notes-tool-divider" aria-hidden="true"></span>
        <label class="project-notes-select project-notes-font-picker" title="Font size">
          <select id="project-notes-font-size" aria-label="Font size">
            <option value="1">11</option>
            <option value="2">12</option>
            <option value="3" selected>13</option>
            <option value="4">15</option>
            <option value="5">17</option>
            <option value="6">20</option>
            <option value="7">24</option>
          </select>
        </label>
        <span class="project-notes-tool-divider" aria-hidden="true"></span>
        <button class="project-notes-tool-btn" type="button" data-editor-command="bold" title="Bold" aria-label="Bold"><span class="project-notes-tool-glyph project-notes-tool-bold">B</span></button>
        <button class="project-notes-tool-btn" type="button" data-editor-command="italic" title="Italic" aria-label="Italic"><span class="project-notes-tool-glyph project-notes-tool-italic">I</span></button>
        <button class="project-notes-tool-btn" type="button" data-editor-command="underline" title="Underline" aria-label="Underline"><span class="project-notes-tool-glyph project-notes-tool-underline">U</span></button>
        <span class="project-notes-tool-divider" aria-hidden="true"></span>
        <button class="project-notes-tool-btn" type="button" data-editor-command="insertUnorderedList" title="Bulleted list" aria-label="Bulleted list">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="7" r="1.4"></circle><circle cx="5" cy="12" r="1.4"></circle><circle cx="5" cy="17" r="1.4"></circle><path d="M9 7h10M9 12h10M9 17h10"></path></svg>
        </button>
        <button class="project-notes-tool-btn" type="button" data-editor-command="insertOrderedList" title="Numbered list" aria-label="Numbered list">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h1.8v4M4 10h3M4 14h2.6L4 18h3M10 7h9M10 12h9M10 17h9"></path></svg>
        </button>
        <span class="project-notes-tool-divider" aria-hidden="true"></span>
        <button class="project-notes-tool-btn" type="button" data-editor-command="removeFormat" title="Clear formatting" aria-label="Clear formatting">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7V5h12v2M10 5v10M7 15h6M16 13l4 4M20 13l-4 4"></path></svg>
        </button>
      </div>
    `;
  }

  async function persistDraft(draftId) {
    const draft = draftId ? drafts.get(draftId) : null;
    if (!draft || !hasProjectNotePersistedChanges(draft)) return draft;

    const title = String(draft.title || '').trim() || 'Untitled Note';
    const notes = String(draft.notes || '');
    markLocalSave();
    setSaveStatus('saving');

    if (draft.isDraft) {
      const createdNote = await window.api.createProjectSharedNote({
        project_id: projectId,
        title,
        notes,
        created_by: currentUser?.id || null,
        updated_by: currentUser?.id || null,
      });

      if (!createdNote?.id) return draft;
      drafts.delete(draftId);
      drafts.set(createdNote.id, {
        ...createdNote,
        _lastSavedTitle: createdNote.title || title,
        _lastSavedNotes: createdNote.notes || notes,
      });
      if (activeNoteId === draftId) activeNoteId = createdNote.id;
      render();
      setSaveStatus('saved');
      return drafts.get(createdNote.id);
    }

    const updatedNote = await window.api.updateProjectSharedNote({
      id: draft.id,
      title,
      notes,
      updated_by: currentUser?.id || null,
    });

    const persistedDraft = drafts.get(draft.id);
    if (!persistedDraft) return draft;
    persistedDraft.title = updatedNote?.title ?? title;
    persistedDraft.notes = updatedNote?.notes ?? notes;
    persistedDraft.updated_at = updatedNote?.updated_at || new Date().toISOString();
    persistedDraft.updated_by = updatedNote?.updated_by ?? currentUser?.id ?? persistedDraft.updated_by;
    persistedDraft._lastSavedTitle = persistedDraft.title || title;
    persistedDraft._lastSavedNotes = persistedDraft.notes || notes;
    updateEditorMeta(persistedDraft);
    renderList();
    setSaveStatus('saved');
    return persistedDraft;
  }

  function queuePersistDraft(draftId) {
    saveChain = saveChain
      .catch(() => null)
      .then(() => persistDraft(draftId))
      .catch((error) => {
        setSaveStatus('error');
        console.error('Project note save failed:', error);
        return null;
      });
    return saveChain;
  }

  function scheduleAutosave(draftId = activeNoteId, { immediate = false } = {}) {
    if (autosaveTimer) {
      clearTimeout(autosaveTimer);
      autosaveTimer = null;
    }
    if (!draftId) return saveChain;

    const run = () => {
      autosaveTimer = null;
      return queuePersistDraft(draftId);
    };

    if (immediate) return run();
    autosaveTimer = setTimeout(run, 450);
    return saveChain;
  }

  function updateEditorMeta(draft) {
    const updatedEl = document.getElementById('project-note-meta-updated');
    const byEl = document.getElementById('project-note-meta-by');
    if (updatedEl) updatedEl.textContent = `Updated ${formatProjectNoteTimestamp(draft?.updated_at)}`;
    if (byEl) byEl.textContent = `by ${getAuthorName(draft?.updated_by || draft?.created_by)}`;
  }

  function renderList() {
    const notes = orderedDrafts();
    listEl.innerHTML = notes.length ? notes.map((note) => `
      <div class="project-notes-item ${note.id === activeNoteId ? 'active' : ''}" data-note-id="${note.id}">
        <button class="project-notes-item-select" data-note-id="${note.id}" type="button">
          <span class="project-notes-item-title">${escapeHtml(note.title || 'Untitled Note')}</span>
          <span class="project-notes-item-preview">${escapeHtml(getNotePreview(note))}</span>
        </button>
        <button class="project-notes-item-menu" data-note-menu="${note.id}" type="button" aria-label="Delete note">&#8942;</button>
      </div>
    `).join('') : '<div class="project-notes-empty-sidebar">No shared notes yet.</div>';

    listEl.querySelectorAll('.project-notes-item-select[data-note-id]').forEach((button) => {
      button.addEventListener('click', async () => {
        const previousNoteId = activeNoteId;
        syncDraftFromInputs();
        await scheduleAutosave(previousNoteId, { immediate: true });
        activeNoteId = button.dataset.noteId;
        savedEditorRange = null;
        render();
      });
    });

    listEl.querySelectorAll('.project-notes-item-menu[data-note-menu]').forEach((button) => {
      button.addEventListener('click', async (event) => {
        event.stopPropagation();
        const note = drafts.get(button.dataset.noteMenu);
        if (!note) return;
        const confirmed = await window.MyTasksConfirmDialog.show({
          title: 'Delete note?',
          message: `Delete "${note.title || 'this note'}"?`,
          confirmLabel: 'Delete',
          tone: 'danger',
        });
        if (!confirmed) return;

        if (note.isDraft) {
          drafts.delete(note.id);
        } else {
          markLocalSave();
          await window.api.deleteProjectSharedNote(note.id);
          drafts.delete(note.id);
        }
        if (activeNoteId === note.id) activeNoteId = orderedDrafts()[0]?.id || null;
        render();
      });
    });
  }

  function renderMain() {
    const activeDraft = getActiveDraft();
    if (!activeDraft) {
      mainEl.innerHTML = `
        <div class="project-notes-empty-state">
          <div class="project-notes-empty-title">No note selected</div>
          <div class="project-notes-empty-copy">Create a named note for project updates, handoff details, and shared history.</div>
          <button class="btn btn-accent btn-sm" id="project-notes-empty-add" type="button">+ New Note</button>
        </div>
      `;
      document.getElementById('project-notes-empty-add')?.addEventListener('click', () => addBtn.click());
      return;
    }

    mainEl.innerHTML = `
      <div class="project-notes-editor">
        <div class="project-notes-main-header">
          <div class="project-notes-main-copy">
            <input class="project-notes-title-input" id="project-note-title-input" type="text" value="${escapeAttr(activeDraft.title || 'Untitled Note')}" placeholder="Note name">
          </div>
        </div>
        ${renderEditorToolbar()}
        <div class="detail-field">
          <div class="dialog-textarea project-note-body-input" id="project-note-body-input" contenteditable="true" role="textbox" aria-multiline="true" data-placeholder="Add the shared details everyone should see for this project...">${renderRichNoteHtml(activeDraft.notes || '')}</div>
        </div>
        <div class="project-notes-meta">
          <span id="project-note-meta-updated">Updated ${escapeHtml(formatProjectNoteTimestamp(activeDraft.updated_at))}</span>
          <span id="project-note-meta-by">by ${escapeHtml(getAuthorName(activeDraft.updated_by || activeDraft.created_by))}</span>
          <span class="project-note-save-status" id="project-note-save-status" data-status="${escapeAttr(saveStatus)}">${saveStatus === 'saving' ? 'Saving...' : saveStatus === 'error' ? 'Save failed' : 'Saved'}</span>
        </div>
      </div>
    `;

    const titleInput = document.getElementById('project-note-title-input');
    titleInput?.addEventListener('input', () => {
      syncDraftFromInputs();
      scheduleAutosave();
    });
    titleInput?.addEventListener('blur', () => {
      syncDraftFromInputs();
      scheduleAutosave(activeNoteId, { immediate: true });
    });

    const bodyEditor = document.getElementById('project-note-body-input');
    bodyEditor?.addEventListener('mouseup', queueEditorSelectionSave);
    bodyEditor?.addEventListener('keyup', queueEditorSelectionSave);
    bodyEditor?.addEventListener('keydown', handleEditorTabKey);
    bodyEditor?.addEventListener('focus', queueEditorSelectionSave);
    bodyEditor?.addEventListener('click', updateEditorToolbarState);
    bodyEditor?.addEventListener('input', () => {
      queueEditorSelectionSave();
      syncDraftFromInputs();
      scheduleAutosave();
    });
    bodyEditor?.addEventListener('paste', (event) => {
      event.preventDefault();
      const text = event.clipboardData?.getData('text/plain') || '';
      document.execCommand('insertText', false, text);
      saveEditorSelection();
      syncDraftFromInputs();
      updateEditorToolbarState();
      scheduleAutosave();
    });

    mainEl.querySelectorAll('.project-notes-tool-btn[data-editor-command]').forEach((button) => {
      button.addEventListener('mousedown', (event) => event.preventDefault());
      button.addEventListener('click', () => {
        applyEditorCommand(button.dataset.editorCommand, button.dataset.editorValue || null);
      });
    });

    const fontSizeSelect = document.getElementById('project-notes-font-size');
    fontSizeSelect?.addEventListener('mousedown', queueEditorSelectionSave);
    fontSizeSelect?.addEventListener('focus', queueEditorSelectionSave);
    fontSizeSelect?.addEventListener('change', () => {
      applyEditorCommand('fontSize', fontSizeSelect.value);
      updateEditorToolbarState();
    });

    updateEditorToolbarState();
  }

  function render() {
    renderList();
    renderMain();
  }

  async function reloadFromStore({ preserveActive = true } = {}) {
    const [freshUsers, freshProjects, notes] = await Promise.all([
      window.api.getUsers(),
      window.api.getProjects(),
      window.api.getProjectSharedNotes(projectId),
    ]);
    users = freshUsers || [];
    project = (freshProjects || []).find((candidate) => String(candidate.id) === String(projectId)) || project;
    drafts = buildProjectNoteDrafts(notes || []);
    const ordered = orderedDrafts();
    activeNoteId = preserveActive && activeNoteId && drafts.has(activeNoteId)
      ? activeNoteId
      : ordered[0]?.id || null;
    subtitleEl.textContent = project ? `${project.client} | ${project.name}` : '';
    document.title = project ? `Project Notes - ${project.client} | ${project.name}` : 'Project Notes';
    render();
  }

  addBtn.addEventListener('click', () => {
    syncDraftFromInputs();
    const draftId = `draft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    drafts.set(draftId, {
      id: draftId,
      project_id: projectId,
      title: 'Untitled Note',
      notes: '',
      created_by: currentUser?.id || null,
      updated_by: currentUser?.id || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      isDraft: true,
    });
    activeNoteId = draftId;
    savedEditorRange = null;
    render();
    setTimeout(() => {
      const titleInput = document.getElementById('project-note-title-input');
      titleInput?.focus();
      titleInput?.select();
    }, 0);
  });

  document.addEventListener('selectionchange', () => {
    const bodyEditor = document.getElementById('project-note-body-input');
    const selection = window.getSelection?.();
    if (!bodyEditor || !selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (!bodyEditor.contains(range.commonAncestorContainer)) return;
    queueEditorSelectionSave();
  });

  document.addEventListener('click', (event) => {
    const link = event.target.closest('[data-open-link]');
    if (!link) return;
    event.preventDefault();
    window.api.openLink(link.dataset.openLink);
  });

  window.addEventListener('beforeunload', () => {
    if (autosaveTimer) clearTimeout(autosaveTimer);
    if (saveStatusTimer) clearTimeout(saveStatusTimer);
  });

  window.ProjectNotesWindow = {
    async flushBeforeClose() {
      syncDraftFromInputs();
      if (autosaveTimer) {
        clearTimeout(autosaveTimer);
        autosaveTimer = null;
      }
      if (activeNoteId) {
        await scheduleAutosave(activeNoteId, { immediate: true });
      } else {
        await saveChain.catch(() => null);
      }
    },
  };

  window.api.onDataUpdated(() => {
    if (Date.now() < ignoreDataUpdatesUntil) return;
    reloadFromStore({ preserveActive: true }).catch((err) => {
      console.error('Failed to refresh project notes:', err);
    });
  });

  (async function init() {
    if (!projectId) {
      subtitleEl.textContent = 'No project selected.';
      return;
    }
    currentUser = await window.api.getCurrentUser();
    applyStoredThemePreference();
    await reloadFromStore({ preserveActive: false });
  })().catch((err) => {
    console.error('Project notes window failed to initialize:', err);
    mainEl.innerHTML = '<div class="project-notes-empty-state"><div class="project-notes-empty-title">Could not load notes</div><div class="project-notes-empty-copy">Close this window and try opening Project Notes again.</div></div>';
  });
})();
