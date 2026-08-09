/**
 * Builds /admin/dashboard URL with tab param merged into current query string.
 */
export function buildDashboardTabUrl(currentSearch, tab) {
  const params = new URLSearchParams(currentSearch || '');
  params.set('tab', tab);
  return `/admin/dashboard?${params.toString()}`;
}
