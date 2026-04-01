/**
 * Comments component — two-way comment thread on task cards.
 * Both partners and staff can post comments.
 *
 * renderInline() — compact version, always visible on every task card.
 * render()       — full version with header label, used in expanded detail.
 */

const Comments = {
  /**
   * Compact inline version — always visible on task cards.
   * Shows existing comments + input row. No "Comments" header if empty.
   */
  renderInline(taskId, comments) {
    let commentsHtml = '';

    for (const comment of comments) {
      commentsHtml += this._renderComment(comment);
    }

    // If there are comments, show them. Always show the input.
    const listHtml = comments.length > 0
      ? `<div class="comments-list comments-list-inline" id="comments-list-${taskId}">${commentsHtml}</div>`
      : '';

    return `
      <div class="comments-inline" data-task-id="${taskId}">
        ${listHtml}
        <div class="comment-input-row">
          <textarea class="comment-input" id="comment-input-${taskId}"
                    placeholder="Add a comment..." rows="1" data-task-id="${taskId}"></textarea>
          <button class="comment-submit" data-action="submit-comment" data-task-id="${taskId}" disabled>Send</button>
        </div>
      </div>
    `;
  },

  /**
   * Full version with section header — used in expanded sub-task detail area.
   */
  render(taskId, comments) {
    let commentsHtml = '';

    for (const comment of comments) {
      commentsHtml += this._renderComment(comment);
    }

    return `
      <div class="comments-section">
        <div class="comments-label">Comments ${comments.length > 0 ? `(${comments.length})` : ''}</div>
        <div class="comments-list" id="comments-list-${taskId}">
          ${commentsHtml || '<div class="empty-section">No comments yet</div>'}
        </div>
        <div class="comment-input-row">
          <textarea class="comment-input" id="comment-input-${taskId}"
                    placeholder="Write a comment..." rows="1" data-task-id="${taskId}"></textarea>
          <button class="comment-submit" data-action="submit-comment" data-task-id="${taskId}" disabled>Send</button>
        </div>
      </div>
    `;
  },

  _renderComment(comment) {
    const initials = this._getInitials(comment.author_name || 'Unknown');
    const timeStr = this._formatTime(comment.created_at);
    const isOwn = comment.author_id === AppState.get('currentUser')?.id;

    return `
      <div class="comment" data-comment-id="${comment.id}">
        <div class="comment-avatar" style="background: ${comment.author_color || '#5856A6'}">${initials}</div>
        <div class="comment-body">
          <div class="comment-header">
            <span class="comment-author">${this._escapeHtml(comment.author_name || 'Unknown')}</span>
            <span class="comment-time">${timeStr}</span>
            ${isOwn ? `
              <div class="comment-actions">
                <button class="task-action-btn" data-action="delete-comment" data-comment-id="${comment.id}" data-task-id="${comment.task_id}" title="Delete">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>
            ` : ''}
          </div>
          <div class="comment-text">${this._escapeHtml(comment.body)}</div>
        </div>
      </div>
    `;
  },

  bindEvents(container, taskId) {
    // Delete comment
    container.querySelectorAll('[data-action="delete-comment"]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await window.api.deleteComment(btn.dataset.commentId);
        // Reload just this card's comments
        this._reloadComments(taskId);
      });
    });

    // Comment input — auto-resize and enable/disable submit
    const input = document.getElementById(`comment-input-${taskId}`);
    const submitBtn = container.querySelector(`[data-action="submit-comment"][data-task-id="${taskId}"]`);

    if (input && submitBtn) {
      input.addEventListener('input', () => {
        submitBtn.disabled = !input.value.trim();
        // Auto-resize
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 100) + 'px';
      });

      // Submit on Enter (Shift+Enter for newline)
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          if (input.value.trim()) {
            this._submitComment(taskId, input);
          }
        }
      });

      submitBtn.addEventListener('click', () => {
        if (input.value.trim()) {
          this._submitComment(taskId, input);
        }
      });
    }
  },

  async _submitComment(taskId, input) {
    const currentUser = AppState.get('currentUser');
    if (!currentUser) return;

    const body = input.value.trim();
    if (!body) return;

    input.value = '';
    input.style.height = 'auto';

    await window.api.addComment({
      task_id: taskId,
      author_id: currentUser.id,
      body: body
    });

    this._reloadComments(taskId);
  },

  async _reloadComments(taskId) {
    const commentsArea = document.getElementById(`task-comments-${taskId}`);
    if (commentsArea) {
      const comments = await window.api.getComments(taskId);
      commentsArea.innerHTML = this.renderInline(taskId, comments);
      this.bindEvents(commentsArea, taskId);
    }
  },

  _getInitials(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return parts[0].substring(0, 2).toUpperCase();
  },

  _formatTime(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMin = Math.floor(diffMs / 60000);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHour < 24) return `${diffHour}h ago`;
    if (diffDay < 7) return `${diffDay}d ago`;

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  },

  _escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
};
