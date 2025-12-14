// src/components/HomeownerJobDetail.js
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { auth } from '../firebase';
import axios from 'axios';

const api = axios.create({
    baseURL: process.env.REACT_APP_API_BASE_URL || 'http://localhost:8000'
});

function HomeownerJobDetail() {
    const { jobId } = useParams();
    const navigate = useNavigate();
    const [job, setJob] = useState(null);
    const [quotes, setQuotes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchData = async () => {
            const user = auth.currentUser;
            if (!user) {
                navigate('/login');
                return;
            }

            try {
                setLoading(true);
                setError('');
                const token = await user.getIdToken();
                const config = { headers: { Authorization: `Bearer ${token}` } };

                const [jobResponse, quotesResponse] = await Promise.all([
                    api.get(`/api/jobs/${jobId}`, config),
                    api.get(`/api/jobs/${jobId}/quotes`, config)
                ]);

                setJob(jobResponse.data);
                setQuotes(quotesResponse.data);

            } catch (err) {
                console.error("Error fetching job details:", err);
                setError('Could not load job details. You may not have permission or the job does not exist.');
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [jobId, navigate]);

    // --- UPDATED FUNCTION ---
    const handleAcceptQuote = (quoteId) => {
        // Navigate to the dedicated payment page
        console.log(`Navigating to payment for job ${jobId} and quote ${quoteId}`);
        navigate(`/payment/${jobId}/${quoteId}`);
    };

    if (loading) {
        return <div style={styles.centered}>Loading job details...</div>;
    }

    if (error) {
        return <div style={{...styles.centered, color: '#DC3545'}}>{error}</div>;
    }

    if (!job) {
        return <div style={styles.centered}>Job not found.</div>;
    }

    return (
        <div style={styles.pageContainer}>
            <button onClick={() => navigate('/dashboard')} style={styles.backButton}>&larr; Back to Dashboard</button>
            <div style={styles.jobHeader}>
                <h1 style={styles.jobTitle}>{job.title}</h1>
                <span style={styles.statusTag}>Status: {job.status}</span>
            </div>
            <div style={styles.jobInfoCard}>
                <p><strong>Description:</strong> {job.description}</p>
                <p><strong>Location:</strong> {job.location}</p>
                <p><strong>Budget:</strong> {job.budget}</p>
                <p><strong>Timeline:</strong> {job.timeline}</p>
            </div>

            <h2 style={styles.quotesHeader}>Received Quotes</h2>
            {quotes.length > 0 ? (
                <div style={styles.quotesGrid}>
                    {quotes.map(quote => (
                        <div key={quote.id} style={styles.quoteCard}>
                            <div style={styles.quoteAmount}>${quote.amount}</div>
                            <p style={styles.quoteMessage}>{quote.message}</p>
                            <small style={styles.quoteMeta}>From Tradie: {quote.tradieUid.substring(0, 8)}...</small>
                            <button 
                                onClick={() => handleAcceptQuote(quote.id)} 
                                style={styles.acceptButton}
                                // Disable button if a quote has already been accepted
                                disabled={job.status !== 'open' && job.status !== 'assigned'}
                            >
                                {job.status === 'open' || job.status === 'assigned' ? 'Accept Quote & Fund Escrow' : `Quote Accepted`}
                            </button>
                        </div>
                    ))}
                </div>
            ) : (
                <p>You have not received any quotes for this job yet.</p>
            )}
        </div>
    );
}

const styles = {
    pageContainer: { fontFamily: 'Inter, sans-serif', backgroundColor: '#F7F9FA', minHeight: '100vh', padding: '40px' },
    centered: { textAlign: 'center', padding: '50px', fontSize: '18px', color: '#555' },
    backButton: { background: 'none', border: 'none', color: '#14C5C5', fontSize: '16px', cursor: 'pointer', marginBottom: '20px' },
    jobHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #E0E0E0', paddingBottom: '15px', marginBottom: '20px' },
    jobTitle: { fontFamily: 'Poppins, sans-serif', margin: 0 },
    statusTag: { backgroundColor: '#E0E0E0', color: '#222222', padding: '5px 10px', borderRadius: '12px', fontSize: '14px' },
    jobInfoCard: { backgroundColor: '#FFFFFF', borderRadius: '12px', padding: '24px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', marginBottom: '40px', lineHeight: '1.6' },
    quotesHeader: { fontFamily: 'Poppins, sans-serif' },
    quotesGrid: { display: 'grid', gap: '24px', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' },
    quoteCard: { backgroundColor: '#FFFFFF', borderRadius: '12px', padding: '20px', border: '1px solid #E0E0E0', display: 'flex', flexDirection: 'column' },
    quoteAmount: { fontFamily: 'Poppins, sans-serif', fontSize: '24px', fontWeight: 'bold', color: '#14C5C5', marginBottom: '10px' },
    quoteMessage: { flexGrow: 1, marginBottom: '20px' },
    quoteMeta: { fontSize: '12px', color: '#BDBDBD', marginBottom: '15px' },
    acceptButton: { backgroundColor: '#FF9100', color: '#FFFFFF', border: 'none', borderRadius: '8px', padding: '12px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer' },
};

export default HomeownerJobDetail;
