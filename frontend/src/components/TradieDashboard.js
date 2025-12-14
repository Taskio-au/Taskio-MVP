import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../firebase';
import axios from 'axios';

const api = axios.create({
    baseURL: process.env.REACT_APP_API_BASE_URL || 'http://localhost:8000'
});

function TradieDashboard() {
    const [jobs, setJobs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const navigate = useNavigate();
    const user = auth.currentUser;

    useEffect(() => {
        const fetchInvitedJobs = async () => {
            if (!user) {
                navigate('/');
                return;
            }
            try {
                const token = await user.getIdToken();
                const config = { headers: { Authorization: `Bearer ${token}` } };
                const response = await api.get('/api/tradie/jobs', config);
                setJobs(response.data);
            } catch (err) {
                console.error("Error fetching tradie's jobs:", err);
                setError('Could not load job invitations. Please try again later.');
            } finally {
                setLoading(false);
            }
        };

        fetchInvitedJobs();
    }, [user, navigate]);
    
    const formatDate = (timestamp) => {
        if (!timestamp || !timestamp._seconds) return 'N/A';
        return new Date(timestamp._seconds * 1000).toLocaleDateString('en-AU', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
        });
    };

    if (loading) {
        return <div style={styles.centered}>Loading your job invitations...</div>;
    }

    if (error) {
        return <div style={{...styles.centered, color: '#DC3545'}}>{error}</div>;
    }

    return (
        <div style={styles.dashboardContainer}>
            <header style={styles.header}>
                <h1 style={styles.mainHeading}>Job Invitations</h1>
                <button onClick={() => auth.signOut().then(() => navigate('/'))} style={styles.logoutButton}>
                    Logout
                </button>
            </header>

            {jobs.length === 0 ? (
                <div style={styles.centered}>
                    <p>You have no new job invitations at the moment.</p>
                    <p style={{fontSize: '14px', color: '#666'}}>An administrator will invite you when a suitable job is posted.</p>
                </div>
            ) : (
                <div style={styles.jobList}>
                    {jobs.map(job => (
                        <div key={job.id} style={styles.jobCard} onClick={() => navigate(`/tradie/job/${job.id}`)}>
                            <div style={styles.jobCardHeader}>
                                <h2 style={styles.jobTitle}>{job.title}</h2>
                                <span style={styles.date}>Posted: {formatDate(job.createdAt)}</span>
                            </div>
                            <p style={styles.description}>{job.description.substring(0, 120)}...</p>
                            <div style={styles.jobDetails}>
                                <span><strong>Location:</strong> {job.location}</span>
                                <span><strong>Budget:</strong> {job.budget}</span>
                            </div>
                             <div style={styles.viewJobPrompt}>
                                View Details & Submit Quote →
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

const styles = {
    dashboardContainer: { fontFamily: 'Inter, sans-serif', backgroundColor: '#F7F9FA', minHeight: '100vh', padding: '40px' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px', borderBottom: '1px solid #E0E0E0', paddingBottom: '20px' },
    mainHeading: { fontFamily: 'Poppins, sans-serif', color: '#222222', margin: 0 },
    logoutButton: { fontFamily: 'Inter, sans-serif', backgroundColor: '#FF9100', color: '#FFFFFF', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '15px', fontWeight: 'bold', cursor: 'pointer' },
    centered: { textAlign: 'center', padding: '50px', fontSize: '18px', color: '#555' },
    jobList: { display: 'grid', gap: '24px', gridTemplateColumns: '1fr' },
    jobCard: { backgroundColor: '#FFFFFF', borderRadius: '12px', padding: '24px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', border: '1px solid #E0E0E0', cursor: 'pointer', transition: 'transform 0.2s ease, box-shadow 0.2s ease' },
    jobCardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' },
    jobTitle: { fontFamily: 'Poppins, sans-serif', fontSize: '18px', color: '#222222', margin: '0', },
    date: { fontSize: '12px', color: '#666', whiteSpace: 'nowrap', marginLeft: '15px' },
    description: { fontSize: '14px', color: '#555', lineHeight: '1.6', margin: '0 0 16px 0' },
    jobDetails: { display: 'flex', gap: '20px', fontSize: '14px', color: '#333', padding: '16px 0', borderTop: '1px solid #F0F0F0', borderBottom: '1px solid #F0F0F0' },
    viewJobPrompt: { marginTop: '16px', textAlign: 'right', color: '#14C5C5', fontWeight: 'bold' }
};

export default TradieDashboard;
