// src/components/HomeownerDashboard.js
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../firebase';
import { signOut } from "firebase/auth";
import axios from 'axios';

// Axios instance for consistent API calls
const api = axios.create({
    baseURL: process.env.REACT_APP_API_BASE_URL || 'http://localhost:8000'
});

// --- Helper Component: Job Status Stepper ---
const JobStatusStepper = ({ currentStatus }) => {
    const statuses = useMemo(() => [
        { id: 'open', label: 'Awaiting Quotes' },
        { id: 'assigned', label: 'Quote Accepted' },
        { id: 'awaiting_funding', label: 'Fund Escrow' },
        { id: 'in_progress', label: 'In Progress' },
        { id: 'completed', label: 'Approve & Pay' }
    ], []);

    const currentIndex = statuses.findIndex(s => s.id === currentStatus);

    const stepperStyle = {
        display: 'flex',
        alignItems: 'flex-start',
        padding: '10px 0',
        fontFamily: 'Inter, sans-serif',
    };

    const stepStyle = {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        flex: 1,
        position: 'relative',
    };

    const circleStyle = (index) => ({
        width: '24px',
        height: '24px',
        borderRadius: '50%',
        backgroundColor: index <= currentIndex ? '#14C5C5' : '#E0E0E0',
        color: 'white',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        fontWeight: 'bold',
        transition: 'background-color 0.3s ease',
        zIndex: 2,
    });

    const labelStyle = (index) => ({
        marginTop: '8px',
        fontSize: '12px',
        fontWeight: index <= currentIndex ? 'bold' : 'normal',
        color: index <= currentIndex ? '#222222' : '#BDBDBD',
        textAlign: 'center',
    });

    const lineStyle = (isActive) => ({
        position: 'absolute',
        top: '12px',
        right: '50%', 
        width: '100%',
        height: '2px',
        backgroundColor: isActive ? '#14C5C5' : '#E0E0E0',
        zIndex: 1,
    });

    return (
        <div style={stepperStyle}>
            {statuses.map((status, index) => (
                <div key={status.id} style={stepStyle}>
                    {index > 0 && <div style={lineStyle(index <= currentIndex)}></div>}
                    <div style={circleStyle(index)}>
                        {index < currentIndex ? '✓' : ''}
                    </div>
                    <span style={labelStyle(index)}>{status.label}</span>
                </div>
            ))}
        </div>
    );
};


// --- Main Component ---

function HomeownerDashboard() {
    const [jobs, setJobs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const navigate = useNavigate();
    const user = auth.currentUser;

    const userInitials = useMemo(() => {
        if (user?.displayName) {
            const names = user.displayName.split(' ');
            return names.map(n => n[0]).join('').toUpperCase();
        }
        if (user?.email) {
            return user.email[0].toUpperCase();
        }
        return '?';
    }, [user]);

    useEffect(() => {
        const fetchJobs = async () => {
            if (!user) {
                navigate('/login'); 
                return;
            }

            try {
                setLoading(true);
                setError('');
                const token = await user.getIdToken();
                const config = { headers: { Authorization: `Bearer ${token}` } };
                const response = await api.get('/api/homeowner/jobs', config);
                setJobs(response.data);
            } catch (err) {
                console.error("Error fetching jobs:", err);
                setError('Could not load your jobs. Please try again later.');
            } finally {
                setLoading(false);
            }
        };

        fetchJobs();
    }, [user, navigate]);

    const handleLogout = async () => {
        try {
            await signOut(auth);
            navigate('/');
        } catch (error) {
            console.error("Failed to log out:", error);
        }
    };

    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
    };

    if (loading) {
        return <div style={styles.centered}>Loading your jobs...</div>;
    }

    if (error) {
        return <div style={{...styles.centered, color: '#DC3545'}}>{error}</div>;
    }

    return (
        <div style={styles.dashboardContainer}>
            <header style={styles.header}>
                <h1 style={styles.mainHeading}>My Posted Jobs</h1>
                <div style={styles.headerControls}>
                    <button onClick={() => navigate('/post-job')} style={styles.postJobButton}>
                        Post a New Job
                    </button>
                    <div style={{ position: 'relative' }}>
                        <button onClick={() => setIsMenuOpen(!isMenuOpen)} style={styles.profileButton}>
                            {userInitials}
                        </button>
                        {isMenuOpen && (
                            <div style={styles.profileMenu}>
                                <a href="/settings" style={styles.menuItem}>Account Settings</a>
                                <button onClick={handleLogout} style={{...styles.menuItem, width: '100%', textAlign: 'left'}}>Logout</button>
                            </div>
                        )}
                    </div>
                </div>
            </header>

            {jobs.length === 0 ? (
                <div style={styles.centered}>
                    <p>You haven't posted any jobs yet.</p>
                </div>
            ) : (
                <div style={styles.jobList}>
                    {jobs.map(job => (
                        <div key={job.id} style={styles.jobCard} onClick={() => navigate(`/job/${job.id}`)}>
                            <div style={styles.jobCardHeader}>
                                <h2 style={styles.jobTitle}>{job.title}</h2>
                            </div>
                            <div style={styles.jobDetails}>
                                <p><strong>Location:</strong> {job.location}</p>
                                <p><strong>Budget:</strong> {job.budget}</p>
                            </div>
                            {/* FIX: Moved Task ID to a more appropriate location */}
                            <div style={styles.jobIdContainer}>
                                <span style={styles.jobId}>Task ID: {job.id}</span>
                            </div>
                            <div style={styles.stepperContainer}>
                                <JobStatusStepper currentStatus={job.status} />
                            </div>
                             <div style={styles.quoteInfo}>
                                <p><strong>Quotes Received:</strong> {job.quoteCount || 0}</p>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// --- Styles ---

const styles = {
    dashboardContainer: { fontFamily: 'Inter, sans-serif', backgroundColor: '#F7F9FA', minHeight: '100vh', padding: '40px' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px', borderBottom: '1px solid #E0E0E0', paddingBottom: '20px' },
    mainHeading: { fontFamily: 'Poppins, sans-serif', color: '#222222', margin: 0 },
    headerControls: { display: 'flex', alignItems: 'center', gap: '20px' },
    postJobButton: { fontFamily: 'Inter, sans-serif', backgroundColor: '#FF9100', color: '#FFFFFF', border: 'none', borderRadius: '8px', padding: '12px 24px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', transition: 'background-color 0.2s ease' },
    profileButton: { width: '48px', height: '48px', borderRadius: '50%', backgroundColor: '#14C5C5', color: 'white', border: '2px solid white', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '18px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' },
    profileMenu: { position: 'absolute', top: '60px', right: 0, backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 100, width: '200px', overflow: 'hidden' },
    menuItem: { display: 'block', padding: '12px 16px', color: '#222222', textDecoration: 'none', background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px' },
    centered: { textAlign: 'center', padding: '50px', fontSize: '18px', color: '#555' },
    jobList: { display: 'grid', gap: '24px', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))' },
    jobCard: { backgroundColor: '#FFFFFF', borderRadius: '12px', padding: '24px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', border: '1px solid #E0E0E0', display: 'flex', flexDirection: 'column', cursor: 'pointer', transition: 'transform 0.2s ease, box-shadow 0.2s ease' },
    jobCardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' },
    jobTitle: { fontFamily: 'Poppins, sans-serif', fontSize: '18px', color: '#222222', margin: '0', marginRight: '10px' },
    jobDetails: { fontSize: '14px', color: '#555', lineHeight: '1.6' },
    jobIdContainer: { marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #F7F9FA' },
    jobId: { fontSize: '12px', color: '#BDBDBD', whiteSpace: 'nowrap' },
    stepperContainer: { marginTop: 'auto', paddingTop: '10px' },
    quoteInfo: { marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #E0E0E0', fontSize: '14px', color: '#14C5C5', fontWeight: 'bold' }
};

export default HomeownerDashboard;
