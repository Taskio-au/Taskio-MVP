// src/components/PaymentPage.js
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { auth } from '../firebase';
import axios from 'axios';

// --- TODO: Stripe.js setup ---
// 1. Install Stripe: npm install @stripe/react-stripe-js @stripe/stripe-js
// 2. Import Stripe components:
// import { loadStripe } from '@stripe/stripe-js';
// import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';

// 3. Load Stripe with your public key (add to .env file)
// const stripePromise = loadStripe(process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY);

const api = axios.create({
    baseURL: process.env.REACT_APP_API_BASE_URL || 'http://localhost:8000'
});

// This would be your actual payment form component
const CheckoutForm = ({ clientSecret }) => {
    // const stripe = useStripe();
    // const elements = useElements();
    const [processing, setProcessing] = useState(false);
    const [error, setError] = useState(null);
    const [succeeded, setSucceeded] = useState(false);
    const navigate = useNavigate();

    const handleSubmit = async (event) => {
        event.preventDefault();
        setProcessing(true);

        // --- Placeholder for real Stripe payment confirmation ---
        console.log("Simulating payment processing...");
        setTimeout(() => {
            console.log("Payment successful!");
            setProcessing(false);
            setSucceeded(true);
            setError(null);
            // Here you would update the job status in your DB via another API call
            alert("Payment successful! The job is now in progress.");
            navigate('/dashboard');
        }, 2000);

        /*
        // REAL STRIPE LOGIC:
        if (!stripe || !elements) {
            return;
        }

        const payload = await stripe.confirmCardPayment(clientSecret, {
            payment_method: {
                card: elements.getElement(CardElement)
            }
        });

        if (payload.error) {
            setError(`Payment failed: ${payload.error.message}`);
            setProcessing(false);
        } else {
            setError(null);
            setProcessing(false);
            setSucceeded(true);
            // Call a backend endpoint to finalize the job status to 'in_progress'
            navigate('/dashboard', { state: { successMessage: 'Payment successful!' } });
        }
        */
    };

    return (
        <form onSubmit={handleSubmit} style={styles.form}>
            <h4>Enter Card Details</h4>
            <div style={styles.cardElementContainer}>
                {/* This is where the Stripe CardElement would go */}
                <p style={{textAlign: 'center', color: '#888'}}>Stripe Card Element would be here.</p>
            </div>
            
            <button 
                disabled={processing || succeeded} 
                style={styles.payButton}
            >
                {processing ? "Processing..." : `Pay Now`}
            </button>
            
            {error && <div style={{color: 'red', marginTop: '10px'}}>{error}</div>}
            {succeeded && <div style={{color: 'green', marginTop: '10px'}}>Payment Successful!</div>}
        </form>
    );
};

function PaymentPage() {
    const { jobId, quoteId } = useParams();
    const navigate = useNavigate();
    const [clientSecret, setClientSecret] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const createPaymentIntent = async () => {
            const user = auth.currentUser;
            if (!user) {
                navigate('/login');
                return;
            }
            try {
                const token = await user.getIdToken();
                const config = { headers: { Authorization: `Bearer ${token}` } };
                const response = await api.post(`/api/jobs/${jobId}/fund`, { quoteId }, config);
                
                setClientSecret(response.data.clientSecret);
            } catch (err) {
                console.error("Error creating payment intent:", err);
                setError("Failed to initialize payment. Please go back and try again.");
            } finally {
                setLoading(false);
            }
        };

        createPaymentIntent();
    }, [jobId, quoteId, navigate]);

    if (loading) return <div style={styles.centered}>Initializing secure payment...</div>;
    if (error) return <div style={{...styles.centered, color: '#DC3545'}}>{error}</div>;

    return (
        <div style={styles.pageContainer}>
            <div style={styles.paymentBox}>
                <h1 style={styles.title}>Fund Escrow</h1>
                <p>You are about to securely fund the escrow for this job. The funds will be held safely by Taskio and only released to the tradie once you approve the job as complete.</p>
                
                {/* This is where the Stripe Elements wrapper would go */}
                {clientSecret ? (
                    // <Elements stripe={stripePromise} options={{ clientSecret }}>
                        <CheckoutForm clientSecret={clientSecret} />
                    // </Elements>
                ) : (
                    <p>Loading payment form...</p>
                )}
            </div>
        </div>
    );
}

const styles = {
    pageContainer: { display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', backgroundColor: '#F7F9FA', fontFamily: 'Inter, sans-serif' },
    paymentBox: { backgroundColor: '#FFFFFF', borderRadius: '12px', padding: '40px', boxShadow: '0 5px 15px rgba(0,0,0,0.1)', width: '100%', maxWidth: '500px' },
    title: { fontFamily: 'Poppins, sans-serif', textAlign: 'center', marginBottom: '15px' },
    centered: { textAlign: 'center', padding: '50px', fontSize: '18px', color: '#555' },
    form: { marginTop: '30px' },
    cardElementContainer: { border: '1px solid #E0E0E0', padding: '20px', borderRadius: '8px', margin: '20px 0' },
    payButton: { width: '100%', backgroundColor: '#FF9100', color: '#FFFFFF', border: 'none', borderRadius: '8px', padding: '15px', fontSize: '18px', fontWeight: 'bold', cursor: 'pointer' },
};

export default PaymentPage;
