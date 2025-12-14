import React from 'react';
import { Outlet, Navigate, useNavigate } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from './firebase';
import { signOut } from 'firebase/auth';

const Layout = () => {
    const [user, loading] = useAuthState(auth);
    const navigate = useNavigate();

    const handleLogout = async () => {
        try {
            await signOut(auth);
            navigate('/');
        } catch (error) {
            console.error("Failed to log out:", error);
        }
    };

    if (loading) {
        return <div style={styles.centered}>Loading admin session...</div>;
    }

    if (!user) {
        return <Navigate to="/" />; // Redirect to login if not authenticated
    }

    // If we have a user, render the admin layout with the nested route content
    return (
        <div>
            <header style={styles.header}>
                <h1 style={styles.headerTitle}>Taskio Admin</h1>
                <button onClick={handleLogout} style={styles.logoutButton}>Logout</button>
            </header>
            <main style={styles.main}>
                <Outlet />
            </main>
        </div>
    );
};

const styles = {
    header: {
        backgroundColor: '#14C5C5', // Taskio Teal
        padding: '1rem 2rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        color: 'white',
    },
    headerTitle: {
        margin: 0,
        fontFamily: 'Poppins, sans-serif',
        fontSize: '1.5rem',
    },
    logoutButton: {
        backgroundColor: '#FF9100', // Taskio Orange
        color: 'white',
        border: 'none',
        borderRadius: '8px',
        padding: '10px 20px',
        fontFamily: 'Inter, sans-serif',
        fontWeight: 'bold',
        cursor: 'pointer',
        transition: 'background-color 0.2s ease',
    },
    main: {
        padding: '2rem',
        backgroundColor: '#F7F9FA', // Pale Cloud
        minHeight: 'calc(100vh - 70px)', // Adjust height based on header
    },
    centered: {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        fontFamily: 'Inter, sans-serif',
    }
};

export default Layout;

