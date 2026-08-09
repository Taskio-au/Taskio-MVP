// src/components/AuthModal.js
import React, { useState } from 'react';
import { auth } from '../firebase';
import {
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  FacebookAuthProvider,
  sendEmailVerification,
  updateProfile,
} from 'firebase/auth';
import { createApiClient } from '../api/createApiClient';
import LegalNotice from './LegalNotice';

const api = createApiClient();

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
  borderBottom: '2px solid #14C5C5',
  fontWeight: 'bold',
};

function AuthModal({ onClose, onAuthSuccess }) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [acceptedLegal, setAcceptedLegal] = useState(false);

  const handleAuth = async (e) => {
    e.preventDefault();
    setError('');
    try {
      setBusy(true);
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        if (!acceptedLegal) {
          setError('Please accept the Terms of Use and Privacy Policy to continue.');
          return;
        }
        await api.post('/api/users/register', {
          email,
          password,
          role: 'homeowner',
          firstName: '',
          lastName: '',
        });
        const cred = await signInWithEmailAndPassword(auth, email, password);
        try {
          const fallbackName = String(email || '').split('@')[0] || '';
          if (cred?.user && fallbackName && !cred.user.displayName) {
            await updateProfile(cred.user, { displayName: fallbackName });
          }
        } catch (err) {
          // non-blocking
        }
        try {
          if (cred?.user && cred.user.emailVerified === false) {
            await sendEmailVerification(cred.user);
          }
        } catch (err) {
          // non-blocking
        }
      }
      onAuthSuccess();
    } catch (err) {
      setError('Authentication failed. Please check your credentials or try a different email.');
      // eslint-disable-next-line no-console
      console.error(err);
    } finally {
      setBusy(false);
    }
  };

  const handleProvider = async (providerName) => {
    setError('');
    try {
      setBusy(true);
      let provider;
      if (providerName === 'google') provider = new GoogleAuthProvider();
      if (providerName === 'facebook') provider = new FacebookAuthProvider();
      if (!provider) return;

      await signInWithPopup(auth, provider);
      onAuthSuccess();
    } catch (err) {
      const code = err?.code || '';
      if (code === 'auth/popup-blocked') setError('Your browser blocked the sign-in popup. Please allow popups and try again.');
      else if (code === 'auth/unauthorized-domain') setError('This domain is not authorized for Firebase Auth. Add localhost in Firebase Console > Authentication > Settings > Authorized domains.');
      else if (code === 'auth/operation-not-allowed') setError('This sign-in method is not enabled yet. Enable it in Firebase Console > Authentication > Sign-in method.');
      else if (code === 'auth/account-exists-with-different-credential') setError('An account already exists with this email. Please log in using your original method.');
      else setError(`Could not sign in with that provider. Please try email instead.${code ? ` (code: ${code})` : ''}`);
      // eslint-disable-next-line no-console
      console.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={modalStyle} onClick={onClose}>
      <div style={modalContentStyle} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontFamily: 'Poppins, sans-serif', marginTop: 0, marginBottom: '8px' }}>Sign in to post</h2>
        <p style={{ marginTop: 0, color: '#666', fontSize: '14px' }}>
          You&apos;ll only be charged if you accept a quote. This just helps us keep tasks genuine.
        </p>
        <LegalNotice compact style={{ marginTop: 10 }} />

        <div style={{ display: 'grid', gap: '10px', marginTop: '16px', marginBottom: '18px' }}>
          <button
            type="button"
            onClick={() => handleProvider('google')}
            disabled={busy}
            style={{ backgroundColor: '#FFFFFF', color: '#222', border: '1px solid #E0E0E0', borderRadius: '8px', padding: '12px 14px', cursor: busy ? 'not-allowed' : 'pointer', marginTop: 0 }}
          >
            Continue with Google
          </button>
          <button
            type="button"
            onClick={() => handleProvider('facebook')}
            disabled={busy}
            style={{ backgroundColor: '#1877F2', color: '#FFFFFF', border: 'none', borderRadius: '8px', padding: '12px 14px', cursor: busy ? 'not-allowed' : 'pointer', marginTop: 0 }}
          >
            Continue with Facebook
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '18px 0' }}>
          <div style={{ height: '1px', backgroundColor: '#E0E0E0', flex: 1 }} />
          <div style={{ fontSize: '12px', color: '#888' }}>or</div>
          <div style={{ height: '1px', backgroundColor: '#E0E0E0', flex: 1 }} />
        </div>

        <div style={{ display: 'flex', borderBottom: '1px solid #E0E0E0' }}>
          <button type="button" onClick={() => setIsLogin(true)} style={{ ...(isLogin ? activeTabStyle : tabStyle), marginTop: 0, color: '#222' }}>Login</button>
          <button type="button" onClick={() => setIsLogin(false)} style={{ ...(!isLogin ? activeTabStyle : tabStyle), marginTop: 0, color: '#222' }}>Sign Up</button>
        </div>
        <form onSubmit={handleAuth} style={{ marginTop: '20px' }}>
          <h3 style={{ fontFamily: 'Poppins, sans-serif', marginBottom: '6px' }}>{isLogin ? 'Login with email' : 'Sign up with email'}</h3>
          <p style={{ marginTop: 0, color: '#666', fontSize: '14px' }}>
            {isLogin ? 'Use the email you registered with.' : 'Free to post. No obligation.'}
          </p>
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
          {!isLogin && (
            <LegalNotice
              requireAcceptance
              checked={acceptedLegal}
              onChange={setAcceptedLegal}
              compact
              style={{ marginBottom: 15 }}
            />
          )}
          {error && <p style={{ color: '#DC3545', fontSize: '14px' }}>{error}</p>}
          <button type="submit" disabled={busy} style={{ width: '100%', padding: '12px', backgroundColor: '#FF9100', color: 'white', border: 'none', borderRadius: '8px', cursor: busy ? 'not-allowed' : 'pointer', marginTop: 0, opacity: busy ? 0.7 : 1 }}>
            {busy ? 'Please wait...' : (isLogin ? 'Login & Continue' : 'Sign Up & Continue')}
          </button>
        </form>
      </div>
    </div>
  );
}

export default AuthModal;
