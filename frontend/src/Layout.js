import React from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from './firebase';
import { PageLoadingShell } from './components/ui/AsyncPageStates';

const Layout = () => {
    const [user, loading] = useAuthState(auth);

    if (loading) {
        return <PageLoadingShell message="Loading admin session…" detail="Verifying your administrator access." />;
    }

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    // If we have a user, render the admin layout with the nested route content
    return (
        <div style={{ minHeight: '100vh', backgroundColor: '#F7F9FA' }}>
            <Outlet />
        </div>
    );
};

export default Layout;
