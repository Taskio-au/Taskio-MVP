import { useCallback, useState } from 'react';

export default function usePilotSettings(api) {
  const [loadState, setLoadState] = useState('loading');
  const [data, setData] = useState(null);
  const [mutationError, setMutationError] = useState(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!api?.get) {
      setData(null);
      setLoadState('error');
      return;
    }
    try {
      const res = await api.get('/api/admin/pilot-settings');
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

  const changeState = useCallback(async (state, reason = '') => {
    if (!api?.put) {
      const error = { code: 'UNAVAILABLE', message: 'Pilot settings API is unavailable.' };
      setMutationError(error);
      return { ok: false, error };
    }
    setBusy(true);
    setMutationError(null);
    try {
      const res = await api.put('/api/admin/pilot-settings/state', { state, reason });
      const payload = res?.data;
      if (payload?.settings && typeof payload.settings === 'object') {
        setData(payload.settings);
        setLoadState('ok');
      } else {
        await refresh();
      }
      return { ok: true, result: payload };
    } catch (err) {
      const error = err?.response?.data && typeof err.response.data === 'object'
        ? err.response.data
        : { code: 'UPDATE_FAILED', message: 'Could not update pilot operational state.' };
      setMutationError(error);
      return { ok: false, error };
    } finally {
      setBusy(false);
    }
  }, [api, refresh]);

  return { loadState, data, refresh, changeState, mutationError, busy };
}
