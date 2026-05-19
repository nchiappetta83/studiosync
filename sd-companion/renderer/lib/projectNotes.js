(function attachMyTasksProjectNotes(globalScope) {
  function orderProjectNotes(notes = []) {
    return [...notes].sort((left, right) => {
      const updatedDiff = Date.parse(right.updated_at || 0) - Date.parse(left.updated_at || 0);
      if (Number.isFinite(updatedDiff) && updatedDiff !== 0) return updatedDiff;
      const createdDiff = Date.parse(right.created_at || 0) - Date.parse(left.created_at || 0);
      if (Number.isFinite(createdDiff) && createdDiff !== 0) return createdDiff;
      return String(left.title || '').localeCompare(String(right.title || ''));
    });
  }

  function buildProjectNoteDrafts(notes = []) {
    const drafts = new Map();
    for (const note of notes) {
      drafts.set(note.id, {
        ...note,
        _lastSavedTitle: note.title || 'Untitled Note',
        _lastSavedNotes: note.notes || '',
      });
    }
    return drafts;
  }

  function isUntouchedProjectNoteDraft(draft) {
    return Boolean(draft?.isDraft)
      && String(draft.title || '').trim() === 'Untitled Note'
      && !String(draft.notes || '').trim();
  }

  function hasProjectNotePersistedChanges(draft) {
    if (!draft) return false;
    if (draft.isDraft) return !isUntouchedProjectNoteDraft(draft);
    return String(draft.title || 'Untitled Note') !== String(draft._lastSavedTitle || 'Untitled Note')
      || String(draft.notes || '') !== String(draft._lastSavedNotes || '');
  }

  function formatProjectNoteTimestamp(value) {
    const parsed = value ? new Date(value) : null;
    if (!parsed || Number.isNaN(parsed.getTime())) return 'Just now';
    return parsed.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  globalScope.MyTasksProjectNotes = {
    orderProjectNotes,
    buildProjectNoteDrafts,
    isUntouchedProjectNoteDraft,
    hasProjectNotePersistedChanges,
    formatProjectNoteTimestamp,
  };
})(window);
