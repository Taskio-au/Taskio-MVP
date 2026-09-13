import { useCallback, useState } from 'react';

export default function usePilotSupply(api) {
  const [loadState, setLoadState] = useState('loading');
  const [data, setData] = useState(null);

  const refresh = useCallback(async () => {
    if (!api?.get) {
      setData(null);
      setLoadState('error');
      return;
    }
    try {
      const res = await api.get('/api/admin/pilot-supply');
      const payload = res?.data;
      if (!payload || typeof payload !== 'object') {
        setData(null);
        setLoadState('error');
        return;
      }
      setData(payload);
      setLoadState('ok');
    } catch (_) {
      setData(null);
      setLoadState('error');
    }
  }, [api]);

  return { loadState, data, refresh };
}
