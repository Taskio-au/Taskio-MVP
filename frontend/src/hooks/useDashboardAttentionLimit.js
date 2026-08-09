import { useEffect, useState } from 'react';
import { getDashboardAttentionLimit } from '../utils/dashboardAttentionLimits';

function readWidth() {
  if (typeof window === 'undefined') return 1280;
  return window.innerWidth;
}

/**
 * Live dashboard priority-card limit from viewport width (resize-safe).
 */
export function useDashboardAttentionLimit() {
  const [limit, setLimit] = useState(() => getDashboardAttentionLimit(readWidth()));

  useEffect(() => {
    const onResize = () => setLimit(getDashboardAttentionLimit(window.innerWidth));
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return limit;
}
