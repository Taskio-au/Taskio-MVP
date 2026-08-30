// src/components/PaymentPage.js
import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ShieldCheck, Smartphone } from 'lucide-react';
import { auth } from '../firebase';
import { createApiClient } from '../api/createApiClient';
import { getE2EAuthUser } from '../e2e/authBypass';
import { BrandLogo } from '../design/components';
import { CLIENT_PAYMENT_GATE } from '../constants/blockedFlowCopy';
import { PageLoadingShell } from './ui/AsyncPageStates';
import PageMain from './ui/PageMain';
import { navigateToStripeHostedCheckout } from '../utils/stripeHostedCheckoutUrl';

const api = createApiClient();

/** Narrow screens: spacing, stacked CTAs, readable copy (375–480px). */
const PAYMENT_PAGE_MOBILE_CSS = `
@media (max-width: 480px) {
  .payment-page-shell {
    padding: 16px 12px !important;
    align-items: stretch !important;
    box-sizing: border-box !important;
  }
  .payment-page-box {
    padding: 20px 16px !important;
    max-width: 100% !important;
    box-sizing: border-box !important;
  }
  .payment-page-title {
    font-size: 22px !important;
    line-height: 1.25 !important;
  }
  .payment-page-shell > p,
  .payment-page-box p {
    font-size: 15px;
    line-height: 1.55;
    word-wrap: break-word;
    overflow-wrap: anywhere;
  }
  .payment-page-callout-head {
    flex-direction: column !important;
    align-items: flex-start !important;
    gap: 10px !important;
  }
  .payment-page-actions {
    flex-direction: column !important;
    align-items: stretch !important;
    gap: 10px !important;
  }
  .payment-page-primary,
  .payment-page-secondary {
    flex: 1 1 auto !important;
    width: 100% !important;
    min-height: 48px !important;
    box-sizing: border-box !important;
  }
  .payment-pay-cta {
    min-height: 48px !important;
    padding-top: 14px !important;
    padding-bottom: 14px !important;
    box-sizing: border-box !important;
  }
  .payment-reassurance-card {
    align-items: flex-start !important;
  }
  .payment-reassurance-text {
    min-width: 0;
    word-wrap: break-word;
    overflow-wrap: anywhere;
  }
  .payment-page-centered {
    padding: 36px 16px !important;
    box-sizing: border-box !important;
  }
}
`;

function PaymentPage() {
    const { jobId, quoteId } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const [checkoutUrl, setCheckoutUrl] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [redirecting, setRedirecting] = useState(false);
    const [needsAccountCompletion, setNeedsAccountCompletion] = useState(false);
    const backToTaskPath = jobId ? `/job/${jobId}` : '/dashboard';

    const goToStripeCheckout = useCallback((url) => {
        try {
            setRedirecting(true);
            navigateToStripeHostedCheckout(url);
        } catch (_e) {
            setError('Payment couldn\'t start. Please try again.');
            setRedirecting(false);
        }
    }, []);

    useEffect(() => {
        const createCheckoutSession = async () => {
            const user = auth.currentUser || getE2EAuthUser();
            if (!user) {
                navigate('/login');
                return;
            }
            try {
                const token = await user.getIdToken();
                const config = { headers: { Authorization: `Bearer ${token}` } };
                const response = await api.post(`/api/jobs/${jobId}/checkout`, { quoteId }, config);
                if (response?.data?.paymentAlreadyConfirmed) {
                    navigate(`/job/${jobId}`, {
                        replace: true,
                        state: { taskioBanner: 'Payment is already confirmed. Returning to task…' },
                    });
                    return;
                }
                const url = response?.data?.checkoutUrl;
                if (!url) {
                    setError('Payment couldn\'t start. Please try again.');
                    return;
                }
                setCheckoutUrl(url);
            } catch (err) {
                console.error("Error creating checkout session:", err);
                const code = err?.response?.data?.code;
                if (err?.response?.status === 403 && code === 'account_completion_required') {
                    setNeedsAccountCompletion(true);
                    setError(err?.response?.data?.message || 'Verify your email or continue with Google before you can pay securely.');
                } else {
                    setError('Payment couldn\'t start. Please try again.');
                }
            } finally {
                setLoading(false);
            }
        };

        createCheckoutSession();
    }, [jobId, quoteId, navigate]);

    // Auto-navigate once the server-returned Stripe Checkout URL is ready.
    useEffect(() => {
        if (checkoutUrl) {
            goToStripeCheckout(checkoutUrl);
        }
    }, [checkoutUrl, goToStripeCheckout]);

    if (loading) {
        return (
            <>
                <style>{PAYMENT_PAGE_MOBILE_CSS}</style>
                <PageLoadingShell
                    message="Preparing secure checkout…"
                    detail="Setting up your payment session with Stripe."
                />
            </>
        );
    }
    if (error) {
        return (
            <>
                <style>{PAYMENT_PAGE_MOBILE_CSS}</style>
                <PageMain label="Secure payment">
                <div className="payment-page-shell" style={styles.pageContainer}>
                <div className="payment-page-box" style={styles.paymentBox}>
                    <div className="payment-page-callout-head" style={styles.calloutHeader}>
                        <div style={styles.calloutIconWrap} aria-hidden="true">
                            {needsAccountCompletion ? <Smartphone size={18} /> : <ShieldCheck size={18} />}
                        </div>
                        <div>
                            <div style={styles.calloutTitle}>
                                {needsAccountCompletion ? CLIENT_PAYMENT_GATE.titleAccount : CLIENT_PAYMENT_GATE.titleGeneric}
                            </div>
                            <div style={styles.calloutSubtitle}>
                                {needsAccountCompletion
                                    ? 'Verify your email or continue with Google before you can pay securely.'
                                    : 'Please try again, or return to the task and retry from there.'}
                            </div>
                        </div>
                    </div>

                    <div style={styles.calloutBody}>
                        <div style={styles.calloutHint}>
                            {needsAccountCompletion ? (
                                <>
                                    <div style={styles.stepsTitle}>What to do next</div>
                                    <ol style={styles.stepsList}>
                                        <li>Verify your email or link Google</li>
                                        <li>Return to this task</li>
                                        <li>Continue to payment</li>
                                    </ol>
                                </>
                            ) : null}
                        </div>

                        <div style={styles.calloutErrorText} role="alert">
                            {error}
                        </div>
                    </div>

                    <div className="payment-page-actions" style={styles.actionsRow}>
                        {needsAccountCompletion ? (
                            <button
                                type="button"
                                className="payment-page-primary"
                                style={styles.primaryButton}
                                onClick={() => navigate(`/account/complete?next=${encodeURIComponent(location.pathname)}`)}
                            >
                                {CLIENT_PAYMENT_GATE.primaryCta}
                            </button>
                        ) : (
                            <button
                                type="button"
                                className="payment-page-primary"
                                style={styles.primaryButton}
                                onClick={() => { setError(''); setLoading(true); window.location.reload(); }}
                            >
                                {CLIENT_PAYMENT_GATE.tryAgain}
                            </button>
                        )}
                        <button
                            type="button"
                            className="payment-page-secondary"
                            style={styles.secondaryButton}
                            onClick={() => navigate(backToTaskPath)}
                        >
                            {CLIENT_PAYMENT_GATE.backToTask}
                        </button>
                    </div>
                </div>
            </div>
                </PageMain>
            </>
        );
    }
    return (
        <>
            <style>{PAYMENT_PAGE_MOBILE_CSS}</style>
            <PageMain label="Secure payment">
            <div className="payment-page-shell" style={styles.pageContainer}>
            <div style={styles.headerBar}>
                <BrandLogo to="/" />
            </div>
            <div className="payment-page-box" style={styles.paymentBox}>
                <h1 className="payment-page-title" style={styles.title}>Secure payment</h1>
                <p>
                    You’ll go to <strong>Stripe Checkout</strong> to pay. Taskio doesn’t store your card details.
                </p>
                <div className="payment-reassurance-card" style={styles.reassuranceCard}>
                    <ShieldCheck size={18} color="#0F766E" />
                    <div className="payment-reassurance-text" style={styles.reassuranceText}>
                        Your payment is processed securely. Funds are not released to the Expert until you approve the completed work. The Expert’s payout is then
                        processed by Stripe.
                    </div>
                </div>

                <button
                    type="button"
                    className="payment-pay-cta"
                    onClick={() => goToStripeCheckout(checkoutUrl)}
                    disabled={!checkoutUrl || redirecting}
                    style={styles.payButton}
                >
                    {redirecting ? 'Redirecting to Stripe…' : 'Continue to checkout'}
                </button>
            </div>
        </div>
            </PageMain>
        </>
    );
}

const styles = {
    pageContainer: {
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        backgroundColor: '#F7F9FA',
        fontFamily: 'Inter, sans-serif',
        padding: '32px 16px'
    },
    headerBar: { width: '100%', maxWidth: 500, marginBottom: 18 },
    paymentBox: { backgroundColor: '#FFFFFF', borderRadius: '12px', padding: '40px', boxShadow: '0 5px 15px rgba(0,0,0,0.1)', width: '100%', maxWidth: '500px' },
    title: { fontFamily: 'Poppins, sans-serif', textAlign: 'center', marginBottom: '15px' },
    centered: { textAlign: 'center', padding: '50px', fontSize: '18px', color: '#555' },

    // Primary payment CTA (Stripe)
    payButton: { width: '100%', backgroundColor: '#FF9100', color: '#FFFFFF', border: 'none', borderRadius: '10px', padding: '14px', fontSize: '16px', fontWeight: 700, cursor: 'pointer', marginTop: 16 },

    // Error/notice callout UI
    calloutHeader: { display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 16 },
    calloutIconWrap: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: 'rgba(20, 197, 197, 0.12)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#0F766E'
    },
    calloutTitle: { fontFamily: 'Poppins, sans-serif', fontSize: 18, fontWeight: 700, color: '#111827', lineHeight: 1.2 },
    calloutSubtitle: { marginTop: 4, fontSize: 14, color: '#4B5563', lineHeight: 1.5 },
    calloutBody: {
        backgroundColor: '#F9FAFB',
        border: '1px solid #E5E7EB',
        borderRadius: 12,
        padding: 14,
        marginBottom: 16
    },
    calloutHint: { fontSize: 14, color: '#374151' },
    stepsTitle: { fontWeight: 700, marginBottom: 8, color: '#111827' },
    stepsList: { margin: 0, paddingLeft: 18, lineHeight: 1.6, color: '#374151' },
    calloutErrorText: { marginTop: 12, fontSize: 13, color: '#6B7280' },
    actionsRow: { display: 'flex', gap: 10, flexWrap: 'wrap' },
    reassuranceCard: {
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        marginTop: 14,
        padding: 14,
        backgroundColor: '#F0FDFA',
        border: '1px solid #CCFBF1',
        borderRadius: 12,
    },
    reassuranceText: { fontSize: 13, color: '#115E59', lineHeight: 1.5 },
    primaryButton: {
        height: 42,
        padding: '0 14px',
        borderRadius: 10,
        border: 'none',
        backgroundColor: 'var(--taskio-teal, #14C5C5)',
        color: '#fff',
        fontWeight: 800,
        cursor: 'pointer',
        flex: '1 1 180px'
    },
    secondaryButton: {
        height: 42,
        padding: '0 14px',
        borderRadius: 10,
        border: '1px solid #D1D5DB',
        backgroundColor: '#fff',
        color: '#374151',
        fontWeight: 800,
        cursor: 'pointer',
        flex: '1 1 180px'
    },
};

export default PaymentPage;
