// src/components/HomeownerAuthPage.js
import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { auth, googleProvider, facebookProvider } from '../firebase';
import { 
    signInWithEmailAndPassword,
    signInWithPopup,
    sendEmailVerification,
    updateProfile
} from "firebase/auth";
import { createApiClient } from '../api/createApiClient';
import { upsertUserProfileFromAuth } from '../utils/upsertUserProfileFromAuth';
import { BrandLogo, Button } from '../design/components';
import LegalNotice from './LegalNotice';

const api = createApiClient();

const authPageStyle = {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    background: 'linear-gradient(180deg, #F7F9FA 0%, #FFFFFF 100%)',
    padding: '24px 16px',
};

const authContainerStyle = {
    backgroundColor: '#FFFFFF',
    padding: '32px',
    borderRadius: '16px',
    width: '100%',
    maxWidth: '460px',
    boxShadow: '0 20px 50px rgba(15, 23, 42, 0.08)',
    border: '1px solid #E5E7EB',
    textAlign: 'left',
};

const fieldStyle = {
    width: '100%',
    padding: '12px 14px',
    marginBottom: '12px',
    boxSizing: 'border-box',
    border: '1px solid #D1D5DB',
    borderRadius: '12px',
    backgroundColor: '#FFFFFF',
    fontSize: '14px',
};

const providerButtonStyle = {
    width: '100%',
    justifyContent: 'center',
    minHeight: 46,
    borderRadius: 12,
};

function ClientAuthPage() {
    const [isLogin, setIsLogin] = useState(true);
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [verifyInfo, setVerifyInfo] = useState('');
    const [acceptedLegal, setAcceptedLegal] = useState(false);
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

    const postJob = async (user) => {
        const token = await user.getIdToken();
        const config = { headers: { Authorization: `Bearer ${token}` } };
        await api.post('/api/jobs', jobData, config);
        navigate('/dashboard', { state: { successMessage: 'Task posted successfully!' } });
    };

    const friendlyAuthError = (err) => {
        const code = err?.code || '';
        const responseCode = err?.response?.data?.code || '';
        if (code === 'auth/popup-closed-by-user') return 'Sign-in was cancelled.';
        if (code === 'auth/popup-blocked') return 'Your browser blocked the sign-in popup. Please allow popups and try again.';
        if (code === 'auth/unauthorized-domain') return 'This domain isn’t authorised for Firebase Auth. Add `localhost` in Firebase Console → Authentication → Settings → Authorised domains.';
        if (code === 'auth/operation-not-allowed') return 'This sign-in method isn’t enabled yet. Enable it in Firebase Console → Authentication → Sign-in method.';
        if (code === 'auth/account-exists-with-different-credential') {
            return 'An account already exists with this email. Please log in using your original method.';
        }
        if (responseCode === 'auth/email-already-exists' || /already exists|already registered|already in use/i.test(err?.response?.data?.message || '')) {
            return 'This email is already registered. Please log in or use a different email.';
        }
        return 'Authentication failed. Please check your details and try again.';
    };

    const handleProviderLogin = async (providerName) => {
        setError('');
        setBusy(true);
        try {
            const provider =
                providerName === 'google' ? googleProvider :
                providerName === 'facebook' ? facebookProvider :
                null;
            if (!provider) return;

            // Note: Apple/Facebook require enabling in Firebase Console. No secrets in frontend.
            const cred = await signInWithPopup(auth, provider);
            await upsertUserProfileFromAuth(cred.user, providerName);
            await postJob(cred.user);
        } catch (err) {
            setError(friendlyAuthError(err));
            // eslint-disable-next-line no-console
            console.error(err);
        } finally {
            setBusy(false);
        }
    };

    const handleAuth = async (e) => {
        e.preventDefault();
        setError('');
        setVerifyInfo('');
        setBusy(true);
        try {
            let userCredential;
            if (isLogin) {
                userCredential = await signInWithEmailAndPassword(auth, email, password);
            } else {
                if (!acceptedLegal) {
                    setError('Please accept the Terms of Use and Privacy Policy to continue.');
                    return;
                }
                // The backend handles user creation
                await api.post('/api/users/register', {
                    email,
                    password,
                    role: 'homeowner',
                    firstName,
                    lastName,
                });
                // After successful registration, log the user in
                userCredential = await signInWithEmailAndPassword(auth, email, password);
                // Ensure displayName is set for email templates (%DISPLAY_NAME%)
                try {
                    const fullName = `${firstName} ${lastName}`.trim();
                    if (userCredential?.user && fullName && !userCredential.user.displayName) {
                        await updateProfile(userCredential.user, { displayName: fullName });
                    }
                } catch (e) {
                    // non-blocking
                }
                // Trigger verification email for password signups
                try {
                    if (userCredential?.user && userCredential.user.emailVerified === false) {
                        await sendEmailVerification(userCredential.user);
                        setVerifyInfo('We’ve sent a verification email. Please check your inbox.');
                    }
                } catch (e) {
                    // non-blocking
                }
            }

            await upsertUserProfileFromAuth(userCredential.user, 'password', {
                email,
                firstName: isLogin ? '' : firstName,
                lastName: isLogin ? '' : lastName,
                name: !isLogin ? `${firstName} ${lastName}`.trim() : '',
            });

            await postJob(userCredential.user);

        } catch (err) {
            setError(friendlyAuthError(err));
            console.error(err);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div style={authPageStyle}>
            <div style={authContainerStyle}>
                <BrandLogo style={{ marginBottom: 20 }} />
                <div style={{ display: 'inline-flex', padding: '6px 10px', borderRadius: 999, backgroundColor: '#ECFEFF', color: '#0F766E', fontSize: 12, fontWeight: 700, marginBottom: 14 }}>
                    Secure task posting
                </div>
                <h1 style={{ fontFamily: 'Poppins, sans-serif', margin: '0 0 8px', color: '#111827' }}>Almost done</h1>
                <p style={{ color: '#4B5563', marginTop: 0, lineHeight: 1.6 }}>
                    Sign in to post your task, manage quotes, and keep payments and support inside Taskio.
                </p>
                <LegalNotice compact style={{ marginBottom: 12 }} />
                <div style={{ marginTop: 14, padding: 12, borderRadius: 12, backgroundColor: '#F9FAFB', border: '1px solid #E5E7EB', fontSize: 13, color: '#374151', lineHeight: 1.5 }}>
                    We recommend verifying your email promptly so quotes and support updates stay fully available.
                </div>
                {verifyInfo && <p style={{ color: '#065f46', fontSize: 13, marginTop: 14 }}>{verifyInfo}</p>}

                <div style={{ display: 'grid', gap: '10px', marginTop: '16px' }}>
                    <Button
                        onClick={() => handleProviderLogin('google')}
                        disabled={busy}
                        aria-label="Continue with Google"
                        variant="secondary"
                        style={{ ...providerButtonStyle, color: '#222', borderColor: '#E5E7EB', marginTop: 0 }}
                    >
                        Continue with Google
                    </Button>
                    <Button
                        onClick={() => handleProviderLogin('facebook')}
                        disabled={busy}
                        aria-label="Continue with Facebook"
                        variant="secondary"
                        style={{ ...providerButtonStyle, color: '#1877F2', borderColor: '#BFDBFE', marginTop: 0 }}
                    >
                        Continue with Facebook
                    </Button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '18px 0' }}>
                    <div style={{ height: '1px', backgroundColor: '#E0E0E0', flex: 1 }} />
                    <div style={{ fontSize: '12px', color: '#888' }}>or continue with email</div>
                    <div style={{ height: '1px', backgroundColor: '#E0E0E0', flex: 1 }} />
                </div>
                
                {/* Simple toggle for Login / Sign Up */}
                <div>
                    <button type="button" onClick={() => setIsLogin(true)} style={{fontWeight: isLogin ? 'bold' : 'normal', background: 'transparent', color: '#14C5C5', border: 'none', marginTop: 0, padding: 0}}>Login</button>
                    <span style={{ color: '#bbb' }}> &nbsp;|&nbsp; </span>
                    <button type="button" onClick={() => setIsLogin(false)} style={{fontWeight: !isLogin ? 'bold' : 'normal', background: 'transparent', color: '#14C5C5', border: 'none', marginTop: 0, padding: 0}}>Sign Up</button>
                </div>

                <form onSubmit={handleAuth} style={{ marginTop: '20px' }}>
                    {!isLogin && (
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <input
                                type="text"
                                placeholder="First name"
                                value={firstName}
                                onChange={(e) => setFirstName(e.target.value)}
                                style={fieldStyle}
                                required
                            />
                            <input
                                type="text"
                                placeholder="Last name"
                                value={lastName}
                                onChange={(e) => setLastName(e.target.value)}
                                style={fieldStyle}
                                required
                            />
                        </div>
                    )}
                     <input
                        type="email"
                        placeholder="Email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        style={fieldStyle}
                        required
                    />
                    <input
                        type="password"
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        style={{ ...fieldStyle, marginBottom: '16px' }}
                        required
                    />
                    {!isLogin && (
                        <LegalNotice
                            requireAcceptance
                            checked={acceptedLegal}
                            onChange={setAcceptedLegal}
                            compact
                            style={{ marginBottom: 16 }}
                        />
                    )}
                    {error && <p style={{ color: '#DC3545', fontSize: '14px' }}>{error}</p>}
                    <Button disabled={busy} type="submit" variant="accent" size="lg" style={{ width: '100%', justifyContent: 'center' }}>
                        {busy ? 'Please wait…' : (isLogin ? 'Login & Post Task' : 'Create Account & Post Task')}
                    </Button>
                </form>
            </div>
        </div>
    );
}

export default ClientAuthPage;
