(function () {
  const projectId = new URLSearchParams(window.location.search).get('projectId');
  const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const labels = { created: 'created', completed: 'completed', reopened: 'reopened', deleted: 'deleted', updated: 'updated' };
  const formatDate = (value) => value ? new Date(`${String(value).replace(' ', 'T')}Z`).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '';
  async function render() {
    const [projects, entries] = await Promise.all([window.api.getProjects(), window.api.getProjectActivity(projectId)]);
    const project = projects.find((item) => String(item.id) === String(projectId));
    document.getElementById('project-title').textContent = project ? `${project.client ? `${project.client} | ` : ''}${project.name}` : 'Project Activity';
    const list = document.getElementById('activity-list');
    if (!entries.length) { list.innerHTML = '<div class="empty">No activity has been recorded for this project yet.</div>'; return; }
    list.innerHTML = entries.map((entry) => `<article class="activity-entry"><div class="activity-copy"><strong>${escape(entry.actor_name || 'Someone')}</strong> ${escape(labels[entry.action] || 'updated')} <span>${escape(entry.task_title || 'a task')}</span></div><time>${escape(formatDate(entry.created_at))}</time></article>`).join('');
  }
  window.api.onDataUpdated(() => render().catch(() => {}));
  render().catch(() => { document.getElementById('activity-list').innerHTML = '<div class="empty">Activity could not be loaded.</div>'; });
})();
