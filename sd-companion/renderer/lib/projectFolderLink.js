(function attachProjectFolderLink(globalScope) {
  const { escapeAttr, escapeHtml } = globalScope.MyTasksHtml;

  function getFolderLinkDisplayLabel(project, getProjectDisplayTitle) {
    return getProjectDisplayTitle(project) || 'Project folder';
  }

  function renderProjectFolderCard(project, canManageFolder, options = {}) {
    if (!project) return '';

    const editState = options.editState || null;
    const isEditing = editState?.projectId === project.id;
    const hasLink = Boolean(String(project.folder_link || '').trim());
    const displayTitle = options.getProjectDisplayTitle || ((item) => item?.name || '');

    if (isEditing) {
      return `
        <div class="detail-link-card detail-link-card-editing">
          <div class="detail-link-card-main">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M1 3.5A1.5 1.5 0 0 1 2.5 2h3.086a1.5 1.5 0 0 1 1.06.44l.915.914A1.5 1.5 0 0 0 8.621 4H13.5A1.5 1.5 0 0 1 15 5.5v7A1.5 1.5 0 0 1 13.5 14h-11A1.5 1.5 0 0 1 1 12.5v-9z" stroke="currentColor" stroke-width="1.2"/>
            </svg>
            <input type="text" class="detail-link-input" id="detail-folder-link-input" value="${escapeAttr(editState.value || '')}" placeholder="Paste a folder path or link">
          </div>
          <div class="detail-link-card-actions">
            <button class="detail-link-action" id="detail-folder-link-cancel" type="button">Cancel</button>
            <button class="detail-link-action detail-link-action-primary" id="detail-folder-link-save" type="button">Save</button>
          </div>
        </div>
      `;
    }

    const clickableClass = hasLink ? 'is-clickable' : (canManageFolder ? 'is-empty-editable' : 'is-empty');
    return `
      <button class="detail-link-card ${clickableClass}" id="detail-folder-link-card" type="button">
        <div class="detail-link-card-main">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M1 3.5A1.5 1.5 0 0 1 2.5 2h3.086a1.5 1.5 0 0 1 1.06.44l.915.914A1.5 1.5 0 0 0 8.621 4H13.5A1.5 1.5 0 0 1 15 5.5v7A1.5 1.5 0 0 1 13.5 14h-11A1.5 1.5 0 0 1 1 12.5v-9z" stroke="currentColor" stroke-width="1.2"/>
          </svg>
          <span class="detail-link-card-label">${escapeHtml(hasLink ? getFolderLinkDisplayLabel(project, displayTitle) : (canManageFolder ? 'Add project folder link' : 'No project folder link'))}</span>
        </div>
        <div class="detail-link-card-end">
          ${hasLink && canManageFolder ? `
            <span class="detail-link-menu-btn" id="detail-folder-link-menu" title="Folder link options" aria-label="Folder link options">&#8942;</span>
          ` : ''}
          ${hasLink ? '<span class="detail-link-arrow" aria-hidden="true">&rsaquo;</span>' : ''}
        </div>
      </button>
    `;
  }

  async function showOpenLinkError(result) {
    await globalScope.MyTasksConfirmDialog.alert({
      title: 'Could not open link',
      message: result?.error || 'Could not open that link.',
    });
  }

  function bindProjectFolderLinkControls(options = {}) {
    const {
      canManageFolder,
      project,
      refreshAfterProjectChange,
      refreshTaskId = null,
      renderPanel,
      setEditState,
      positionMenu,
    } = options;
    if (!project) return;

    const folderCard = document.getElementById('detail-folder-link-card');
    const folderMenuBtn = document.getElementById('detail-folder-link-menu');
    const folderInput = document.getElementById('detail-folder-link-input');
    const folderSaveBtn = document.getElementById('detail-folder-link-save');
    const folderCancelBtn = document.getElementById('detail-folder-link-cancel');

    folderCard?.addEventListener('click', async () => {
      const linkValue = String(project.folder_link || '').trim();
      if (linkValue) {
        const result = await globalScope.api.openLink(linkValue);
        if (!result?.success) await showOpenLinkError(result);
        return;
      }

      if (canManageFolder) {
        setEditState({ projectId: project.id, value: '' });
        await renderPanel();
      }
    });

    folderMenuBtn?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!canManageFolder) return;

      const menu = globalScope.ContextMenu.create([
        {
          label: 'Edit',
          action: async () => {
            setEditState({
              projectId: project.id,
              value: project.folder_link || '',
            });
            await renderPanel();
          },
        },
        {
          label: 'Clear',
          danger: true,
          action: async () => {
            setEditState(null);
            await globalScope.api.updateProject({ id: project.id, folder_link: '' });
            await refreshAfterProjectChange(project.id, refreshTaskId);
          },
        },
      ]);

      const rect = folderMenuBtn.getBoundingClientRect();
      positionMenu(menu, rect.right - 180, rect.bottom + 6);
    });

    if (folderInput) {
      setTimeout(() => {
        folderInput.focus();
        folderInput.select();
      }, 20);
    }

    folderSaveBtn?.addEventListener('click', async () => {
      const nextValue = folderInput.value.trim();
      setEditState(null);
      await globalScope.api.updateProject({ id: project.id, folder_link: nextValue });
      await refreshAfterProjectChange(project.id, refreshTaskId);
    });

    folderCancelBtn?.addEventListener('click', async () => {
      setEditState(null);
      await renderPanel();
    });

    folderInput?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        folderSaveBtn?.click();
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        folderCancelBtn?.click();
      }
    });
  }

  globalScope.MyTasksProjectFolderLink = {
    bindProjectFolderLinkControls,
    renderProjectFolderCard,
  };
})(window);
