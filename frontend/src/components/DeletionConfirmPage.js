import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { createApiClient } from '../api/createApiClient';

const api = createApiClient();

function useQuery() {
  const { search } = useLocation();
  return React.useMemo(() => new URLSearchParams(search), [search]);
}

export default function DeletionConfirmPage() {
  const query = useQuery();
  const token = query.get('token') || '';
  const [state, setState] = useState({ loading: true, ok: false, message: '' });

  useEffect(() => {
    const run = async () => {
      if (!token) {
        setState({ loading: false, ok: false, message: 'Missing token.' });
        return;
      }
      try {
        const res = await api.get(`/api/me/deletion/confirm?token=${encodeURIComponent(token)}`);
        setState({ loading: false, ok: true, message: res?.data?.message || 'Deletion confirmed.' });
      } catch (e) {
        setState({ loading: false, ok: false, message: e?.response?.data?.message || 'Could not confirm deletion.' });
      }
    };
    run();
  }, [token]);

  return (
    <div style={{ minHeight: '100vh', background: '#F7F9FA', padding: 24, fontFamily: 'Inter, sans-serif' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', background: '#fff', border: '1px solid #E0E0E0', borderRadius: 14, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <div style={{ fontFamily: 'Poppins, sans-serif', fontSize: 20, fontWeight: 800, color: '#222' }}>Account deletion confirmation</div>
        <div style={{ marginTop: 10, fontSize: 14, color: '#444', lineHeight: 1.6 }}>
          {state.loading ? 'Confirming…' : state.message}
        </div>
        <div style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link to="/" style={{ textDecoration: 'none', color: '#14C5C5', fontWeight: 800 }}>Back to home</Link>
          <Link to="/login" style={{ textDecoration: 'none', color: '#14C5C5', fontWeight: 800 }}>Login</Link>
        </div>
      </div>
    </div>
  );
}











