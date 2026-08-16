// src/App.js
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from './firebase';
import { getE2EAuthUser } from './e2e/authBypass';

// --- Component Imports (Corrected Paths) ---
import Login from './Login';
import Dashboard from './Dashboard';
import JobPostingForm from './components/JobPostingForm';
import ClientAuthPage from './components/HomeownerAuthPage';
import JobDetail from './JobDetail';
import Layout from './Layout';
import ClientDashboard from './components/HomeownerDashboard';
import ClientJobDetail from './components/HomeownerJobDetail';
import PaymentPage from './components/PaymentPage';
import JobPostSuccessPage from './components/JobPostSuccessPage';
import LandingPage from './components/LandingPage';
import ExpertSignUpPage from './components/ExpertSignUpPage';
import ExpertDashboard from './components/TradieDashboard';
import TradieTasksPage from './components/TradieTasksPage';
import ExpertJobDetail from './components/TradieJobDetail';
import AdminRoute from './components/AdminRoute';
import AdminUserDetail from './AdminUserDetail';
import AdminMonitoring from './AdminMonitoring';
import AdminSupportTickets from './components/AdminSupportTickets';
import AdminProfileChangeRequests from './components/AdminProfileChangeRequests';
import AdminDailyChecklist from './components/AdminDailyChecklist';
import AdminPasswordPage from './components/AdminPasswordPage';
import ProfilePage from './components/ProfilePage';
import TradieAccountSettingsPage from './components/TradieAccountSettingsPage';
import AccountSettings from './components/AccountSettings';
import CompleteClientAccountPage from './components/CompleteHomeownerAccountPage';
import PaymentsPage from './components/PaymentsPage';
import NotificationsPage from './components/NotificationsPage';
import MessagesPage from './components/MessagesPage';
import SupportPage from './components/SupportPage';
import DeletionConfirmPage from './components/DeletionConfirmPage';
import AuthAction from './pages/AuthAction';
import E2ECriticalFlowsPage from './pages/E2ECriticalFlowsPage';
import PrivacyPolicyPage from './pages/PrivacyPolicyPage';
import TermsPage from './pages/TermsPage';
import NotFoundPage from './pages/NotFoundPage';
import GetStartedPage from './pages/GetStartedPage';
import RouteMetadata from './components/RouteMetadata';

import ExpertReviewsPage from './components/ExpertReviewsPage';
import './App.css';

// --- Protected Route Component ---
const ProtectedRoute = ({ children }) => {
  const [user, loading] = useAuthState(auth);
  const e2eUser = getE2EAuthUser();
  if (e2eUser) return children;
  if (loading) return <div>Loading session...</div>;
  if (!user) return <Navigate to="/login" />; // Redirect to login page if not authenticated
  return children;
};

function App() {
  return (
    <BrowserRouter>
      <RouteMetadata />
      <Routes>
        {/* --- Public Routes --- */}
        <Route path="/auth/action" element={<AuthAction />} />
        {process.env.REACT_APP_E2E_AUTH_BYPASS === 'true' && (
          <Route path="/e2e/critical-flows" element={<E2ECriticalFlowsPage />} />
        )}
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/admin" element={<Login adminMode />} />
        <Route path="/get-started" element={<GetStartedPage />} />
        <Route path="/privacy" element={<PrivacyPolicyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/tradie/signup" element={<ExpertSignUpPage />} />
        <Route path="/post-job" element={<JobPostingForm />} />
        <Route path="/auth-and-post" element={<ClientAuthPage />} />
        <Route path="/account/deletion/confirm" element={<DeletionConfirmPage />} />

        {/* --- Client Routes (Protected) --- */}
        <Route path="/dashboard" element={<ProtectedRoute><ClientDashboard /></ProtectedRoute>} />
        <Route path="/job/:jobId" element={<ProtectedRoute><ClientJobDetail /></ProtectedRoute>} />
        <Route path="/job-posted/:jobId" element={<ProtectedRoute><JobPostSuccessPage /></ProtectedRoute>} />
        <Route path="/payment/:jobId/:quoteId" element={<ProtectedRoute><PaymentPage /></ProtectedRoute>} />
        <Route path="/account/complete" element={<ProtectedRoute><CompleteClientAccountPage /></ProtectedRoute>} />
        {/* Backward-compatible aliases (some UI code used /homeowner/... paths) */}
        <Route path="/homeowner/job/:jobId" element={<ProtectedRoute><ClientJobDetail /></ProtectedRoute>} />
        <Route path="/homeowner/payment/:jobId/:quoteId" element={<ProtectedRoute><PaymentPage /></ProtectedRoute>} />

        {/* --- Expert Routes (Protected) --- */}
        <Route path="/tradie/dashboard" element={<ProtectedRoute><ExpertDashboard /></ProtectedRoute>} />
        <Route path="/tradie/jobs" element={<ProtectedRoute><TradieTasksPage /></ProtectedRoute>} />
        <Route path="/tradie/job/:jobId" element={<ProtectedRoute><ExpertJobDetail /></ProtectedRoute>} />
        <Route path="/tradie/reviews" element={<ProtectedRoute><ExpertReviewsPage /></ProtectedRoute>} />

        {/* --- Shared Account Routes (Protected) --- */}
        <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
        <Route path="/tradie/account-settings" element={<ProtectedRoute><TradieAccountSettingsPage /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><AccountSettings /></ProtectedRoute>} />
        {/* Admin convenience alias (same profile page, but keeps admin URL namespace) */}
        <Route path="/admin/profile" element={<AdminRoute><ProfilePage /></AdminRoute>} />
        <Route path="/admin/password" element={<AdminRoute><AdminPasswordPage /></AdminRoute>} />
        <Route path="/payments" element={<ProtectedRoute><PaymentsPage /></ProtectedRoute>} />
        <Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
        <Route path="/messages" element={<ProtectedRoute><MessagesPage /></ProtectedRoute>} />
        <Route path="/support" element={<ProtectedRoute><SupportPage /></ProtectedRoute>} />

        {/* --- Admin Routes (Protected by Layout) --- */}
        <Route element={<AdminRoute><Layout /></AdminRoute>}>
          <Route path="/admin/dashboard" element={<Dashboard />} />
          <Route path="/admin/task-queue" element={<Dashboard variant="fullQueue" />} />
          <Route path="/admin/monitoring" element={<AdminMonitoring />} />
          <Route path="/admin/job/:jobId" element={<JobDetail />} />
          <Route path="/admin/user/:uid" element={<AdminUserDetail />} />
        </Route>

        {/* --- Admin Support Tickets (uses its own header, not Layout) --- */}
        <Route path="/admin/support" element={<AdminRoute><AdminSupportTickets /></AdminRoute>} />
        <Route path="/admin/profile-change-requests" element={<AdminRoute><AdminProfileChangeRequests /></AdminRoute>} />
        <Route path="/admin/daily-checklist" element={<AdminRoute><AdminDailyChecklist /></AdminRoute>} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

