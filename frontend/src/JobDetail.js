import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import { auth } from './firebase';
import { useAuthState } from 'react-firebase-hooks/auth';
import StatusTag from './StatusTag';
import VerificationBadge from './VerificationBadge';

const api = axios.create({
    baseURL: 'http://localhost:8000'
});

const expertiseOptions = [
    'all', 'plumbing', 'electrical', 'cleaning', 'painting', 'gardening', 'handyman', 'carpentry', 'tiling'
];

function JobDetail() {
    const { jobId } = useParams();
    const [user, authLoading, authError] = useAuthState(auth);
    const [job, setJob] = useState(null);
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [assigning, setAssigning] = useState(false);
    const [unassigning, setUnassigning] = useState(null);
    const [expertiseFilter, setExpertiseFilter] = useState('all');

    const fetchData = useCallback(async () => {
        if (!user) {
            return;
        }
        setLoading(true);
        try {
            const token = await user.getIdToken();
            const config = { headers: { Authorization: `Bearer ${token}` } };

            const [jobResponse, usersResponse] = await Promise.all([
                api.get(`/api/jobs/${jobId}`, config),
                api.get('/api/admin/users', config)
            ]);

            setJob(jobResponse.data);
            setUsers(usersResponse.data);
            setError('');
        } catch (err) {
            setError('Failed to fetch data.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [jobId, user]);

    useEffect(() => {
        if (!authLoading) {
            fetchData();
        }
    }, [authLoading, fetchData]);
    
    const handleAssign = async (tradieUid) => {
        setAssigning(true);
        try {
            const token = await auth.currentUser.getIdToken();
            const config = { headers: { Authorization: `Bearer ${token}` } };
            await api.post(`/api/admin/jobs/${jobId}/assign`, { tradieUid }, config);
            fetchData();
        } catch (err) {
            alert('Failed to assign tradie.');
            console.error(err);
        } finally {
            setAssigning(false);
        }
    };

    const handleUnassign = async (tradieUid) => {
        setUnassigning(tradieUid);
        try {
            const token = await auth.currentUser.getIdToken();
            const config = { headers: { Authorization: `Bearer ${token}` } };
            await api.delete(`/api/admin/jobs/${jobId}/assign/${tradieUid}`, config);
            fetchData();
        } catch (err) {
            alert('Failed to unassign tradie.');
            console.error(err);
        } finally {
            setUnassigning(null);
        }
    };
    
    if (authLoading || loading) return <div style={styles.centered}>Loading job details...</div>;
    if (authError) return <div style={styles.centered}>Authentication Error: {authError.message}</div>;
    if (error) return <div style={styles.centered}>Error: {error}</div>;
    if (!job) return <div style={styles.centered}>Job not found.</div>;

    const allTradies = users.filter(u => u.role === 'tradie');
    
    const availableTradies = allTradies.filter(
        t => !(job.invitedTradieUids || []).includes(t.uid) && t.verified
    );

    const filteredAvailableTradies = expertiseFilter === 'all'
        ? availableTradies
        : availableTradies.filter(t => t.expertise && t.expertise.includes(expertiseFilter));

    const invitedTradies = allTradies.filter(
        t => (job.invitedTradieUids || []).includes(t.uid)
    );

    return (
        <div style={styles.container}>
             <nav style={styles.breadcrumb}>
                <Link to="/admin/dashboard" style={styles.breadcrumbLink}>Dashboard</Link>
                <span>/</span>
                <span>Job Details</span>
            </nav>

            <div style={styles.mainContent}>
                <div style={styles.card}>
                    <div style={styles.cardHeader}>
                         <h1 style={styles.jobTitle}>{job.title}</h1>
                         <StatusTag status={job.status} />
                    </div>
                    <p><strong>Description:</strong> {job.description}</p>
                    <p><strong>Location:</strong> {job.location}</p>
                    <p><strong>Budget:</strong> {job.budget}</p>
                    <p><strong>Homeowner ID:</strong> {job.homeownerUid}</p>
                </div>

                <div style={styles.card}>
                    <h2 style={styles.sectionTitle}>Invited Tradies ({invitedTradies.length})</h2>
                    {invitedTradies.length > 0 ? (
                        <ul style={styles.list}>
                            {invitedTradies.map(t => (
                                <li key={t.uid} style={styles.listItem}>
                                    <span>{t.email}</span>
                                    <button 
                                      onClick={() => handleUnassign(t.uid)} 
                                      disabled={unassigning === t.uid}
                                      style={styles.unassignButton}
                                    >
                                        {unassigning === t.uid ? 'Removing...' : 'Unassign'}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    ) : <p>No tradies have been invited to this job yet.</p>}
                </div>

                <div style={styles.card}>
                    <div style={styles.cardHeader}>
                        <h2 style={styles.sectionTitle}>Assign a Verified Tradie</h2>
                        <select 
                            value={expertiseFilter} 
                            onChange={(e) => setExpertiseFilter(e.target.value)}
                            style={styles.filterSelect}
                        >
                             {expertiseOptions.map(opt => <option key={opt} value={opt}>{opt.charAt(0).toUpperCase() + opt.slice(1)}</option>)}
                        </select>
                    </div>
                    {filteredAvailableTradies.length > 0 ? (
                         <ul style={styles.list}>
                            {filteredAvailableTradies.map(t => (
                                <li key={t.uid} style={styles.listItem}>
                                    <div>
                                        <span>{t.email}</span>
                                        <VerificationBadge verified={t.verified} />
                                    </div>
                                    <button 
                                      onClick={() => handleAssign(t.uid)}
                                      disabled={assigning}
                                      style={styles.assignButton}
                                    >
                                        {assigning ? 'Assigning...' : 'Assign'}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    ) : <p>No available tradies match the criteria. Ensure they are verified and not already invited.</p>}
                </div>
            </div>
        </div>
    );
}

const styles = {
    container: { fontFamily: 'Inter, sans-serif', padding: '20px', backgroundColor: '#F7F9FA' },
    breadcrumb: { marginBottom: '20px', fontSize: '14px', color: '#555' },
    breadcrumbLink: { color: '#14C5C5', textDecoration: 'none', marginRight: '8px' },
    mainContent: { display: 'grid', gap: '20px' },
    card: { backgroundColor: '#FFFFFF', borderRadius: '8px', padding: '20px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' },
    cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', borderBottom: '1px solid #E0E0E0', paddingBottom: '10px' },
    jobTitle: { fontFamily: 'Poppins, sans-serif', margin: 0, fontSize: '24px' },
    sectionTitle: { fontFamily: 'Poppins, sans-serif', margin: 0, fontSize: '18px' },
    filterSelect: { padding: '5px 10px', borderRadius: '4px', border: '1px solid #ccc' },
    list: { listStyle: 'none', padding: 0, margin: 0 },
    listItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #F0F0F0' },
    assignButton: { backgroundColor: '#52d68a', color: 'white', border: 'none', padding: '8px 12px', borderRadius: '4px', cursor: 'pointer' },
    unassignButton: { backgroundColor: '#DC3545', color: 'white', border: 'none', padding: '8px 12px', borderRadius: '4px', cursor: 'pointer' },
    centered: { textAlign: 'center', padding: '50px', fontSize: '18px', color: '#555' }
};

export default JobDetail;

