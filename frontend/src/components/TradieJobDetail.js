import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { auth } from '../firebase';
import axios from 'axios';

const api = axios.create({
    baseURL: 'http://localhost:8000'
});

function TradieJobDetail() {
    const { jobId } = useParams();
    const navigate = useNavigate();

    const [job, setJob] = useState(null);
    const [quoteData, setQuoteData] = useState({ amount: '', message: '' });
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const fetchJobDetails = useCallback(async () => {
        try {
            const user = auth.currentUser;
            if (!user) {
                navigate('/');
                return;
            }
            const token = await user.getIdToken();
            const config = { headers: { Authorization: `Bearer ${token}` } };

            // Using the new tradie-specific endpoint for security
            const response = await api.get(`/api/tradie/jobs/${jobId}`, config);
            setJob(response.data);
        } catch (err) {
            console.error("Error fetching job details:", err);
            setError(err.response?.data?.message || 'Could not load job details.');
        } finally {
            setLoading(false);
        }
    }, [jobId, navigate]);

    useEffect(() => {
        fetchJobDetails();
    }, [fetchJobDetails]);

    const handleQuoteChange = (e) => {
        const { name, value } = e.target;
        setQuoteData(prevState => ({ ...prevState, [name]: value }));
    };

    const handleQuoteSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        if (!quoteData.amount || isNaN(quoteData.amount) || quoteData.amount <= 0) {
            setError('Please enter a valid quote amount.');
            return;
        }
        if (!quoteData.message.trim()) {
            setError('Please include a message with your quote.');
            return;
        }

        setSubmitting(true);
        try {
            const user = auth.currentUser;
            const token = await user.getIdToken();
            const config = { headers: { Authorization: `Bearer ${token}` } };
            const payload = {
                amount: parseFloat(quoteData.amount),
                message: quoteData.message
            };
            
            // Using the existing endpoint to post a quote
            await api.post(`/api/jobs/${jobId}/quotes`, payload, config);
            setSuccess('Your quote has been submitted successfully! The homeowner will be notified.');
            setQuoteData({ amount: '', message: '' }); // Clear form
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to submit quote. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };
    
    if (loading) {
        return <div style={styles.centered}>Loading job details...</div>;
    }

    if (error && !job) {
        return <div style={{...styles.centered, color: '#DC3545'}}>{error}</div>;
    }

    return (
        <div style={styles.container}>
             <nav style={styles.breadcrumb}>
                <Link to="/tradie/dashboard" style={styles.breadcrumbLink}>Dashboard</Link>
                <span>/</span>
                <span>Job Details</span>
            </nav>
            <div style={styles.contentWrapper}>
                {/* Job Details Section */}
                <div style={styles.jobDetailsCard}>
                    <h1 style={styles.jobTitle}>{job.title}</h1>
                    <p style={styles.jobId}>Task ID: {job.id}</p>
                    <hr style={styles.divider} />
                    <h2 style={styles.sectionTitle}>Description</h2>
                    <p style={styles.jobText}>{job.description}</p>
                    
                    <h2 style={styles.sectionTitle}>Key Information</h2>
                    <div style={styles.infoGrid}>
                        <div><strong>Location:</strong> {job.location}</div>
                        <div><strong>Timeline:</strong> {job.timeline}</div>
                        <div><strong>Budget Guide:</strong> {job.budget}</div>
                        <div><strong>Posted:</strong> {new Date(job.createdAt._seconds * 1000).toLocaleDateString('en-AU')}</div>
                    </div>
                </div>

                {/* Quote Submission Section */}
                <div style={styles.quoteCard}>
                    <h2 style={styles.sectionTitle}>Submit Your Quote</h2>
                    {success ? (
                        <div style={styles.successMessage}>{success}</div>
                    ) : (
                        <form onSubmit={handleQuoteSubmit}>
                            <label htmlFor="amount" style={styles.label}>Your Quote Amount ($)</label>
                            <input
                                id="amount"
                                name="amount"
                                type="number"
                                placeholder="e.g., 450.00"
                                value={quoteData.amount}
                                onChange={handleQuoteChange}
                                required
                                style={styles.input}
                            />
                            
                            <label htmlFor="message" style={styles.label}>Message to Homeowner</label>
                            <textarea
                                id="message"
                                name="message"
                                placeholder="Explain what your quote includes, your availability, etc."
                                value={quoteData.message}
                                onChange={handleQuoteChange}
                                required
                                rows="5"
                                style={styles.textarea}
                            ></textarea>

                            {error && <p style={styles.errorMessage}>{error}</p>}
                            
                            <button type="submit" disabled={submitting} style={styles.submitButton}>
                                {submitting ? 'Submitting...' : 'Submit Quote'}
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}

const styles = {
    container: { fontFamily: 'Inter, sans-serif', backgroundColor: '#F7F9FA', minHeight: '100vh', padding: '40px' },
    centered: { textAlign: 'center', padding: '50px', fontSize: '18px', color: '#555' },
    breadcrumb: { marginBottom: '20px', fontSize: '14px', color: '#555' },
    breadcrumbLink: { color: '#14C5C5', textDecoration: 'none', marginRight: '8px' },
    contentWrapper: { display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '30px', alignItems: 'flex-start' },
    jobDetailsCard: { backgroundColor: '#FFFFFF', padding: '30px', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', border: '1px solid #E0E0E0' },
    quoteCard: { backgroundColor: '#FFFFFF', padding: '30px', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', border: '1px solid #E0E0E0' },
    jobTitle: { fontFamily: 'Poppins, sans-serif', fontSize: '28px', color: '#222222', margin: '0 0 5px 0' },
    jobId: { fontSize: '12px', color: '#BDBDBD', marginBottom: '20px', display: 'block' },
    sectionTitle: { fontFamily: 'Poppins, sans-serif', fontSize: '20px', color: '#333', marginBottom: '15px', borderBottom: '1px solid #F0F0F0', paddingBottom: '10px' },
    jobText: { fontSize: '16px', lineHeight: '1.7', color: '#555' },
    divider: { border: 'none', borderTop: '1px solid #E0E0E0', margin: '20px 0' },
    infoGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', fontSize: '15px', color: '#444' },
    label: { display: 'block', marginBottom: '8px', fontWeight: 'bold', fontSize: '14px', color: '#333' },
    input: { width: '100%', padding: '12px 15px', borderRadius: '8px', border: '1px solid #E0E0E0', fontSize: '16px', marginBottom: '20px' },
    textarea: { width: '100%', padding: '12px 15px', borderRadius: '8px', border: '1px solid #E0E0E0', fontSize: '16px', marginBottom: '20px', resize: 'vertical' },
    submitButton: { width: '100%', padding: '15px', backgroundColor: '#FF9100', color: 'white', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', transition: 'background-color 0.2s' },
    errorMessage: { color: '#DC3545', textAlign: 'center', marginTop: '15px', fontSize: '14px' },
    successMessage: { color: '#28A745', textAlign: 'center', marginTop: '15px', fontSize: '15px', fontWeight: 'bold', lineHeight: '1.6' },
};

export default TradieJobDetail;

