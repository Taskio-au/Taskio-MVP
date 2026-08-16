import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '../firebase';
import { getE2EAuthUser, isE2EAdminUser } from '../e2e/authBypass';
import { PageLoadingShell } from './ui/AsyncPageStates';

function hasAdminClaims(tokenResult) {
  const claims = tokenResult?.claims || {};
  return claims.admin === true || claims.role === 'admin';
}

export default function AdminRoute({ children }) {
  const [user, authLoading] = useAuthState(auth);
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const e2eUser = getE2EAuthUser();

  useEffect(() => {
    let cancelled = false;

    const verifyAdmin = async () => {
      if (!user) {
        if (!cancelled) {
          setIsAdmin(false);
          setChecking(false);
        }
        return;
      }

      setChecking(true);
      try {
        const tokenResult = await user.getIdTokenResult(true);
        if (hasAdminClaims(tokenResult)) {
          if (!cancelled) setIsAdmin(true);
          return;
        }

        if (!cancelled) setIsAdmin(false);
      } catch (err) {
        if (!cancelled) setIsAdmin(false);
      } finally {
        if (!cancelled) setChecking(false);
      }
    };

    if (!authLoading) verifyAdmin();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  if (e2eUser) {
    if (!isE2EAdminUser()) return <Navigate to="/dashboard" replace />;
    return children;
  }

  if (authLoading || checking) return <PageLoadingShell message="Loading admin session…" detail="Verifying your administrator access." />;
  if (!user) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  return children;
}
