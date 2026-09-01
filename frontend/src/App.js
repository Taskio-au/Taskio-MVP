// src/App.js
import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from './firebase';
import { getE2EAuthUser } from './e2e/authBypass';

import Login from './Login';
import LandingPage from './components/LandingPage';
import AdminRoute from './components/AdminRoute';
import AuthAction from './pages/AuthAction';
import PrivacyPolicyPage from './pages/PrivacyPolicyPage';
import TermsPage from './pages/TermsPage';
import NotFoundPage from './pages/NotFoundPage';
import GetStartedPage from './pages/GetStartedPage';
import RouteMetadata from './components/RouteMetadata';
import './App.css';

const Dashboard = lazy(() => import('./Dashboard'));
const JobPostingForm = lazy(() => import('./components/JobPostingForm'));
const JobDetail = lazy(() => import('./JobDetail'));
const Layout = lazy(() => import('./Layout'));
const ClientDashboard = lazy(() => import('./components/HomeownerDashboard'));
const ClientJobDetail = lazy(() => import('./components/HomeownerJobDetail'));
const PaymentPage = lazy(() => import('./components/PaymentPage'));
const JobPostSuccessPage = lazy(() => import('./components/JobPostSuccessPage'));
const ExpertSignUpRoute = lazy(() => import('./components/ExpertSignUpRoute'));
const ExpertDashboard = lazy(() => import('./components/TradieDashboard'));
const TradieTasksPage = lazy(() => import('./components/TradieTasksPage'));
const ExpertJobDetail = lazy(() => import('./components/TradieJobDetail'));
const AdminUserDetail = lazy(() => import('./AdminUserDetail'));
const AdminMonitoring = lazy(() => import('./AdminMonitoring'));
const AdminSupportTickets = lazy(() => import('./components/AdminSupportTickets'));
const AdminProfileChangeRequests = lazy(() => import('./components/AdminProfileChangeRequests'));
const AdminDailyChecklist = lazy(() => import('./components/AdminDailyChecklist'));
const AdminPasswordPage = lazy(() => import('./components/AdminPasswordPage'));
const ProfilePage = lazy(() => import('./components/ProfilePage'));
const TradieAccountSettingsPage = lazy(() => import('./components/TradieAccountSettingsPage'));
const AccountSettings = lazy(() => import('./components/AccountSettings'));
const CompleteClientAccountPage = lazy(() => import('./components/CompleteHomeownerAccountPage'));
const PaymentsPage = lazy(() => import('./components/PaymentsPage'));
const NotificationsPage = lazy(() => import('./components/NotificationsPage'));
const MessagesPage = lazy(() => import('./components/MessagesPage'));
const SupportPage = lazy(() => import('./components/SupportPage'));
const DeletionConfirmPage = lazy(() => import('./components/DeletionConfirmPage'));
const E2ECriticalFlowsPage = lazy(() => import('./pages/E2ECriticalFlowsPage'));
const ExpertReviewsPage = lazy(() => import('./components/ExpertReviewsPage'));

const ProtectedRoute = ({ children }) => {
  const [user, loading] = useAuthState(auth);
  const e2eUser = getE2EAuthUser();
  if (e2eUser) return children;
  if (loading) return <div>Loading session...</div>;
  if (!user) return <Navigate to="/login" />;
  return children;
};

function App() {
  return (
    <BrowserRouter>
      <RouteMetadata />
      <Suspense fallback={<div className="app-route-fallback" role="status">Loading…</div>}>
        <Routes>
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
          <Route path="/tradie/signup" element={<ExpertSignUpRoute />} />
          <Route path="/post-job" element={<JobPostingForm />} />
          <Route path="/account/deletion/confirm" element={<DeletionConfirmPage />} />

          <Route path="/dashboard" element={<ProtectedRoute><ClientDashboard /></ProtectedRoute>} />
          <Route path="/job/:jobId" element={<ProtectedRoute><ClientJobDetail /></ProtectedRoute>} />
          <Route path="/job-posted/:jobId" element={<ProtectedRoute><JobPostSuccessPage /></ProtectedRoute>} />
          <Route path="/payment/:jobId/:quoteId" element={<ProtectedRoute><PaymentPage /></ProtectedRoute>} />
          <Route path="/account/complete" element={<ProtectedRoute><CompleteClientAccountPage /></ProtectedRoute>} />
          <Route path="/homeowner/job/:jobId" element={<ProtectedRoute><ClientJobDetail /></ProtectedRoute>} />
          <Route path="/homeowner/payment/:jobId/:quoteId" element={<ProtectedRoute><PaymentPage /></ProtectedRoute>} />

          <Route path="/tradie/dashboard" element={<ProtectedRoute><ExpertDashboard /></ProtectedRoute>} />
          <Route path="/tradie/jobs" element={<ProtectedRoute><TradieTasksPage /></ProtectedRoute>} />
          <Route path="/tradie/job/:jobId" element={<ProtectedRoute><ExpertJobDetail /></ProtectedRoute>} />
          <Route path="/tradie/reviews" element={<ProtectedRoute><ExpertReviewsPage /></ProtectedRoute>} />

          <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
          <Route path="/tradie/account-settings" element={<ProtectedRoute><TradieAccountSettingsPage /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><AccountSettings /></ProtectedRoute>} />
          <Route path="/admin/profile" element={<AdminRoute><ProfilePage /></AdminRoute>} />
          <Route path="/admin/password" element={<AdminRoute><AdminPasswordPage /></AdminRoute>} />
          <Route path="/payments" element={<ProtectedRoute><PaymentsPage /></ProtectedRoute>} />
          <Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
          <Route path="/messages" element={<ProtectedRoute><MessagesPage /></ProtectedRoute>} />
          <Route path="/support" element={<ProtectedRoute><SupportPage /></ProtectedRoute>} />

          <Route element={<AdminRoute><Layout /></AdminRoute>}>
            <Route path="/admin/dashboard" element={<Dashboard />} />
            <Route path="/admin/task-queue" element={<Dashboard variant="fullQueue" />} />
            <Route path="/admin/monitoring" element={<AdminMonitoring />} />
            <Route path="/admin/job/:jobId" element={<JobDetail />} />
            <Route path="/admin/user/:uid" element={<AdminUserDetail />} />
          </Route>

          <Route path="/admin/support" element={<AdminRoute><AdminSupportTickets /></AdminRoute>} />
          <Route path="/admin/profile-change-requests" element={<AdminRoute><AdminProfileChangeRequests /></AdminRoute>} />
          <Route path="/admin/daily-checklist" element={<AdminRoute><AdminDailyChecklist /></AdminRoute>} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
