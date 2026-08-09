import React from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from './firebase';

const Layout = () => {
    const [user, loading] = useAuthState(auth);

    if (loading) {
        return <div style={styles.centered}>Loading admin session...</div>;
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

const styles = {
    centered: {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        fontFamily: 'Inter, sans-serif',
    }
};

export default Layout;

