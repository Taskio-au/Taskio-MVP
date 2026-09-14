export function resolveHomeownerPosting({ loadState, status } = {}) {
  const canPost = loadState === 'ok' && status?.canPost === true;
  return {
    canPost,
    path: canPost ? '/post-job' : '/waitlist',
    label: canPost ? 'Post a task' : 'Join waitlist',
    navLabel: canPost ? 'Post a Task' : 'Join waitlist',
    emptyText: canPost ? 'Post a task to get started' : 'New job posting is not open right now',
  };
}

export function getAppHeaderNavItems(userRole, posting) {
  if (userRole === 'tradie') {
    return [
      { label: 'Dashboard', path: '/tradie/dashboard' },
      { label: 'Tasks', path: '/tradie/jobs' },
      { label: 'Messages', path: '/messages', badgeKey: 'messages' },
    ];
  }
  if (userRole === 'homeowner') {
    return [
      { label: 'Dashboard', path: '/dashboard' },
      { label: posting?.navLabel || 'Join waitlist', path: posting?.path || '/waitlist' },
      { label: 'Messages', path: '/messages', badgeKey: 'messages' },
    ];
  }
  if (userRole === 'admin') {
    return [
      { label: 'Dashboard', path: '/admin/dashboard' },
      { label: 'Daily checklist', path: '/admin/daily-checklist' },
      { label: 'Monitoring', path: '/admin/monitoring', badgeKey: 'monitoring' },
      { label: 'Profile changes', path: '/admin/profile-change-requests', badgeKey: 'profileChanges' },
      { label: 'Support tickets', path: '/admin/support', badgeKey: 'support' },
    ];
  }
  return [];
}
