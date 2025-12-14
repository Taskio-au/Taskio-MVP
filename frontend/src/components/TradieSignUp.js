import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

// This could be imported from a shared config file
const expertiseOptions = [
    'plumbing', 'electrical', 'cleaning', 'painting', 'gardening', 'handyman', 'carpentry', 'tiling'
];

const api = axios.create({
    baseURL: 'http://localhost:8000'
});

function TradieSignUp() {
    const [formData, setFormData] = useState({
        firstName: '',
        lastName: '',
        email: '',
        password: '',
        expertise: []
    });
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prevState => ({ ...prevState, [name]: value }));
    };

    const handleExpertiseChange = (e) => {
        const { value, checked } = e.target;
        setFormData(prevState => {
            const newExpertise = checked
                ? [...prevState.expertise, value]
                : prevState.expertise.filter(item => item !== value);
            return { ...prevState, expertise: newExpertise };
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        setLoading(true);

        if (formData.expertise.length === 0) {
            setError('Please select at least one area of expertise.');
            setLoading(false);
            return;
        }

        try {
            const payload = { ...formData, role: 'tradie' };
            await api.post('/api/users/register', payload);
            setSuccess('Registration successful! Please log in.');
            setTimeout(() => navigate('/'), 2000); // Redirect to login after 2s
        } catch (err) {
            setError(err.response?.data?.message || 'Registration failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={styles.container}>
            <div style={styles.formWrapper}>
                <h1 style={styles.title}>Become a Taskio Tradie</h1>
                <p style={styles.subtitle}>Sign up to start receiving job invitations.</p>
                <form onSubmit={handleSubmit}>
                    <div style={styles.inputGroup}>
                        <input type="text" name="firstName" placeholder="First Name" onChange={handleChange} required style={styles.input} />
                        <input type="text" name="lastName" placeholder="Last Name" onChange={handleChange} required style={styles.input} />
                    </div>
                    <input type="email" name="email" placeholder="Email Address" onChange={handleChange} required style={{...styles.input, ...styles.fullWidthInput}} />
                    <input type="password" name="password" placeholder="Password" onChange={handleChange} required style={{...styles.input, ...styles.fullWidthInput}} />

                    <h3 style={styles.expertiseTitle}>Select Your Expertise</h3>
                    <div style={styles.checkboxContainer}>
                        {expertiseOptions.map(option => (
                            <label key={option} style={styles.checkboxLabel}>
                                <input
                                    type="checkbox"
                                    value={option}
                                    checked={formData.expertise.includes(option)}
                                    onChange={handleExpertiseChange}
                                    style={styles.checkbox}
                                />
                                {option.charAt(0).toUpperCase() + option.slice(1)}
                            </label>
                        ))}
                    </div>

                    {error && <p style={styles.errorMessage}>{error}</p>}
                    {success && <p style={styles.successMessage}>{success}</p>}

                    <button type="submit" disabled={loading} style={styles.submitButton}>
                        {loading ? 'Registering...' : 'Create Account'}
                    </button>
                </form>
                 <p style={styles.loginRedirect}>
                    Already have an account? <a href="/" style={styles.loginLink}>Log In</a>
                </p>
            </div>
        </div>
    );
}

const styles = {
    container: { fontFamily: 'Inter, sans-serif', backgroundColor: '#F7F9FA', minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' },
    formWrapper: { backgroundColor: '#FFFFFF', padding: '40px', borderRadius: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', width: '100%', maxWidth: '600px' },
    title: { fontFamily: 'Poppins, sans-serif', textAlign: 'center', color: '#222222', marginBottom: '10px' },
    subtitle: { textAlign: 'center', color: '#555', marginBottom: '30px' },
    inputGroup: { display: 'flex', gap: '20px', marginBottom: '20px' },
    input: { width: '100%', padding: '12px 15px', borderRadius: '8px', border: '1px solid #E0E0E0', fontSize: '16px' },
    fullWidthInput: { marginBottom: '20px' },
    expertiseTitle: { fontFamily: 'Poppins, sans-serif', color: '#333', fontSize: '18px', borderTop: '1px solid #E0E0E0', paddingTop: '20px', marginTop: '10px', marginBottom: '15px' },
    checkboxContainer: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '10px', marginBottom: '20px' },
    checkboxLabel: { display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '8px', borderRadius: '6px', transition: 'background-color 0.2s' },
    checkbox: { width: '18px', height: '18px' },
    submitButton: { width: '100%', padding: '15px', backgroundColor: '#FF9100', color: 'white', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', transition: 'background-color 0.2s' },
    errorMessage: { color: '#DC3545', textAlign: 'center', marginTop: '15px' },
    successMessage: { color: '#52d68a', textAlign: 'center', marginTop: '15px' },
    loginRedirect: { textAlign: 'center', marginTop: '20px', fontSize: '14px' },
    loginLink: { color: '#14C5C5', textDecoration: 'none', fontWeight: 'bold' }
};

export default TradieSignUp;

