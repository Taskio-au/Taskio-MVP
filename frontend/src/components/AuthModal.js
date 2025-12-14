// src/components/AuthModal.js
import React, { useState } from 'react';
import { auth } from '../firebase';
import { 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword 
} from "firebase/auth";
import axios from 'axios'; // Import axios

const modalStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
};

const modalContentStyle = {
    backgroundColor: '#FFFFFF',
    padding: '30px',
    borderRadius: '8px',
    width: '400px',
    boxShadow: '0 5px 15px rgba(0,0,0,0.3)',
};

const tabStyle = {
    padding: '10px 15px',
    cursor: 'pointer',
    border: 'none',
    backgroundColor: 'transparent',
    borderBottom: '2px solid transparent',
    fontSize: '16px',
};

const activeTabStyle = {
    ...tabStyle,
    borderBottom: '2px solid #14C5C5', // Taskio Teal
    fontWeight: 'bold',
};

function AuthModal({ onClose, onAuthSuccess }) {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleAuth = async (e) => {
        e.preventDefault();
        setError('');
        try {
            if (isLogin) {
                // Handle Login
                await signInWithEmailAndPassword(auth, email, password);
            } else {
                // Handle Sign Up
                // This now correctly calls your backend to create the user in Firestore
                // after creating them in Firebase Auth.
                await axios.post('http://localhost:8000/api/users/register', {
                    email: email,
                    password: password,
                    role: 'homeowner' // Set default role for users signing up this way
                });
                // After successful registration, we need to sign them in to continue
                await signInWithEmailAndPassword(auth, email, password);
            }
            console.log("Authentication successful.");
            onAuthSuccess(); // This will re-trigger the job submission
        } catch (err) {
            setError("Authentication failed. Please check your credentials or try a different email.");
            console.error(err);
        }
    };

    return (
        <div style={modalStyle} onClick={onClose}>
            <div style={modalContentStyle} onClick={(e) => e.stopPropagation()}>
                <div style={{ display: 'flex', borderBottom: '1px solid #E0E0E0' }}>
                    <button onClick={() => setIsLogin(true)} style={isLogin ? activeTabStyle : tabStyle}>Login</button>
                    <button onClick={() => setIsLogin(false)} style={!isLogin ? activeTabStyle : tabStyle}>Sign Up</button>
                </div>
                <form onSubmit={handleAuth} style={{ marginTop: '20px' }}>
                    <h2 style={{ fontFamily: 'Poppins, sans-serif' }}>{isLogin ? 'Welcome Back' : 'Create an Account'}</h2>
                    <p>{isLogin ? 'Please login to continue.' : 'Sign up to post your job.'}</p>
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
                        {isLogin ? 'Login' : 'Sign Up & Continue'}
                    </button>
                </form>
            </div>
        </div>
    );
}

export default AuthModal;
