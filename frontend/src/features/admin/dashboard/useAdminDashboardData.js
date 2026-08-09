import { useCallback, useEffect, useState } from 'react';
import { auth } from '../../../firebase';

export default function useAdminDashboardData(api) {
  const [authReady, setAuthReady] = useState(false);
  const [claims, setClaims] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [users, setUsers] = useState([]);
  const [usersNextCursor, setUsersNextCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [adminAccess, setAdminAccess] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      setError('');
      setLoading(true);

      const user = auth.currentUser;
      if (!user) {
        setError('No user logged in. Please login to access the admin dashboard.');
        return;
      }

      const [jobsResponse, usersResponse, bootstrapRes] = await Promise.all([
        api.get('/api/admin/jobs'),
        api.get('/api/admin/users?role=all&limit=50'),
        api.get('/api/admin/bootstrap').catch(() => ({ data: null })),
      ]);

      setJobs(jobsResponse.data || []);
      setUsers(usersResponse.data?.users || []);
      setUsersNextCursor(usersResponse.data?.nextCursor || null);
      setAdminAccess(bootstrapRes?.data?.access || null);
    } catch (err) {
      console.error('Admin fetch failed:', err);

      const status = err?.response?.status;
      if (status === 401) {
        setError('Unauthorised (401). No/invalid token was accepted by the backend. Please logout and login again.');
      } else if (status === 403) {
        setError('Forbidden (403). Your token is valid but your account does not have admin privileges.');
      } else {
        setError('Failed to fetch data. Check backend is running on port 8000 and try again.');
      }
    } finally {
      setLoading(false);
    }
  }, [api]);

  const loadMoreUsers = useCallback(async () => {
    try {
      if (!usersNextCursor) return;

      const res = await api.get(`/api/admin/users?role=all&limit=50&cursor=${encodeURIComponent(usersNextCursor)}`);
      setUsers((prev) => [...prev, ...(res.data?.users || [])]);
      setUsersNextCursor(res.data?.nextCursor || null);
    } catch (e) {
      console.error('Load more users failed:', e);
      setError(e?.response?.data?.message || 'Failed to load more users.');
    }
  }, [api, usersNextCursor]);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (user) => {
      setAuthReady(true);

      if (!user) {
        setClaims(null);
        setAdminAccess(null);
        setLoading(false);
        setError('No user logged in. Please login.');
        return;
      }

      try {
        const idTokenResult = await user.getIdTokenResult(true);
        setClaims(idTokenResult?.claims || null);
        await fetchData();
      } catch (e) {
        console.error('Failed reading token claims:', e);
        setError('Logged in, but failed to read token/claims. Try logout/login again.');
        setLoading(false);
      }
    });

    const onFocus = () => {
      if (auth.currentUser) fetchData();
    };

    window.addEventListener('focus', onFocus);
    return () => {
      unsub();
      window.removeEventListener('focus', onFocus);
    };
  }, [fetchData]);

  return {
    authReady,
    claims,
    adminAccess,
    jobs,
    users,
    usersNextCursor,
    loading,
    error,
    setJobs,
    setUsers,
    fetchData,
    loadMoreUsers,
    setError,
  };
}
