// src/App.js
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from './firebase';

// --- Component Imports (Corrected Paths) ---
import Login from './Login';
import Dashboard from './Dashboard';
import JobPostingForm from './components/JobPostingForm';
import HomeownerAuthPage from './components/HomeownerAuthPage';
import JobDetail from './JobDetail';
import Layout from './Layout';
import HomeownerDashboard from './components/HomeownerDashboard';
import HomeownerJobDetail from './components/HomeownerJobDetail';
import PaymentPage from './components/PaymentPage';
import LandingPage from './components/LandingPage';
import TradieSignUp from './components/TradieSignUp';
import TradieDashboard from './components/TradieDashboard';
import TradieJobDetail from './components/TradieJobDetail';

import './App.css';

// --- Protected Route Component ---
const ProtectedRoute = ({ children }) => {
    const [user, loading] = useAuthState(auth);
    if (loading) return <div>Loading session...</div>;
    if (!user) return <Navigate to="/login" />; // Redirect to login page if not authenticated
    return children;
};


function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* --- Public Routes --- */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/tradie/signup" element={<TradieSignUp />} />
        <Route path="/post-job" element={<JobPostingForm />} />
        <Route path="/auth-and-post" element={<HomeownerAuthPage />} />
        
        {/* --- Homeowner Routes (Protected) --- */}
        <Route 
          path="/dashboard"
          element={<ProtectedRoute><HomeownerDashboard /></ProtectedRoute>} 
        />
        <Route 
          path="/job/:jobId"
          element={<ProtectedRoute><HomeownerJobDetail /></ProtectedRoute>} 
        />
        <Route 
          path="/payment/:jobId/:quoteId"
          element={<ProtectedRoute><PaymentPage /></ProtectedRoute>} 
        />

        {/* --- Tradie Routes (Protected) --- */}
        <Route
          path="/tradie/dashboard"
          element={<ProtectedRoute><TradieDashboard /></ProtectedRoute>}
        />
        <Route
          path="/tradie/job/:jobId"
          element={<ProtectedRoute><TradieJobDetail /></ProtectedRoute>}
        />
        
        {/* --- Admin Routes (Protected by Layout) --- */}
        <Route element={<Layout />}>
          <Route path="/admin/dashboard" element={<Dashboard />} />
          <Route path="/admin/job/:jobId" element={<JobDetail />} />
        </Route>

      </Routes>
    </BrowserRouter>
  );
}

export default App;

