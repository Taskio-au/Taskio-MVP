// src/components/AppHeader.js
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { Bell, CircleHelp, CreditCard, LogOut, MessageSquare, Settings, Star, User } from 'lucide-react';
import { auth, db } from '../firebase';
import { signOut } from 'firebase/auth';
import { collection, limit, onSnapshot, query, where } from 'firebase/firestore';
import BrandLogo from '../design/components/BrandLogo';
import { getRoleDisplayLabel } from '../utils/roleLabels';
import { useChatThreads, useNotificationUnreadCount } from '../hooks/useMessagingSummary';

function AppHeader({ userRole = 'homeowner', userName = '', userEmail = '' }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [user] = useAuthState(auth);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuWrapRef = useRef(null);
  const [adminCounts, setAdminCounts] = useState({
    monitoring: 0,
    support: 0,
    profileChanges: 0,
  });
  const messagingUser = userRole === 'admin' ? null : user;
  const { unreadCount: unreadMessageCount } = useChatThreads(messagingUser, 100);
  const unreadNotificationCount = useNotificationUnreadCount(messagingUser, 100);

  const userInitials = React.useMemo(() => {
    if (userName) {
      const names = userName.split(' ');
      return names.map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    if (userEmail) {
      return userEmail.slice(0, 2).toUpperCase();
    }
    const label = getRoleDisplayLabel(userRole);
    return label
      .split(' ')
      .map((part) => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }, [userName, userEmail, userRole]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/');
    } catch (error) {
      console.error('Failed to log out:', error);
    }
  };

  const getNavItems = () => {
    if (userRole === 'tradie') {
      return [
        { label: 'Dashboard', path: '/tradie/dashboard' },
        { label: 'Tasks', path: '/tradie/jobs' },
        { label: 'Messages', path: '/messages', badgeKey: 'messages' },
      ];
    } else if (userRole === 'homeowner') {
      return [
        { label: 'Dashboard', path: '/dashboard' },
        { label: 'Post a Task', path: '/post-job' },
        { label: 'Messages', path: '/messages', badgeKey: 'messages' },
      ];
    } else if (userRole === 'admin') {
      return [
        { label: 'Dashboard', path: '/admin/dashboard' },
        { label: 'Daily checklist', path: '/admin/daily-checklist' },
        { label: 'Monitoring', path: '/admin/monitoring', badgeKey: 'monitoring' },
        { label: 'Profile changes', path: '/admin/profile-change-requests', badgeKey: 'profileChanges' },
        { label: 'Support tickets', path: '/admin/support', badgeKey: 'support' },
      ];
    }
    return [];
  };

  const getMenuItems = () => {
    if (userRole === 'admin') {
      return [
        { label: 'My Profile', path: '/admin/profile', icon: User },
        { label: 'Password', path: '/admin/password', icon: Settings },
        // Admin operational areas are in the top nav; keep menu minimal.
      ];
    }
    return [
      { label: 'My Profile', path: '/profile', icon: User },
      { label: 'Payments & Billing', path: '/payments', icon: CreditCard },
      { label: 'Messages', path: '/messages', icon: MessageSquare },
      { label: 'Notifications', path: '/notifications', icon: Bell },
      ...(userRole === 'homeowner' ? [{ label: 'Account Settings', path: '/settings', icon: Settings }] : []),
      ...(userRole === 'tradie' ? [
        { label: 'Reviews & ratings', path: '/tradie/reviews', icon: Star },
        { label: 'Account Settings', path: '/tradie/account-settings', icon: Settings },
      ] : []),
      { label: 'Help & Support', path: '/support', icon: CircleHelp }
    ];
  };

  const getDashboardPath = () => {
    if (!user) return '/';
    if (userRole === 'tradie') return '/tradie/dashboard';
    if (userRole === 'admin') return '/admin/dashboard';
    return '/dashboard'; // homeowner default
  };

  const navItems = getNavItems();
  const menuItems = getMenuItems();
  const dashboardPath = getDashboardPath();
  const isCurrentPath = (path) => location.pathname === path;

  // Admin badge counts (real-time)
  useEffect(() => {
    if (!user || userRole !== 'admin') return undefined;

    const unsubs = [];

    // Jobs requiring admin attention (monitoring)
    try {
      const qJobs = query(collection(db, 'jobs'), where('requiresAdminAttention', '==', true), limit(200));
      unsubs.push(onSnapshot(qJobs, (snap) => {
        setAdminCounts((p) => ({ ...p, monitoring: snap.size || 0 }));
      }, () => {
        // keep silent; admin pages already surface auth errors
      }));
    } catch (_) { /* ignore */ }

    // Open support tickets (new workflow: new → in_progress → waiting_on_user → resolved)
    try {
      const qTickets = query(
        collection(db, 'supportTickets'),
        where('status', 'in', ['new', 'open', 'in_progress', 'waiting_on_user']),
        limit(200)
      );
      unsubs.push(onSnapshot(qTickets, (snap) => {
        setAdminCounts((p) => ({ ...p, support: snap.size || 0 }));
      }, () => {
        // keep silent
      }));
    } catch (_) { /* ignore */ }

    // Pending profile change requests
    try {
      const qChanges = query(collection(db, 'profile_change_requests'), where('status', '==', 'pending'), limit(200));
      unsubs.push(onSnapshot(qChanges, (snap) => {
        const count = snap.size || 0;
        console.log('[AppHeader] Profile change requests (pending):', count, 'docs:', snap.docs.map(d => d.id));
        setAdminCounts((p) => ({ ...p, profileChanges: count }));
      }, (err) => {
        // If rules deny this read, we'd otherwise silently show 0 forever.
        console.error('Admin badge listener failed (profile_change_requests):', err);
      }));
    } catch (_) { /* ignore */ }

    return () => {
      unsubs.forEach((fn) => {
        try { fn && fn(); } catch (_) { /* ignore */ }
      });
    };
  }, [user, userRole]);

  const getBadgeCountForItem = (item) => {
    if (!item?.badgeKey) return 0;
    if (item.badgeKey === 'messages') return unreadMessageCount;
    if (userRole !== 'admin') return 0;
    return Number(adminCounts?.[item.badgeKey] || 0);
  };

  const renderBadge = (count) => {
    const n = Number(count || 0);
    const text = n > 99 ? '99+' : String(Math.max(n, 0));
    // Always show a number for admin operational menus (0 is useful as a "nothing to review" indicator).
    return (
      <span
        style={n > 0 ? styles.navBadge : styles.navBadgeZero}
        aria-label={`${text} items`}
      >
        {text}
      </span>
    );
  };

  const renderBadgePlaceholder = () => (
    <span style={styles.navBadgePlaceholder} aria-hidden="true">0</span>
  );

  useEffect(() => {
    if (!isMenuOpen) return undefined;
    const onDown = (e) => {
      const t = e.target;
      if (menuWrapRef.current && menuWrapRef.current.contains(t)) return;
      setIsMenuOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setIsMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [isMenuOpen]);

  const accountMenuId = 'app-header-account-menu';

  return (
    <>
      <a href="#main-content" className="taskio-skip-link">
        Skip to main content
      </a>
      <style>{`
        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        /*
         * Expert (tradie): three direct children — logo, nav, utilities.
         * Mobile (<=900px): CSS grid — row1 logo | utils; row2 full-width nav only (no squeeze).
         */
        @media (max-width: 900px) {
          .app-header--expert {
            display: grid !important;
            grid-template-columns: minmax(0, 1fr) auto;
            grid-template-rows: auto auto;
            grid-template-areas:
              "exlogo exutil"
              "exnav exnav";
            height: auto !important;
            min-height: auto;
            padding: 10px 14px 12px !important;
            gap: 10px 12px;
            align-items: center;
            justify-content: stretch;
          }
          .app-header-expert-logo {
            grid-area: exlogo;
            min-width: 0;
            max-width: 100%;
          }
          .app-header-expert-utils {
            grid-area: exutil;
            justify-self: end;
            flex-shrink: 0;
          }
          .app-header-expert-primary-nav {
            grid-area: exnav;
            width: 100% !important;
            min-width: 0 !important;
            max-width: 100% !important;
            display: grid !important;
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            gap: 3px !important;
            overflow: visible !important;
            padding: 3px !important;
            margin: 0 !important;
            box-sizing: border-box !important;
            background: #EEF0F3 !important;
            border-radius: 11px !important;
            border: 1px solid #E2E5EA !important;
          }
          .app-header-expert-primary-nav .app-header-nav-link {
            display: flex !important;
            flex-direction: row !important;
            justify-content: center !important;
            align-items: center !important;
            text-align: center;
            white-space: nowrap !important;
            min-width: 0 !important;
            min-height: 44px;
            padding: 0 4px !important;
            font-size: clamp(12px, 3.15vw, 13px) !important;
            letter-spacing: -0.01em;
            line-height: 1.2 !important;
            box-sizing: border-box;
            border-radius: 9px;
            color: #4B5563 !important;
            background: transparent !important;
            font-weight: 600 !important;
          }
          .app-header-expert-primary-nav .app-header-nav-link[aria-current="page"] {
            background: #FFFFFF !important;
            color: #0F766E !important;
            font-weight: 700 !important;
            box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
          }
          .app-header--expert .app-header-expert-nav-label {
            flex-direction: row !important;
            align-items: center !important;
            justify-content: center !important;
            gap: 4px !important;
            flex-wrap: nowrap !important;
          }
          .app-header--expert .app-header-nav-badge-mobile {
            min-width: 16px !important;
            height: 16px !important;
            padding: 0 4px !important;
            font-size: 9px !important;
            line-height: 16px !important;
          }
          .app-header-expert-primary-nav .app-header-nav-link:hover {
            background: rgba(255, 255, 255, 0.55) !important;
            color: #374151 !important;
          }
          .app-header-expert-primary-nav .app-header-nav-link[aria-current="page"]:hover {
            background: #FFFFFF !important;
            color: #0F766E !important;
          }
        }
        @media (max-width: 640px) {
          .app-header-expert-logo {
            transform: scale(0.93);
            transform-origin: left center;
          }
          .app-header--expert {
            padding-left: 12px !important;
            padding-right: 12px !important;
            gap: 8px 10px !important;
          }
        }
        @media (min-width: 901px) {
          .app-header--expert {
            display: flex !important;
            flex-direction: row !important;
            height: 70px !important;
            padding: 0 32px !important;
            align-items: center !important;
            justify-content: flex-start !important;
            gap: 0 !important;
          }
          .app-header-expert-logo {
            flex-shrink: 0;
            transform: none !important;
          }
          .app-header-expert-primary-nav {
            flex: 1 1 auto !important;
            margin-left: 48px !important;
            min-width: 0 !important;
            display: flex !important;
            gap: 8px !important;
            width: auto !important;
            background: transparent !important;
            border: none !important;
            padding: 0 !important;
            border-radius: 0 !important;
            grid-template-columns: none !important;
          }
          .app-header-expert-primary-nav .app-header-nav-link {
            font-size: 14px !important;
            padding: 10px 18px !important;
            min-height: auto !important;
            color: #374151 !important;
            background: transparent !important;
            font-weight: 600 !important;
            white-space: nowrap !important;
          }
          .app-header-expert-primary-nav .app-header-nav-link[aria-current="page"] {
            background: #F0FDFD !important;
            color: #14C5C5 !important;
            font-weight: 700 !important;
            box-shadow: none !important;
          }
          .app-header-expert-utils {
            margin-left: auto !important;
            flex-shrink: 0 !important;
          }
        }
        @media (max-width: 480px) {
          .app-header-profile-menu {
            width: min(calc(100vw - 24px), 300px) !important;
            max-height: min(72vh, 560px);
            overflow-y: auto;
            -webkit-overflow-scrolling: touch;
          }
          .app-header-menu-item-touch {
            padding-top: 14px !important;
            padding-bottom: 14px !important;
            min-height: 48px;
            box-sizing: border-box;
          }
        }
        
        .app-header-nav-link:hover {
          color: '#14C5C5';
          background-color: #F9FAFB;
        }
        .app-header-logo-link:hover {
          transform: translateY(-2px);
        }
        .app-header-profile-btn:hover {
          transform: scale(1.05);
          background-color: #0EA5A5;
          box-shadow: 0 4px 12px rgba(20, 197, 197, 0.35);
        }
        .app-header-menu-item:hover {
          background-color: #F9FAFB;
          padding-left: 24px;
        }
        .app-header-menu-item-logout:hover {
          background-color: #FEF2F2;
          color: #DC2626 !important;
        }
      `}</style>
      
      <header
        style={styles.header}
        className={userRole === 'tradie' ? 'app-header app-header--expert' : 'app-header'}
      >
        {userRole === 'tradie' ? (
          <>
            <div
              className="app-header-expert-logo app-header-logo-cell"
              style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}
            >
              <BrandLogo to={dashboardPath} compact style={styles.logoLink} />
            </div>
            <nav
              style={styles.nav}
              className="app-header__nav app-header-expert-primary-nav"
              aria-label="Primary navigation"
            >
              {navItems.map((item) => (
                <a
                  key={item.path}
                  href={item.path}
                  className="app-header-nav-link"
                  aria-current={isCurrentPath(item.path) ? 'page' : undefined}
                  style={{
                    ...styles.navLink,
                    ...(isCurrentPath(item.path) ? styles.navLinkActive : {}),
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    navigate(item.path);
                  }}
                >
                  <span style={styles.navLabelOnly} className="app-header-expert-nav-label">
                    <span>{item.label}</span>
                    {item.badgeKey && getBadgeCountForItem(item) > 0 ? (
                      <span style={styles.navBadgeCompact} className="app-header-nav-badge-mobile">
                        {getBadgeCountForItem(item) > 99 ? '99+' : getBadgeCountForItem(item)}
                      </span>
                    ) : null}
                  </span>
                </a>
              ))}
            </nav>
            <div style={styles.headerRight} className="app-header__right app-header-expert-utils">
              <button
                type="button"
                onClick={() => navigate('/notifications')}
                style={styles.iconButton}
                aria-label={`Notifications${unreadNotificationCount > 0 ? ` (${unreadNotificationCount} unread)` : ''}`}
              >
                <Bell size={18} strokeWidth={2.2} />
                {unreadNotificationCount > 0 ? (
                  <span style={styles.iconBadge}>
                    {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
                  </span>
                ) : null}
              </button>
              <div ref={menuWrapRef} style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => setIsMenuOpen(!isMenuOpen)}
                  className="app-header-profile-btn"
                  style={styles.profileBtn}
                  aria-label="Account menu"
                  aria-expanded={isMenuOpen}
                  aria-haspopup="true"
                  aria-controls={accountMenuId}
                >
                  {userInitials}
                </button>

                {isMenuOpen && (
                  <div
                    id={accountMenuId}
                    style={styles.profileMenu}
                    className="app-header-profile-menu"
                    role="region"
                    aria-label="Account menu"
                  >
                    <div style={styles.menuHeader}>
                      <div style={styles.menuName}>{userName || 'User'}</div>
                      <div style={styles.menuEmail}>{userEmail}</div>
                    </div>
                    {menuItems.map((item) => (
                      <a
                        key={item.path}
                        href={item.path}
                        className="app-header-menu-item app-header-menu-item-touch"
                        style={styles.menuItem}
                        onClick={(e) => {
                          e.preventDefault();
                          navigate(item.path);
                          setIsMenuOpen(false);
                        }}
                      >
                        <span style={styles.menuIcon}>{item.icon ? <item.icon size={18} strokeWidth={2} /> : null}</span>
                        <span>{item.label}</span>
                      </a>
                    ))}
                    <div style={styles.menuDivider} />
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="app-header-menu-item app-header-menu-item-logout app-header-menu-item-touch"
                      style={{ ...styles.menuItem, color: '#EF4444', fontWeight: '600' }}
                    >
                      <span style={styles.menuIcon}><LogOut size={18} strokeWidth={2} /></span>
                      <span>Logout</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <>
            <div style={styles.headerLeft} className="app-header__left">
              <div className="app-header-logo-cell" style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
                <BrandLogo to={dashboardPath} compact style={styles.logoLink} />
              </div>

              <nav style={styles.nav} className="app-header__nav" aria-label="Primary navigation">
                {navItems.map((item) => (
                  <a
                    key={item.path}
                    href={item.path}
                    className="app-header-nav-link"
                    aria-current={isCurrentPath(item.path) ? 'page' : undefined}
                    style={{
                      ...styles.navLink,
                      ...(isCurrentPath(item.path) ? styles.navLinkActive : {}),
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      navigate(item.path);
                    }}
                  >
                    {userRole === 'admin' ? (
                      <span style={styles.navLinkInnerColumn}>
                        <span style={styles.navLabel}>{item.label}</span>
                        {item.badgeKey ? renderBadge(getBadgeCountForItem(item)) : renderBadgePlaceholder()}
                      </span>
                    ) : (
                      <span style={styles.navLabelOnly}>
                        <span>{item.label}</span>
                        {item.badgeKey && getBadgeCountForItem(item) > 0 ? (
                          <span style={styles.navBadgeCompact}>
                            {getBadgeCountForItem(item) > 99 ? '99+' : getBadgeCountForItem(item)}
                          </span>
                        ) : null}
                      </span>
                    )}
                  </a>
                ))}
              </nav>
            </div>

            <div style={styles.headerRight} className="app-header__right">
              {userRole !== 'admin' && (
                <button
                  type="button"
                  onClick={() => navigate('/notifications')}
                  style={styles.iconButton}
                  aria-label={`Notifications${unreadNotificationCount > 0 ? ` (${unreadNotificationCount} unread)` : ''}`}
                >
                  <Bell size={18} strokeWidth={2.2} />
                  {unreadNotificationCount > 0 ? (
                    <span style={styles.iconBadge}>
                      {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
                    </span>
                  ) : null}
                </button>
              )}
              <div ref={menuWrapRef} style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => setIsMenuOpen(!isMenuOpen)}
                  className="app-header-profile-btn"
                  style={styles.profileBtn}
                  aria-label="Account menu"
                  aria-expanded={isMenuOpen}
                  aria-haspopup="true"
                  aria-controls={accountMenuId}
                >
                  {userInitials}
                </button>

                {isMenuOpen && (
                  <div
                    id={accountMenuId}
                    style={styles.profileMenu}
                    className="app-header-profile-menu"
                    role="region"
                    aria-label="Account menu"
                  >
                    <div style={styles.menuHeader}>
                      <div style={styles.menuName}>{userName || 'User'}</div>
                      <div style={styles.menuEmail}>{userEmail}</div>
                    </div>
                    {menuItems.map((item) => (
                      <a
                        key={item.path}
                        href={item.path}
                        className="app-header-menu-item app-header-menu-item-touch"
                        style={styles.menuItem}
                        onClick={(e) => {
                          e.preventDefault();
                          navigate(item.path);
                          setIsMenuOpen(false);
                        }}
                      >
                        <span style={styles.menuIcon}>{item.icon ? <item.icon size={18} strokeWidth={2} /> : null}</span>
                        <span>{item.label}</span>
                      </a>
                    ))}
                    <div style={styles.menuDivider} />
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="app-header-menu-item app-header-menu-item-logout app-header-menu-item-touch"
                      style={{ ...styles.menuItem, color: '#EF4444', fontWeight: '600' }}
                    >
                      <span style={styles.menuIcon}><LogOut size={18} strokeWidth={2} /></span>
                      <span>Logout</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </header>
    </>
  );
}

const styles = {
  header: {
    position: 'sticky',
    top: 0,
    zIndex: 10,
    background: '#FFFFFF',
    backgroundImage: 'none',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04)',
    borderBottom: '1px solid #E5E7EB',
    padding: '0 32px',
    height: '70px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '48px'
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px'
  },
  logoLink: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    textDecoration: 'none',
    backgroundColor: 'transparent',
    padding: '8px 4px',
    borderRadius: '12px',
    transition: 'all 0.2s',
    minHeight: '48px',
  },
  nav: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center'
  },
  navLink: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#374151',
    textDecoration: 'none',
    padding: '10px 18px',
    borderRadius: '10px',
    transition: 'all 0.2s',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    height: 'auto',
    backgroundColor: 'transparent',
  },
  navLinkInnerColumn: {
    display: 'inline-flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
    lineHeight: 1.1,
  },
  navLabel: {
    display: 'inline-block',
    lineHeight: '18px',
  },
  navLabelOnly: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    lineHeight: '18px',
  },
  navBadgeCompact: {
    minWidth: 18,
    height: 18,
    padding: '0 6px',
    borderRadius: 999,
    backgroundColor: '#FF9100',
    color: '#fff',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 10,
    fontWeight: 900,
    lineHeight: 1,
    boxShadow: '0 2px 6px rgba(255, 145, 0, 0.3)',
  },
  navBadge: {
    minWidth: 20,
    height: 20,
    padding: '0 7px',
    borderRadius: 999,
    backgroundColor: '#FF9100', // Taskio Orange
    color: '#fff',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 11,
    fontWeight: 900,
    lineHeight: 1,
    boxShadow: '0 2px 6px rgba(255, 145, 0, 0.4)',
  },
  navBadgeZero: {
    minWidth: 20,
    height: 20,
    padding: '0 7px',
    borderRadius: 999,
    backgroundColor: '#F3F4F6',
    color: '#6B7280',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 11,
    fontWeight: 900,
    lineHeight: 1,
    border: '1px solid #E5E7EB',
  },
  navBadgePlaceholder: {
    minWidth: 20,
    height: 20,
    padding: '0 7px',
    borderRadius: 999,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 11,
    fontWeight: 900,
    lineHeight: 1,
    visibility: 'hidden', // keeps layout aligned without showing a number
  },
  navLinkActive: {
    color: '#14C5C5',
    backgroundColor: '#F0FDFD',
    fontWeight: '700',
  },
  iconButton: {
    position: 'relative',
    width: 44,
    height: 44,
    borderRadius: 999,
    border: '1px solid #E5E7EB',
    background: '#fff',
    color: '#374151',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  iconBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 18,
    height: 18,
    padding: '0 5px',
    borderRadius: 999,
    backgroundColor: '#FF9100',
    color: '#fff',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 10,
    fontWeight: 900,
    lineHeight: 1,
    boxShadow: '0 2px 6px rgba(255, 145, 0, 0.3)',
  },
  profileBtn: {
    width: '44px',
    height: '44px',
    borderRadius: '50%',
    backgroundColor: '#14C5C5',
    color: '#FFFFFF',
    border: 'none',
    fontSize: '14px',
    fontWeight: '700',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'transform 0.2s, box-shadow 0.2s, background-color 0.2s',
    boxShadow: '0 2px 8px rgba(20, 197, 197, 0.25)',
  },
  profileMenu: {
    position: 'absolute',
    top: '56px',
    right: 0,
    backgroundColor: '#FFFFFF',
    backgroundImage: 'none',
    borderRadius: '16px',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.08)',
    zIndex: 20,
    width: '280px',
    overflow: 'hidden',
    border: '1px solid rgba(0, 0, 0, 0.06)',
    animation: 'slideDown 0.2s ease-out',
  },
  menuHeader: {
    padding: '20px 20px 16px 20px',
    borderBottom: '1px solid #F0F0F0',
    backgroundColor: '#FAFBFC',
  },
  menuName: {
    fontWeight: '700',
    color: '#111827',
    marginBottom: '4px',
    fontSize: '15px',
    fontFamily: 'Poppins, sans-serif',
  },
  menuEmail: {
    fontSize: '13px',
    color: '#6B7280',
    wordBreak: 'break-word',
  },
  menuItem: {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    padding: '12px 20px',
    color: '#374151',
    textDecoration: 'none',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    textAlign: 'left',
    transition: 'all 0.15s ease',
    gap: '12px',
  },
  menuIcon: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.82,
  },
  menuDivider: {
    height: '1px',
    backgroundColor: '#F0F0F0',
    margin: '8px 0',
  }
};

export default AppHeader;
