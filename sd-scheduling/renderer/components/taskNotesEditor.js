/**
 * Persistent inline notes editor for task cards.
 *
 * Task cards are rerendered often as sync, filters, and staff grouping change.
 * Keeping note drafts and save queues here prevents an active note field from
 * losing its timer/queue when its card markup is replaced.
 */
(function attachTaskNotesEditor(globalScope) {
  const SAVE_DELAY_MS = 900;
  const RETRY_DELAY_MS = 2500;

  const TaskNotesEditor = {
    _states: new Map(),

    getDisplayValue(task) {
      const state = this._hydrateTask(task);
      return state.dirty ? state.draftValue : state.savedValue;
    },

    bindInput(input) {
      if (!input || input.dataset.notesEditorBound === 'true') return;

      input.dataset.notesEditorBound = 'true';
      const taskId = input.dataset.taskId;
      const isPartner = AppState.isPartner();

      input.addEventListener('mousedown', (event) => event.stopPropagation());
      input.addEventListener('click', (event) => event.stopPropagation());

      if (!isPartner) {
        input.readOnly = true;
        return;
      }

      input.addEventListener('input', () => {
        this._setDraft(taskId, input.value);
        this._scheduleSave(taskId, input.value);
      });

      input.addEventListener('blur', () => {
        const normalized = this._normalize(input.value);
        input.value = normalized;
        this._setDraft(taskId, normalized);
        this._save(taskId, normalized);
      });

      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          input.blur();
          return;
        }

        if (event.key === 'Escape') {
          event.preventDefault();
          this._cancelDraft(taskId);
          input.value = this._getState(taskId).savedValue;
          input.blur();
        }
      });
    },

    _hydrateTask(task) {
      const taskId = task?.id;
      const savedValue = this._normalize(task?.notes || '');
      let state = this._states.get(taskId);

      if (!state) {
        state = {
          savedValue,
          draftValue: savedValue,
          dirty: false,
          inFlight: false,
          queuedValue: null,
          timer: null,
        };
        this._states.set(taskId, state);
        return state;
      }

      if (!state.dirty && !state.inFlight) {
        state.savedValue = savedValue;
        state.draftValue = savedValue;
      }

      return state;
    },

    _getState(taskId) {
      if (!this._states.has(taskId)) {
        this._states.set(taskId, {
          savedValue: '',
          draftValue: '',
          dirty: false,
          inFlight: false,
          queuedValue: null,
          timer: null,
        });
      }

      return this._states.get(taskId);
    },

    _setDraft(taskId, value) {
      const state = this._getState(taskId);
      state.draftValue = value;
      state.dirty = this._normalize(value) !== state.savedValue || state.inFlight;
    },

    _cancelDraft(taskId) {
      const state = this._getState(taskId);
      clearTimeout(state.timer);
      state.timer = null;
      state.queuedValue = null;
      state.draftValue = state.savedValue;
      state.dirty = state.inFlight;
    },

    _scheduleSave(taskId, value) {
      const state = this._getState(taskId);
      clearTimeout(state.timer);
      state.timer = setTimeout(() => {
        state.timer = null;
        this._save(taskId, value);
      }, SAVE_DELAY_MS);
    },

    async _save(taskId, value) {
      const state = this._getState(taskId);
      const nextValue = this._normalize(value);

      clearTimeout(state.timer);
      state.timer = null;

      if (state.inFlight) {
        state.queuedValue = nextValue;
        return;
      }

      if (nextValue === state.savedValue) {
        state.draftValue = nextValue;
        state.dirty = false;
        return;
      }

      state.inFlight = true;
      state.queuedValue = null;

      try {
        const savedTask = await window.api.updateTask({ id: taskId, notes: nextValue });
        const savedValue = this._normalize(savedTask?.notes ?? nextValue);
        state.savedValue = savedValue;

        if (savedTask && typeof AppState.patchTask === 'function') {
          AppState.patchTask(savedTask, { notify: false });
        }

        const currentDraft = this._normalize(state.draftValue);
        state.dirty = currentDraft !== savedValue;
        if (!state.dirty) {
          state.draftValue = savedValue;
        }
      } catch (error) {
        console.error('Task note save failed:', error);
        state.dirty = true;
        clearTimeout(state.timer);
        state.timer = setTimeout(() => {
          state.timer = null;
          this._save(taskId, state.draftValue);
        }, RETRY_DELAY_MS);
      } finally {
        state.inFlight = false;
      }

      if (state.queuedValue !== null) {
        const queuedValue = state.queuedValue;
        state.queuedValue = null;
        this._save(taskId, queuedValue);
      }
    },

    _normalize(value) {
      return String(value || '').trim();
    },
  };

  globalScope.TaskNotesEditor = TaskNotesEditor;
})(window);
