// src/Login.js
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from './firebase'; // Make sure this path is correct
import './App.css'; // Assuming you have some basic styles here

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(''); // State to hold error messages
  const navigate = useNavigate();

  const handleLogin = (e) => {
    e.preventDefault(); // Prevent form from refreshing the page
    setError(''); // Clear previous errors

    if (!email || !password) {
        setError("Please enter both email and password.");
        return;
    }

    signInWithEmailAndPassword(auth, email, password)
      .then((userCredential) => {
        const user = userCredential.user;
        // Force a refresh of the ID token to get the latest claims.
        return user.getIdTokenResult(true); 
      })
      .then((idTokenResult) => {
        const claims = idTokenResult.claims;

        // --- FIX: Role-based redirection logic ---
        if (claims.admin) {
          console.log("Admin user confirmed. Navigating to admin dashboard...");
          navigate('/admin/dashboard'); 
        } else if (claims.role === 'homeowner') {
          console.log("Homeowner user confirmed. Navigating to dashboard...");
          navigate('/dashboard');
        } else if (claims.role === 'tradie') {
          console.log("Tradie user confirmed. Navigating to tradie dashboard...");
          // Note: You will need to create this route and component later.
          navigate('/tradie/dashboard'); 
        } else {
          // This case handles users who might not have a role assigned.
          setError("Access Denied: Your account does not have a valid role.");
          auth.signOut();
        }
      })
      .catch((err) => {
        console.error("Login failed:", err);
        if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') {
            setError("Login Failed: Invalid email or password.");
        } else {
            setError("An unexpected error occurred. Please try again.");
        }
      });
  };

  return (
    <div className="App">
      <header className="App-header">
        {/* --- Changed to be more generic --- */}
        <h1>Taskio Login</h1>
        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <input 
            type="email" 
            placeholder="Email" 
            value={email} 
            onChange={(e) => setEmail(e.target.value)}
            style={{ padding: '10px', borderRadius: '5px', border: '1px solid #ccc' }}
          />
          <input 
            type="password" 
            placeholder="Password" 
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ padding: '10px', borderRadius: '5px', border: '1px solid #ccc' }}
          />
          {error && <p style={{ color: '#DC3545', fontSize: '14px', margin: '0' }}>{error}</p>}
          <button type="submit" className="button-primary">Login</button>
        </form>
      </header>
    </div>
  );
}

export default Login;
