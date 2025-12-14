import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

// --- SVG Icon Components (UPDATED for better clarity and minimal design) ---
const HandymanIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
);
const PlumbingIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 10.5c0-1 .9-2 2-2s2 .9 2 2a2 2 0 1 1-4 0Z"/><path d="M17.5 10c0-1.8-1.5-3.2-3.3-3.2-1.2 0-2.3.6-2.9 1.5"/><path d="M12 14v8"/><path d="M12 4V2"/><path d="M12 22h-1c-1.1 0-2-.9-2-2v-1a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1c0 1.1-.9 2-2 2h-1Z"/></svg>
);
const ElectricalIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>
);
const PaintingIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h0a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2h0Z"/><path d="M18 22V8a2 2 0 0 0-2-2h-4"/><path d="M6 22V8a2 2 0 0 1 2-2h4"/></svg>
);
const CleaningIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5.07 16.22A5.2 5.2 0 0 0 4 21h16a5.2 5.2 0 0 0-1.07-4.78"/><path d="M12 2v6"/><path d="M12 14h.01"/><path d="M17.5 10.5c0-3-2.5-5.5-5.5-5.5S6.5 7.5 6.5 10.5"/></svg>
);
const GardeningIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 22c0-2.8 2.2-5 5-5h1.1a5 5 0 0 1 4.5 2.8L16 22"/><path d="M19 16.9c0-2.2 1.8-4 4-4V4c0-1.1-.9-2-2-2s-2 .9-2 2v1.4a4 4 0 0 0-1.2 4.1L19 16.9z"/></svg>
);


const LandingPage = () => {
    const navigate = useNavigate();
    
    // --- State for rotating background images ---
    const backgroundImages = [
        '/images/bg1.jpg',
        '/images/bg2.jpg',
        '/images/bg3.jpg',
        '/images/bg4.jpg',
        '/images/bg5.jpg',
        '/images/bg6.jpg',
        '/images/bg7.jpg',
        '/images/bg8.jpg',
        '/images/bg9.jpg',
    ];
    const [currentBgIndex, setCurrentBgIndex] = useState(0);

    useEffect(() => {
        const intervalId = setInterval(() => {
            setCurrentBgIndex((prevIndex) => (prevIndex + 1) % backgroundImages.length);
        }, 5000); 

        return () => clearInterval(intervalId);
    }, [backgroundImages.length]);


    const services = [
        { name: 'Handyman', icon: <HandymanIcon /> },
        { name: 'Plumbing', icon: <PlumbingIcon /> },
        { name: 'Electrical', icon: <ElectricalIcon /> },
        { name: 'Painting', icon: <PaintingIcon /> },
        { name: 'Cleaning', icon: <CleaningIcon /> },
        { name: 'Gardening', icon: <GardeningIcon /> },
    ];

    return (
        <div style={styles.page}>
            <header style={styles.header}>
                <img src="/images/taskio-logo.png" alt="Taskio Logo" style={styles.logo} onClick={() => navigate('/')} />
                <nav>
                    <a href="/tradie/signup" style={styles.navLink}>Become a Tradie</a>
                    <button onClick={() => navigate('/login')} style={styles.loginButton}>Log In</button>
                </nav>
            </header>

            <main>
                <section style={{...styles.hero, backgroundImage: `url(${backgroundImages[currentBgIndex]})`}}>
                    <div style={styles.heroOverlay}></div>
                    <div style={styles.heroContent}>
                        <div style={styles.heroTextContainer}>
                            <h1 style={styles.heroTitle}>Your To-Do List, Done.</h1>
                            <p style={styles.heroSubtitle}>Every Task, One Platform, Taskio.</p>
                            <button onClick={() => navigate('/post-job')} style={styles.ctaButton}>
                                Post Your Job for Free
                            </button>
                        </div>
                    </div>
                </section>

                <section style={styles.servicesSection}>
                    <h2 style={styles.sectionTitle}>Popular services</h2>
                    <div style={styles.servicesGrid}>
                        {services.map((service) => (
                            <div key={service.name} style={styles.serviceCard}>
                                <div style={styles.serviceIcon}>{service.icon}</div>
                                <span style={styles.serviceName}>{service.name}</span>
                            </div>
                        ))}
                    </div>
                </section>
            </main>
        </div>
    );
};

// --- Styles ---

const styles = {
    page: { fontFamily: 'Inter, sans-serif', color: '#222222', backgroundColor: '#FFFFFF' },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '15px 40px',
        backgroundColor: 'rgba(255, 255, 255, 0.8)',
        backdropFilter: 'blur(10px)',
        borderBottom: '1px solid #E0E0E0',
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100
    },
    logo: { 
        height: '40px',
        cursor: 'pointer'
    },
    navLink: { margin: '0 15px', color: '#555', textDecoration: 'none', fontWeight: '500' },
    loginButton: {
        backgroundColor: '#14C5C5',
        color: 'white',
        border: 'none',
        padding: '10px 20px',
        borderRadius: '8px',
        cursor: 'pointer',
        fontWeight: 'bold'
    },
    hero: {
        height: 'calc(100vh - 340px)', // UPDATED: Further reduced height
        minHeight: '400px', // Ensures a reasonable minimum height
        display: 'flex',
        alignItems: 'center',
        position: 'relative',
        color: 'white',
        marginTop: '70px',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        transition: 'background-image 1s ease-in-out',
    },
    heroOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
    },
    heroContent: { 
        zIndex: 1, 
        position: 'relative',
        width: '100%',
        maxWidth: '1200px',
        margin: '0 auto',
        padding: '0 40px',
        textAlign: 'left',
    },
    heroTextContainer: {
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        padding: '40px',
        borderRadius: '12px',
        maxWidth: '550px',
    },
    heroTitle: {
        fontFamily: 'Poppins, sans-serif',
        fontSize: '48px',
        fontWeight: '600',
        margin: '0 0 10px 0',
        lineHeight: 1.2,
    },
    heroSubtitle: {
        fontSize: '20px',
        marginBottom: '30px',
        opacity: 0.9,
    },
    ctaButton: {
        backgroundColor: '#FF9100',
        color: 'white',
        border: 'none',
        padding: '18px 36px',
        borderRadius: '8px',
        fontSize: '18px',
        fontWeight: 'bold',
        cursor: 'pointer',
        transition: 'transform 0.2s ease',
    },
    servicesSection: {
        padding: '40px', // UPDATED: Reduced padding
        backgroundColor: '#F7F9FA',
        textAlign: 'center',
    },
    sectionTitle: {
        fontFamily: 'Poppins, sans-serif',
        fontSize: '32px',
        marginBottom: '40px',
    },
    servicesGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: '20px',
        maxWidth: '1200px',
        margin: '0 auto',
    },
    serviceCard: {
        backgroundColor: '#FFFFFF',
        padding: '20px',
        borderRadius: '12px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '15px',
        color: '#14C5C5',
        cursor: 'pointer',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
    },
    serviceIcon: {
        width: '48px',
        height: '48px',
    },
    serviceName: {
        fontWeight: '500',
        color: '#222222',
    }
};

export default LandingPage;

