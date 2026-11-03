(function () {
  function getProjectPartnerIds(project) {
    if (!project) return [];

    try {
      const parsed = JSON.parse(project.partner_ids || '[]');
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch (_) {
      return [];
    }
  }

  function isFutureProject(project) {
    return project?.category === 'future' || project?.status === 'future';
  }

  function getProjectSection(project) {
    if (project?.status !== 'active') return 'inactive';
    return isFutureProject(project) ? 'future' : 'active';
  }

  function getProjectDisplayTitle(project) {
    if (!project) return '';
    return project.client ? `${project.client} | ${project.name}` : (project.name || '');
  }

  function normalizeTaskDisplayTitle(title) {
    const rawTitle = String(title || '').trim();
    if (!rawTitle) return '';
    if (rawTitle.includes('|')) {
      return rawTitle
        .split('|')
        .map((part) => part.trim())
        .filter(Boolean)
        .join(' | ');
    }
    return rawTitle.replace(/\s+[–—-]\s+/, ' | ');
  }

  function getTaskDisplayTitle(task, project = null) {
    if (project) return getProjectDisplayTitle(project);
    return normalizeTaskDisplayTitle(task?.title || '');
  }

  window.MyTasksProjectDisplay = {
    getProjectPartnerIds,
    isFutureProject,
    getProjectSection,
    getProjectDisplayTitle,
    normalizeTaskDisplayTitle,
    getTaskDisplayTitle,
  };
})();
