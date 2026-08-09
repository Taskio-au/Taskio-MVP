import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { ReceiptText } from 'lucide-react';
import { auth, db } from '../firebase';
import AppHeader from './AppHeader';
import adminApi from '../api/adminApi';
import AdminEntityNotesSection from '../features/admin/components/AdminEntityNotesSection';
import AdminWorkflowSection from '../features/admin/components/AdminWorkflowSection';
import { dashboardStyles } from '../styles/dashboardStyles';
import { collection, onSnapshot, orderBy, query, doc, updateDoc, serverTimestamp, arrayUnion } from 'firebase/firestore';
import { toMillis } from '../utils/adminOps';
import { jobIdsMatchingWorkflowFilters } from '../features/admin/utils/workflowQueueFilters';

const supportNotesStyles = {
  ...dashboardStyles,
  filterSelect: { padding: '5px 10px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13 },
};

const LINKED_RISK_OPTIONS = [
  { v: 'PAYMENT_ISSUE', l: 'Payment' },
  { v: 'PROFILE_VERIFICATION_REQUIRED', l: 'Verification' },
  { v: 'EXPERT_TRUST_REVIEW', l: 'Expert trust' },
];

function linkedContextChips(ticket) {
  const t = ticket || {};
  const out = [];
  if (t.jobId) {
    out.push({
      key: 'job',
      label: `Task ${String(t.jobId).slice(0, 8)}`,
      href: `/admin/dashboard?tab=jobs&openJob=${encodeURIComponent(t.jobId)}`,
      kind: 'link',
    });
  }
  if (t.userUid) {
    out.push({ key: 'user', label: 'User', href: `/admin/user/${t.userUid}`, kind: 'link' });
  }
  const cat = String(t.category || '').toLowerCase();
  const lr = Array.isArray(t.linkedRiskTypes) ? t.linkedRiskTypes.map((x) => String(x || '').toUpperCase()) : [];
  if (cat === 'payments' || lr.includes('PAYMENT_ISSUE')) {
    out.push({ key: 'pay', label: 'Payment issue', kind: 'meta' });
  }
  if (cat.includes('verif') || lr.includes('PROFILE_VERIFICATION_REQUIRED')) {
    out.push({ key: 'ver', label: 'Verification', href: '/admin/profile-change-requests?status=pending&trust=1', kind: 'link' });
  }
  return out;
}

function escalationChipStyle(esc) {
  const e = String(esc || 'normal').toLowerCase();
  if (e === 'super_admin') return { bg: '#fff1f2', bd: '#fecdd3', fg: '#9f1239', label: 'Super admin' };
  if (e === 'ops') return { bg: '#fef3c7', bd: '#fde68a', fg: '#92400e', label: 'Ops' };
  if (e === 'priority') return { bg: '#eff6ff', bd: '#bfdbfe', fg: '#1d4ed8', label: 'Priority' };
  return null;
}

const STATUS_LABELS = {
  open: 'New',
  new: 'New',
  in_progress: 'In progress',
  waiting_on_user: 'Waiting on user',
  resolved: 'Resolved',
  closed: 'Closed',
};

const STATUS_COLORS = {
  open: '#FF9100',
  new: '#FF9100',
  in_progress: '#14C5C5',
  waiting_on_user: '#7c3aed',
  resolved: '#28A745',
  closed: '#888',
};

const PRIORITY_COLORS = {
  HIGH: { bg: '#fff1f2', bd: '#fecdd3', fg: '#9f1239' },
  MED: { bg: '#fffbeb', bd: '#fde68a', fg: '#92400e' },
  LOW: { bg: '#eff6ff', bd: '#bfdbfe', fg: '#1d4ed8' },
};

function computePriorityFallback(ticket) {
  const p = String(ticket?.priority || '').toUpperCase();
  if (p === 'HIGH' || p === 'MED' || p === 'LOW') return { value: p, beta: false };
  const cat = String(ticket?.category || '').toLowerCase();
  const msg = String(ticket?.message || '').toLowerCase();
  const paymentKeywords = ['refund', 'stripe', 'charge', 'charged', 'card', 'escrow', 'payment', 'payout', 'transfer'];
  if (cat === 'payments' || paymentKeywords.some((k) => msg.includes(k))) return { value: 'HIGH', beta: true };
  if (cat === 'safety') return { value: 'HIGH', beta: true };
  return { value: 'MED', beta: true };
}

function ageLabel(ts) {
  const ms = toMillis(ts);
  if (!ms) return '—';
  const now = Date.now();
  const h = (now - ms) / (1000 * 60 * 60);
  if (h < 24) return `${Math.max(0, Math.floor(h))}h`;
  const d = h / 24;
  return `${Math.floor(d)}d`;
}

export default function AdminSupportTickets() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [user, loading] = useAuthState(auth);
  const [tickets, setTickets] = useState([]);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [metaBusy, setMetaBusy] = useState(false);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // all|new|in_progress|waiting_on_user|resolved
  const [priorityFilter, setPriorityFilter] = useState('all'); // all|HIGH|MED|LOW
  const [search, setSearch] = useState('');
  const [supportWorkItems, setSupportWorkItems] = useState([]);

  const wfOwner = String(searchParams.get('owner') || '').trim();
  const wfSla = String(searchParams.get('sla') || '').trim();
  const wfWaiting = searchParams.get('waiting') === '1';
  const wfUnassigned = searchParams.get('unassigned') === '1';
  const wfEscalated = searchParams.get('escalated') === '1';

  const setWfParam = useCallback((patch) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(patch).forEach(([k, v]) => {
      if (v === '' || v === false || v == null) next.delete(k);
      else if (v === true) next.set(k, '1');
      else next.set(k, String(v));
    });
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    let alive = true;
    adminApi.get('/api/admin/work-items?entityType=support_ticket')
      .then((r) => {
        if (alive) setSupportWorkItems(Array.isArray(r.data?.items) ? r.data.items : []);
      })
      .catch(() => {
        if (alive) setSupportWorkItems([]);
      });
    return () => { alive = false; };
  }, []);

  const filteredTickets = useMemo(() => {
    const q = String(search || '').trim().toLowerCase();
    return tickets.filter((t) => {
      const s = String(t.status || 'new');
      const normalizedStatus = s === 'open' ? 'new' : s;
      if (statusFilter !== 'all' && normalizedStatus !== statusFilter) return false;
      const pr = computePriorityFallback(t);
      if (priorityFilter !== 'all' && pr.value !== priorityFilter) return false;
      if (!q) return true;
      const hay = [
        t.id,
        t.userUid,
        t.ownerUid,
        t.jobId,
        t.category,
        t.message,
      ].map((x) => String(x || '').toLowerCase()).join(' ');
      return hay.includes(q);
    });
  }, [tickets, statusFilter, priorityFilter, search]);

  const workflowTicketIdSet = useMemo(() => {
    const hasWi =
      (wfOwner && (wfOwner === 'me' || wfOwner === 'unassigned'))
      || (wfSla && (wfSla === 'overdue' || wfSla === 'due_soon'))
      || wfWaiting
      || wfUnassigned;
    if (!hasWi) return null;
    const uid = String(user?.uid || '');
    let rows = [...supportWorkItems];
    if (wfWaiting) rows = rows.filter((w) => String(w.status) === 'waiting');
    if (wfUnassigned) rows = rows.filter((w) => !w.assignedTo);
    const filters = {
      owner: wfOwner === 'me' || wfOwner === 'unassigned' ? wfOwner : '',
      sla: wfSla === 'overdue' || wfSla === 'due_soon' ? wfSla : '',
      followup: '',
      priority: '',
    };
    const set = jobIdsMatchingWorkflowFilters(rows, filters, uid);
    return set;
  }, [supportWorkItems, wfOwner, wfSla, wfWaiting, wfUnassigned, user?.uid]);

  const selectedContextChips = useMemo(
    () => (selectedTicket ? linkedContextChips(selectedTicket) : []),
    [selectedTicket],
  );

  const sortedTickets = useMemo(() => {
    let base = filteredTickets;
    if (wfEscalated) {
      base = base.filter((t) => {
        const e = String(t?.escalationStatus || 'normal').toLowerCase();
        return e === 'priority' || e === 'ops' || e === 'super_admin';
      });
    }
    if (workflowTicketIdSet) {
      base = base.filter((t) => workflowTicketIdSet.has(String(t.id)));
    }
    const orderStatus = { new: 0, open: 0, in_progress: 1, waiting_on_user: 2, resolved: 3, closed: 4 };
    const orderPriority = { HIGH: 0, MED: 1, LOW: 2 };
    return [...base].sort((a, b) => {
      const pa = computePriorityFallback(a).value;
      const pb = computePriorityFallback(b).value;
      const sa = (String(a.status || 'new') === 'open') ? 'new' : String(a.status || 'new');
      const sb = (String(b.status || 'new') === 'open') ? 'new' : String(b.status || 'new');
      if ((orderPriority[pa] ?? 9) !== (orderPriority[pb] ?? 9)) return (orderPriority[pa] ?? 9) - (orderPriority[pb] ?? 9);
      if ((orderStatus[sa] ?? 9) !== (orderStatus[sb] ?? 9)) return (orderStatus[sa] ?? 9) - (orderStatus[sb] ?? 9);
      return toMillis(b.createdAt) - toMillis(a.createdAt);
    });
  }, [filteredTickets, wfEscalated, workflowTicketIdSet]);

  useEffect(() => {
    if (!loading && !user) navigate('/login');
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    const ticketsRef = collection(db, 'supportTickets');
    const q = query(ticketsRef, orderBy('createdAt', 'desc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ticketsList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setTickets(ticketsList);
    }, (err) => {
      console.error('Error fetching tickets:', err);
    });

    return () => unsubscribe();
  }, [user]);

  const patchTicketMeta = async (ticketId, body) => {
    if (!ticketId) return;
    setMetaBusy(true);
    setError('');
    try {
      await adminApi.patch(`/api/admin/support-tickets/${ticketId}`, body);
      setSelectedTicket((prev) => (prev && prev.id === ticketId ? { ...prev, ...body } : prev));
    } catch (err) {
      console.error('PATCH support ticket failed:', err);
      setError(err?.response?.data?.message || 'Failed to update ticket metadata.');
    } finally {
      setMetaBusy(false);
    }
  };

  useEffect(() => {
    if (!selectedTicket?.id) return;
    const t = tickets.find((x) => x.id === selectedTicket.id);
    if (t) setSelectedTicket((prev) => (prev && prev.id === t.id ? { ...prev, ...t } : prev));
  }, [tickets, selectedTicket?.id]);

  const updateStatus = async (ticketId, newStatus) => {
    if (!ticketId) return;
    setError('');
    try {
      const ticketRef = doc(db, 'supportTickets', ticketId);
      await updateDoc(ticketRef, {
        status: newStatus,
        updatedAt: serverTimestamp(),
        lastUpdatedBy: 'admin',
        lastAdminActionAt: serverTimestamp(),
        lastAdminActionBy: user?.uid || null,
      });
    } catch (err) {
      console.error('Error updating status:', err);
      setError('Failed to update status. Please try again.');
    }
  };

  const updatePriority = async (ticketId, priority) => {
    if (!ticketId) return;
    const p = String(priority || '').toUpperCase();
    if (p !== 'HIGH' && p !== 'MED' && p !== 'LOW') return;
    setError('');
    try {
      const ticketRef = doc(db, 'supportTickets', ticketId);
      await updateDoc(ticketRef, {
        priority: p,
        updatedAt: serverTimestamp(),
        lastUpdatedBy: 'admin',
        lastAdminActionAt: serverTimestamp(),
        lastAdminActionBy: user?.uid || null,
      });
    } catch (err) {
      console.error('Error updating priority:', err);
      setError('Failed to update priority. Please try again.');
    }
  };

  const submitReply = async () => {
    if (!selectedTicket || !replyText.trim()) return;
    setError('');
    setSubmitting(true);
    
    try {
      const ticketRef = doc(db, 'supportTickets', selectedTicket.id);
      const reply = {
        text: replyText.trim(),
        author: 'admin',
        authorUid: user.uid,
        timestamp: new Date().toISOString()
      };
      
      await updateDoc(ticketRef, {
        replies: arrayUnion(reply),
        status: selectedTicket.status === 'resolved' ? 'in_progress' : (selectedTicket.status || 'in_progress'),
        updatedAt: serverTimestamp(),
        lastUpdatedBy: 'admin',
        lastAdminActionAt: serverTimestamp(),
        lastAdminActionBy: user?.uid || null,
      });
      
      setReplyText('');
      setError('');
    } catch (err) {
      console.error('Error submitting reply:', err);
      setError('Failed to send reply. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A';
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return date.toLocaleString('en-AU', { 
        day: 'numeric', 
        month: 'short', 
        year: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
      });
    } catch {
      return 'N/A';
    }
  };

  if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}>Loading...</div>;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F7F9FA' }}>
      <AppHeader userRole="admin" userName={user?.displayName || ''} userEmail={user?.email || ''} />
      
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '40px 24px' }}>
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ fontFamily: 'Poppins, sans-serif', fontSize: '28px', marginBottom: '8px' }}>
            Support Tickets
          </h1>
          <p style={{ color: '#666', fontSize: '14px' }}>
            View and respond to user support requests
          </p>
        </div>

        {error ? (
          <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', color: '#9f1239', padding: '10px 12px', borderRadius: 10, fontSize: 13, marginBottom: 10 }}>
            {error}
          </div>
        ) : null}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
          {[
            { key: 'all', label: 'All' },
            { key: 'new', label: 'New' },
            { key: 'in_progress', label: 'In progress' },
            { key: 'waiting_on_user', label: 'Waiting on user' },
            { key: 'resolved', label: 'Resolved' },
          ].map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setStatusFilter(s.key)}
              style={{
                height: 36,
                borderRadius: 999,
                border: '1px solid #d1d5db',
                background: statusFilter === s.key ? '#111827' : '#fff',
                color: statusFilter === s.key ? '#fff' : '#374151',
                padding: '0 14px',
                fontWeight: 900,
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              {s.label}
            </button>
          ))}

          <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} style={{ height: 36, borderRadius: 10, border: '1px solid #d1d5db', padding: '0 10px', fontWeight: 900, background: '#fff', color: '#374151' }}>
            <option value="all">All priorities</option>
            <option value="HIGH">High</option>
            <option value="MED">Med</option>
            <option value="LOW">Low</option>
          </select>

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by user, task ID, category, message…"
            style={{ height: 36, minWidth: 280, borderRadius: 10, border: '1px solid #d1d5db', padding: '0 12px', fontWeight: 700 }}
          />
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12, alignItems: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 900, color: '#9ca3af' }}>Workflow</span>
          <button type="button" onClick={() => setWfParam({ owner: wfOwner === 'me' ? '' : 'me' })} style={{ height: 30, borderRadius: 999, border: `1px solid ${wfOwner === 'me' ? '#111827' : '#d1d5db'}`, background: wfOwner === 'me' ? '#111827' : '#fff', color: wfOwner === 'me' ? '#fff' : '#374151', padding: '0 12px', fontWeight: 800, fontSize: 12 }}>
            Assigned to me
          </button>
          <button type="button" onClick={() => setWfParam({ escalated: wfEscalated ? false : true })} style={{ height: 30, borderRadius: 999, border: `1px solid ${wfEscalated ? '#111827' : '#d1d5db'}`, background: wfEscalated ? '#111827' : '#fff', color: wfEscalated ? '#fff' : '#374151', padding: '0 12px', fontWeight: 800, fontSize: 12 }}>
            Escalated
          </button>
          <button type="button" onClick={() => setWfParam({ sla: wfSla === 'overdue' ? '' : 'overdue' })} style={{ height: 30, borderRadius: 999, border: `1px solid ${wfSla === 'overdue' ? '#111827' : '#d1d5db'}`, background: wfSla === 'overdue' ? '#111827' : '#fff', color: wfSla === 'overdue' ? '#fff' : '#374151', padding: '0 12px', fontWeight: 800, fontSize: 12 }}>
            Overdue
          </button>
          <button type="button" onClick={() => setWfParam({ waiting: wfWaiting ? false : true })} style={{ height: 30, borderRadius: 999, border: `1px solid ${wfWaiting ? '#111827' : '#d1d5db'}`, background: wfWaiting ? '#111827' : '#fff', color: wfWaiting ? '#fff' : '#374151', padding: '0 12px', fontWeight: 800, fontSize: 12 }}>
            Waiting
          </button>
          <button type="button" onClick={() => setWfParam({ unassigned: wfUnassigned ? false : true })} style={{ height: 30, borderRadius: 999, border: `1px solid ${wfUnassigned ? '#111827' : '#d1d5db'}`, background: wfUnassigned ? '#111827' : '#fff', color: wfUnassigned ? '#fff' : '#374151', padding: '0 12px', fontWeight: 800, fontSize: 12 }}>
            Unassigned
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: selectedTicket ? '440px 1fr' : '1fr', gap: '24px' }}>
          {/* Tickets List */}
          <div style={{ 
            backgroundColor: '#fff', 
            borderRadius: '12px', 
            border: '1px solid #E0E0E0',
            overflow: 'hidden'
          }}>
            <div style={{ 
              padding: '16px 20px', 
              borderBottom: '1px solid #E0E0E0',
              backgroundColor: '#FAFAFA',
              fontWeight: '600',
              fontSize: '14px'
            }}>
              Tickets ({sortedTickets.length})
            </div>
            
            <div style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              {sortedTickets.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>
                  No tickets yet
                </div>
              ) : (
                sortedTickets.map(ticket => {
                  const normalizedStatus = (String(ticket.status || 'new') === 'open') ? 'new' : String(ticket.status || 'new');
                  const pr = computePriorityFallback(ticket);
                  const pc = PRIORITY_COLORS[pr.value] || PRIORITY_COLORS.MED;
                  return (
                  <div
                    key={ticket.id}
                    onClick={() => setSelectedTicket(ticket)}
                    style={{
                      padding: '16px 20px',
                      borderBottom: '1px solid #F0F0F0',
                      cursor: 'pointer',
                      backgroundColor: selectedTicket?.id === ticket.id ? '#F7F9FA' : '#fff',
                      transition: 'background-color 140ms ease'
                    }}
                    onMouseEnter={(e) => {
                      if (selectedTicket?.id !== ticket.id) e.currentTarget.style.backgroundColor = '#FAFAFA';
                    }}
                    onMouseLeave={(e) => {
                      if (selectedTicket?.id !== ticket.id) e.currentTarget.style.backgroundColor = '#fff';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                      <span style={{
                        fontSize: '11px',
                        fontWeight: '900',
                        color: pc.fg,
                        backgroundColor: pc.bg,
                        border: `1px solid ${pc.bd}`,
                        padding: '2px 8px',
                        borderRadius: '999px',
                        textTransform: 'uppercase'
                      }} title={pr.beta ? 'Priority is computed (beta) — set it explicitly in the detail panel.' : 'Priority'}>
                        {pr.value}{pr.beta ? ' (beta)' : ''}
                      </span>
                      <span style={{
                        fontSize: '11px',
                        fontWeight: '700',
                        color: STATUS_COLORS[normalizedStatus] || '#888',
                        backgroundColor: `${STATUS_COLORS[normalizedStatus] || '#888'}15`,
                        padding: '2px 8px',
                        borderRadius: '4px',
                        textTransform: 'uppercase'
                      }}>
                        {STATUS_LABELS[normalizedStatus] || normalizedStatus}
                      </span>
                      <span style={{
                        fontSize: '11px',
                        fontWeight: '600',
                        color: '#888',
                        textTransform: 'uppercase'
                      }}>
                        {ticket.category}
                      </span>
                      {(() => {
                        const es = escalationChipStyle(ticket.escalationStatus);
                        return es ? (
                          <span style={{
                            fontSize: '10px',
                            fontWeight: '900',
                            color: es.fg,
                            backgroundColor: es.bg,
                            border: `1px solid ${es.bd}`,
                            padding: '2px 8px',
                            borderRadius: '999px',
                            textTransform: 'uppercase',
                          }}>{es.label}</span>
                        ) : null;
                      })()}
                    </div>
                    
                    <div style={{ 
                      fontSize: '13px', 
                      fontWeight: '600', 
                      color: '#222',
                      marginBottom: '4px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {ticket.role === 'tradie' ? '🔧' : '🏠'} {ticket.userUid?.slice(0, 8)}...
                    </div>
                    
                    <div style={{ 
                      fontSize: '12px', 
                      color: '#666',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      marginBottom: '6px'
                    }}>
                      {ticket.message?.slice(0, 80)}...
                    </div>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: '11px', color: '#999' }}>
                      <span>Age: <strong>{ageLabel(ticket.createdAt)}</strong></span>
                      <span>Updated: <strong>{ageLabel(ticket.updatedAt)}</strong></span>
                    </div>

                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setSelectedTicket(ticket); }}
                        style={{ height: 30, borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', padding: '0 10px', fontWeight: 900, cursor: 'pointer', fontSize: 12 }}
                      >
                        View
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); updateStatus(ticket.id, 'resolved'); }}
                        style={{ height: 30, borderRadius: 8, border: 'none', background: '#28A745', color: '#fff', padding: '0 10px', fontWeight: 900, cursor: 'pointer', fontSize: 12 }}
                      >
                        Mark resolved
                      </button>
                    </div>
                  </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Ticket Detail & Reply Panel */}
          {selectedTicket && (
            <div style={{ 
              backgroundColor: '#fff', 
              borderRadius: '12px', 
              border: '1px solid #E0E0E0',
              display: 'flex',
              flexDirection: 'column',
              maxHeight: '70vh'
            }}>
              {/* Header */}
              <div style={{ 
                padding: '20px 24px', 
                borderBottom: '1px solid #E0E0E0',
                backgroundColor: '#FAFAFA'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div>
                    <div style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px', fontFamily: 'Poppins, sans-serif' }}>
                      Ticket #{selectedTicket.id.slice(0, 8)}
                    </div>
                    <div style={{ fontSize: '12px', color: '#666' }}>
                      From: {selectedTicket.role === 'tradie' ? 'Expert' : 'Client'} • {formatDate(selectedTicket.createdAt)}
                    </div>
                    <div style={{ fontSize: 12, color: '#666', marginTop: 6 }}>
                      Age: <strong>{ageLabel(selectedTicket.createdAt)}</strong> • Last updated: <strong>{ageLabel(selectedTicket.updatedAt)}</strong> • Last updated by: <strong>{selectedTicket.lastUpdatedBy || '—'}</strong>
                    </div>
                  </div>
                  
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <select
                      value={(String(selectedTicket.status || 'new') === 'open') ? 'new' : String(selectedTicket.status || 'new')}
                      onChange={(e) => updateStatus(selectedTicket.id, e.target.value)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '6px',
                        border: '1px solid #E0E0E0',
                        fontSize: '12px',
                        fontWeight: '700',
                        cursor: 'pointer',
                        backgroundColor: '#fff'
                      }}
                    >
                      <option value="new">New</option>
                      <option value="in_progress">In progress</option>
                      <option value="waiting_on_user">Waiting on user</option>
                      <option value="resolved">Resolved</option>
                      <option value="closed">Closed (legacy)</option>
                    </select>

                    <select
                      value={computePriorityFallback(selectedTicket).value}
                      onChange={(e) => updatePriority(selectedTicket.id, e.target.value)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '6px',
                        border: '1px solid #E0E0E0',
                        fontSize: '12px',
                        fontWeight: '700',
                        cursor: 'pointer',
                        backgroundColor: '#fff'
                      }}
                      title="Priority"
                    >
                      <option value="HIGH">High</option>
                      <option value="MED">Med</option>
                      <option value="LOW">Low</option>
                    </select>
                  </div>
                </div>
                
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: '600',
                    color: '#666',
                    backgroundColor: '#F0F0F0',
                    padding: '4px 10px',
                    borderRadius: '6px'
                  }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <ReceiptText size={12} strokeWidth={2.2} />
                      {selectedTicket.category}
                    </span>
                  </span>

                  {selectedTicket.attachment && (
                    <span style={{
                      fontSize: '11px',
                      fontWeight: '600',
                      color: '#666',
                      backgroundColor: '#F0F0F0',
                      padding: '4px 10px',
                      borderRadius: '6px'
                    }}>
                      📎 {selectedTicket.attachment.fileName}
                    </span>
                  )}
                </div>

                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #eee' }}>
                  <div style={{ fontSize: 11, fontWeight: 900, color: '#6b7280', marginBottom: 8 }}>Linked context</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    {selectedContextChips.length === 0 ? (
                      <span style={{ fontSize: 12, color: '#9ca3af' }}>No job/user/payment/verification links detected.</span>
                    ) : null}
                    {selectedContextChips.map((c) => (
                      c.kind === 'link' && c.href ? (
                        <Link key={c.key} to={c.href} style={{ fontSize: 11, fontWeight: 900, color: '#0f766e', background: '#ecfdf5', padding: '4px 10px', borderRadius: 999, border: '1px solid #a7f3d0', textDecoration: 'none' }}>
                          {c.label}
                        </Link>
                      ) : (
                        <span key={c.key} style={{ fontSize: 11, fontWeight: 800, color: '#374151', background: '#f3f4f6', padding: '4px 10px', borderRadius: 999, border: '1px solid #e5e7eb' }}>
                          {c.label}
                        </span>
                      )
                    ))}
                  </div>
                </div>

                <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 900, color: '#374151' }}>Escalation</span>
                  <select
                    value={String(selectedTicket.escalationStatus || 'normal').toLowerCase()}
                    disabled={metaBusy}
                    onChange={(e) => patchTicketMeta(selectedTicket.id, { escalationStatus: e.target.value })}
                    style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #E0E0E0', fontSize: 12, fontWeight: 700, background: '#fff' }}
                  >
                    <option value="normal">Normal</option>
                    <option value="priority">Priority</option>
                    <option value="ops">Ops</option>
                    <option value="super_admin">Super admin</option>
                  </select>
                </div>

                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 900, color: '#374151', marginBottom: 6 }}>Linked risk tags</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {LINKED_RISK_OPTIONS.map((opt) => {
                      const cur = Array.isArray(selectedTicket.linkedRiskTypes) ? selectedTicket.linkedRiskTypes.map((x) => String(x || '').toUpperCase()) : [];
                      const on = cur.includes(opt.v);
                      return (
                        <button
                          key={opt.v}
                          type="button"
                          disabled={metaBusy}
                          onClick={() => {
                            const next = on ? cur.filter((x) => x !== opt.v) : [...cur, opt.v];
                            patchTicketMeta(selectedTicket.id, { linkedRiskTypes: next });
                          }}
                          style={{
                            fontSize: 11,
                            fontWeight: 900,
                            borderRadius: 999,
                            border: on ? '1px solid #111827' : '1px solid #d1d5db',
                            background: on ? '#111827' : '#fff',
                            color: on ? '#fff' : '#374151',
                            padding: '4px 10px',
                            cursor: metaBusy ? 'not-allowed' : 'pointer',
                          }}
                        >
                          {opt.l}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Messages */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
                {selectedTicket?.id ? (
                  <AdminWorkflowSection
                    api={adminApi}
                    entityType="support_ticket"
                    entityId={selectedTicket.id}
                    currentUid={user?.uid}
                    styles={supportNotesStyles}
                    defaultOpen
                  />
                ) : null}
                {selectedTicket?.id ? (
                  <AdminEntityNotesSection
                    api={adminApi}
                    entityType="support_ticket"
                    entityId={selectedTicket.id}
                    styles={supportNotesStyles}
                    defaultOpen
                  />
                ) : null}

                {/* Original Message */}
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ 
                    fontSize: '12px', 
                    fontWeight: '600', 
                    color: '#888',
                    marginBottom: '8px'
                  }}>
                    {selectedTicket.role === 'tradie' ? 'TASK EXPERT' : 'CLIENT'}
                  </div>
                  <div style={{ 
                    backgroundColor: '#F7F9FA',
                    padding: '16px',
                    borderRadius: '10px',
                    fontSize: '14px',
                    lineHeight: '1.6',
                    color: '#222'
                  }}>
                    {selectedTicket.message}
                  </div>
                </div>

                {/* Replies */}
                {selectedTicket.replies && selectedTicket.replies.length > 0 && (
                  <div>
                    {selectedTicket.replies.map((reply, idx) => (
                      <div key={idx} style={{ marginBottom: '16px' }}>
                        <div style={{ 
                          fontSize: '12px', 
                          fontWeight: '600', 
                          color: '#14C5C5',
                          marginBottom: '8px'
                        }}>
                          ADMIN RESPONSE
                        </div>
                        <div style={{ 
                          backgroundColor: '#E6F7F7',
                          padding: '16px',
                          borderRadius: '10px',
                          fontSize: '14px',
                          lineHeight: '1.6',
                          color: '#222'
                        }}>
                          {reply.text}
                        </div>
                        <div style={{ fontSize: '11px', color: '#999', marginTop: '6px' }}>
                          {formatDate(reply.timestamp)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Reply Input */}
              <div style={{ 
                padding: '20px 24px', 
                borderTop: '1px solid #E0E0E0',
                backgroundColor: '#FAFAFA'
              }}>
                {error && (
                  <div style={{ 
                    padding: '12px', 
                    backgroundColor: '#FEE', 
                    color: '#C00', 
                    borderRadius: '8px', 
                    fontSize: '13px',
                    marginBottom: '12px'
                  }}>
                    {error}
                  </div>
                )}
                
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Type your response to the user..."
                  style={{
                    width: '100%',
                    minHeight: '100px',
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid #E0E0E0',
                    fontSize: '14px',
                    fontFamily: 'Inter, sans-serif',
                    resize: 'vertical',
                    marginBottom: '12px'
                  }}
                />
                
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                  <button
                    onClick={() => setSelectedTicket(null)}
                    style={{
                      padding: '10px 20px',
                      borderRadius: '8px',
                      border: '1px solid #E0E0E0',
                      backgroundColor: '#fff',
                      color: '#666',
                      fontSize: '14px',
                      fontWeight: '600',
                      cursor: 'pointer'
                    }}
                  >
                    Close
                  </button>
                  
                  <button
                    onClick={submitReply}
                    disabled={!replyText.trim() || submitting}
                    style={{
                      padding: '10px 24px',
                      borderRadius: '8px',
                      border: 'none',
                      backgroundColor: submitting || !replyText.trim() ? '#CCC' : '#14C5C5',
                      color: '#fff',
                      fontSize: '14px',
                      fontWeight: '600',
                      cursor: submitting || !replyText.trim() ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {submitting ? 'Sending...' : 'Send Reply'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

