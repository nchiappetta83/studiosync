(function () {
  const COMMENT_SCROLL_BOTTOM_THRESHOLD = 18;

  function getCommentStateSignature(comments = []) {
    if (!Array.isArray(comments) || comments.length === 0) return '0';
    const lastComment = comments[comments.length - 1];
    return `${comments.length}:${lastComment.id || ''}:${lastComment.created_at || ''}`;
  }

  function isCommentScrollAtBottom(scrollEl) {
    if (!scrollEl) return true;
    const remaining = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight;
    return remaining <= COMMENT_SCROLL_BOTTOM_THRESHOLD;
  }

  function setCommentJumpButtonState(button, unreadCount = 0) {
    if (!button) return;
    const hasUnread = unreadCount > 0;
    button.classList.toggle('hidden', !hasUnread);
    button.textContent = unreadCount > 1 ? `${unreadCount} new messages ↓` : 'New message ↓';
  }

  function timeAgo(isoStr) {
    const d = new Date(isoStr);
    const now = new Date();
    const hrs = Math.floor((now - d) / 3600000);
    if (hrs < 1) return 'just now';
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days === 1) return 'yesterday';
    return `${days}d ago`;
  }

  function formatClockTime(isoStr) {
    const d = new Date(isoStr);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  window.MyTasksCommentDisplay = {
    COMMENT_SCROLL_BOTTOM_THRESHOLD,
    getCommentStateSignature,
    isCommentScrollAtBottom,
    setCommentJumpButtonState,
    timeAgo,
    formatClockTime,
  };
})();
