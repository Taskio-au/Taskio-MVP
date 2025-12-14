import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { auth } from './firebase';
import { Link } from 'react-router-dom';
import StatusTag from './StatusTag';
import VerificationBadge from './VerificationBadge';

const api = axios.create({
    baseURL: 'http://localhost:8000'
});

const expertiseOptions = [
    'all', 'plumbing', 'electrical', 'cleaning', 'painting', 'gardening', 'handyman', 'carpentry', 'tiling'
];

function Dashboard() {
  const [jobs, setJobs]         = useState([]);
  const [users, setUsers]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [sortOrder, setSortOrder] = useState('newest');
  const [openMenu, setOpenMenu] = useState(null); // Tracks which user's menu is open
  const [expertiseFilter, setExpertiseFilter] = useState('all');

  const fetchData = async () => {
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("No user is logged in.");
      
      const token = await user.getIdToken(true);
      const config = { headers: { Authorization: `Bearer ${token}` } };

      const [jobsResponse, usersResponse] = await Promise.all([
        api.get('/api/admin/jobs', config),
        api.get('/api/admin/users', config)
      ]);

      setJobs(jobsResponse.data);
      setUsers(usersResponse.data);

    } catch (err) {
      setError('Failed to fetch data. You may not be an admin.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // Optional: Add a listener to refetch data on window focus
    window.addEventListener('focus', fetchData);
    return () => window.removeEventListener('focus', fetchData);
  }, []);

  const handleVerify = async (uid) => {
    try {
      const token = await auth.currentUser.getIdToken(true);
      const config = { headers: { Authorization: `Bearer ${token}` } };
      await api.put(`/api/admin/users/${uid}/verify`, null, config);
      fetchData(); // Refetch all data to ensure consistency
    } catch (err) {
      console.error("Failed to verify user:", err);
      alert("Error: Could not verify user.");
    }
  };

  const handleStatusChange = async (uid, currentStatus) => {
    const newStatus = currentStatus === 'active' ? 'disabled' : 'active';
    try {
      const token = await auth.currentUser.getIdToken(true);
      const config = { headers: { Authorization: `Bearer ${token}` } };
      await api.put(`/api/admin/users/${uid}/status`, { status: newStatus }, config);
      fetchData(); // Refetch all data
    } catch (err) {
      console.error("Failed to update status:", err);
      alert("Error: Could not update user status.");
    }
  };

  const sortedJobs = useMemo(() => {
    return [...jobs].sort((a, b) => {
      const dateA = a.createdAt?._seconds || 0;
      const dateB = b.createdAt?._seconds || 0;
      return sortOrder === 'newest' ? dateB - dateA : dateA - dateB;
    });
  }, [jobs, sortOrder]);

  if (loading) return <div style={styles.centered}>Loading dashboard...</div>;
  if (error) return <div style={{...styles.centered, color: 'red'}}>Error: {error}</div>;
  
  const tradies = users.filter(user => user.role === 'tradie');
  const homeowners = users.filter(user => user.role === 'homeowner');

  const filteredTradies = expertiseFilter === 'all' 
    ? tradies 
    : tradies.filter(t => t.expertise && t.expertise.includes(expertiseFilter));

  return (
    <div style={styles.container}>
      <h1 style={styles.header}>Taskio Admin Dashboard</h1>
      
      {/* Job Monitoring Section */}
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <h2 style={styles.sectionTitle}>Job Monitoring</h2>
          <button onClick={() => setSortOrder(sortOrder === 'newest' ? 'oldest' : 'newest')} style={styles.button}>
            Sort by: {sortOrder === 'newest' ? 'Newest First' : 'Oldest First'}
          </button>
        </div>
        
        {jobs.length > 0 ? (
          <ul style={styles.list}>
            {sortedJobs.map(job => (
              <li key={job.id} style={styles.listItem}>
                <div style={styles.jobInfo}>
                  <Link to={`/admin/job/${job.id}`} style={styles.jobLink}>{job.title}</Link>
                  <p style={styles.jobDescription}>{job.description}</p>
                  <small style={styles.smallText}>
                    Invited Tradies: {(job.invitedTradieUids || []).length} | Posted: {job.createdAt ? new Date(job.createdAt._seconds * 1000).toLocaleDateString('en-AU') : 'N/A'}
                  </small>
                </div>
                <StatusTag status={job.status} />
              </li>
            ))}
          </ul>
        ) : <p>No jobs found.</p>}
      </div>

      {/* User Management Section */}
      <div style={styles.card}>
         <h2 style={styles.sectionTitle}>User Management</h2>

         {/* Tradies Sub-section */}
         <div style={styles.cardHeader}>
           <h3 style={styles.subSectionTitle}>Tradies ({filteredTradies.length})</h3>
           <select 
             value={expertiseFilter} 
             onChange={(e) => setExpertiseFilter(e.target.value)}
             style={styles.filterSelect}
           >
              {expertiseOptions.map(opt => <option key={opt} value={opt}>{opt.charAt(0).toUpperCase() + opt.slice(1)}</option>)}
           </select>
         </div>
         
         {filteredTradies.length > 0 ? (
           <ul style={styles.list}>
             {filteredTradies.map(user => (
               <li key={user.uid} style={styles.listItem}>
                 <div>
                   <strong style={styles.userEmail}>{user.email}</strong>
                   <VerificationBadge verified={user.verified} />
                   <br/>
                   <small style={styles.smallText}>Status: {user.status}</small>
                 </div>
                 <div style={{ position: 'relative' }}>
                   <button onClick={() => setOpenMenu(openMenu === user.uid ? null : user.uid)} style={styles.actionsButton}>Actions</button>
                   {openMenu === user.uid && (
                     <div style={styles.dropdownMenu}>
                       <button onClick={() => { handleStatusChange(user.uid, user.status); setOpenMenu(null); }} style={styles.menuItem}>
                         {user.status === 'active' ? 'Disable' : 'Enable'}
                       </button>
                       <button 
                         onClick={() => { if (!user.verified) { handleVerify(user.uid); setOpenMenu(null); } }} 
                         disabled={user.verified}
                         style={{...styles.menuItem, cursor: user.verified ? 'not-allowed' : 'pointer', color: user.verified ? '#BDBDBD' : '#222222'}}
                       >
                         Verify
                       </button>
                     </div>
                   )}
                 </div>
               </li>
             ))}
           </ul>
         ) : <p>No tradies found with the selected expertise.</p>}

         {/* Homeowners Sub-section */}
         <div style={styles.cardHeader}>
             <h3 style={styles.subSectionTitle}>Homeowners ({homeowners.length})</h3>
         </div>
         {homeowners.length > 0 ? (
           <ul style={styles.list}>
               {homeowners.map(user => (
                    <li key={user.uid} style={styles.listItem}>
                       <div>
                           <strong style={styles.userEmail}>{user.email}</strong><br/>
                           <small style={styles.smallText}>Status: {user.status}</small>
                       </div>
                       <div style={{ position: 'relative' }}>
                           <button onClick={() => setOpenMenu(openMenu === user.uid ? null : user.uid)} style={styles.actionsButton}>Actions</button>
                           {openMenu === user.uid && (
                               <div style={styles.dropdownMenu}>
                                   <button onClick={() => { handleStatusChange(user.uid, user.status); setOpenMenu(null); }} style={styles.menuItem}>
                                       {user.status === 'active' ? 'Disable' : 'Enable'}
                                   </button>
                               </div>
                           )}
                       </div>
                    </li>
               ))}
           </ul>
         ) : <p>No homeowners found.</p>}
      </div>
    </div>
  );
}

const styles = {
    container: { padding: '20px', fontFamily: 'Inter, sans-serif', backgroundColor: '#F7F9FA', minHeight: '100vh' },
    centered: { textAlign: 'center', paddingTop: '50px' },
    header: { fontFamily: 'Poppins, sans-serif', color: '#222222' },
    card: { backgroundColor: '#FFFFFF', borderRadius: '8px', padding: '20px', marginBottom: '20px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' },
    cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', borderBottom: '1px solid #E0E0E0', paddingBottom: '10px' },
    sectionTitle: { fontFamily: 'Poppins, sans-serif', margin: 0 },
    subSectionTitle: { fontFamily: 'Poppins, sans-serif', margin: 0, fontSize: '16px' },
    button: { padding: '8px 12px', borderRadius: '4px', border: '1px solid #E0E0E0', background: 'white', cursor: 'pointer' },
    list: { listStyle: 'none', padding: 0 },
    listItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 0', borderBottom: '1px solid #F0F0F0' },
    jobInfo: { flex: 1 },
    jobLink: { textDecoration: 'none', color: '#14C5C5', fontFamily: 'Poppins, sans-serif', fontWeight: '500' },
    jobDescription: { margin: '4px 0', color: '#555' },
    smallText: { color: '#6c757d', fontSize: '12px' },
    userEmail: { marginRight: '10px' },
    filterSelect: { padding: '5px 10px', borderRadius: '4px', border: '1px solid #ccc' },
    actionsButton: { padding: '5px 10px', backgroundColor: '#f0f0f0', border: '1px solid #ccc', borderRadius: '4px' },
    dropdownMenu: { position: 'absolute', right: 0, top: '100%', backgroundColor: 'white', border: '1px solid #E0E0E0', borderRadius: '4px', zIndex: 10, width: '120px', boxShadow: '0 2px 5px rgba(0,0,0,0.15)' },
    menuItem: { display: 'block', width: '100%', background: 'none', border: 'none', padding: '8px', textAlign: 'left', cursor: 'pointer', color: '#222222' }
};

export default Dashboard;

