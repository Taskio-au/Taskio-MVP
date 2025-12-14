// src/components/HomeownerAuthPage.js
import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { auth } from '../firebase';
import { 
    signInWithEmailAndPassword 
} from "firebase/auth";
import axios from 'axios';

const authPageStyle = {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh',
    backgroundColor: '#F7F9FA', // Pale Cloud
};

const authContainerStyle = {
    backgroundColor: '#FFFFFF',
    padding: '40px',
    borderRadius: '8px',
    width: '400px',
    boxShadow: '0 5px 15px rgba(0,0,0,0.1)',
    textAlign: 'center',
};

function HomeownerAuthPage() {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const navigate = useNavigate();
    const location = useLocation();
    
    // Get the job data passed from the previous page
    const { jobData } = location.state || {};

    useEffect(() => {
        // If for some reason a user lands here without job data, send them back.
        if (!jobData) {
            console.warn("No job data found, redirecting to post-job.");
            navigate('/post-job');
        }
    }, [jobData, navigate]);

    const handleAuth = async (e) => {
        e.preventDefault();
        setError('');
        try {
            let userCredential;
            if (isLogin) {
                userCredential = await signInWithEmailAndPassword(auth, email, password);
            } else {
                // The backend handles user creation
                await axios.post('http://localhost:8000/api/users/register', {
                    email,
                    password,
                    role: 'homeowner'
                });
                // After successful registration, log the user in
                userCredential = await signInWithEmailAndPassword(auth, email, password);
            }

            // After successful auth, post the job
            const token = await userCredential.user.getIdToken();
            const config = { headers: { Authorization: `Bearer ${token}` } };
            await axios.post('http://localhost:8000/api/jobs', jobData, config);

            alert('Your job has been posted successfully!');
            navigate('/dashboard'); // Or to a dedicated homeowner dashboard

        } catch (err) {
            setError("Authentication failed. Please check your credentials.");
            console.error(err);
        }
    };

    return (
        <div style={authPageStyle}>
            <div style={authContainerStyle}>
                <h1 style={{fontFamily: 'Poppins, sans-serif'}}>Almost there!</h1>
                <p>Please sign up or log in to post your job.</p>
                
                {/* Simple toggle for Login / Sign Up */}
                <div>
                    <button onClick={() => setIsLogin(true)} style={{fontWeight: isLogin ? 'bold' : 'normal'}}>Login</button> | 
                    <button onClick={() => setIsLogin(false)} style={{fontWeight: !isLogin ? 'bold' : 'normal'}}>Sign Up</button>
                </div>

                <form onSubmit={handleAuth} style={{ marginTop: '20px' }}>
                     <input
                        type="email"
                        placeholder="Email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        style={{ width: '100%', padding: '10px', marginBottom: '10px', boxSizing: 'border-box' }}
                        required
                    />
                    <input
                        type="password"
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        style={{ width: '100%', padding: '10px', marginBottom: '15px', boxSizing: 'border-box' }}
                        required
                    />
                    {error && <p style={{ color: '#DC3545', fontSize: '14px' }}>{error}</p>}
                    <button type="submit" style={{ width: '100%', padding: '12px', backgroundColor: '#FF9100', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                        {isLogin ? 'Login & Post Job' : 'Sign Up & Post Job'}
                    </button>
                </form>
            </div>
        </div>
    );
}

export default HomeownerAuthPage;
