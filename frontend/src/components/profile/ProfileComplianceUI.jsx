import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, Circle, Clock3, Lock, Zap } from 'lucide-react';

/**
 * LockedField - Wrapper for fields that should be locked after verification
 * Shows a lock icon and tooltip explaining why the field is locked
 */
export function LockedField({ locked, label, tooltip, children, style }) {
  if (!locked) {
    return children;
  }

  return (
    <div style={{ position: 'relative', ...style }}>
      {children}
      <div
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          background: 'rgba(249, 250, 251, 0.95)',
          borderRadius: 8,
          border: '1px solid #E5E7EB',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'not-allowed',
          zIndex: 1,
        }}
        title={tooltip || 'This field is locked for verified accounts'}
      >
        <div style={{ textAlign: 'center', padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
            <Lock size={24} strokeWidth={2} color="#111827" />
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', marginBottom: 4 }}>
            {label || 'Field Locked'}
          </div>
          <div style={{ fontSize: 12, color: '#6B7280', maxWidth: 200 }}>
            {tooltip || 'Contact support to change verified details'}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * ReadinessSummary - Display verification checklist for Task Experts
 * Shows progress towards being able to quote on tasks
 */
export function ReadinessSummary({ checklist, compact = false }) {
  const [open, setOpen] = useState(false);
  if (!checklist) return null;

  const items = [
    { key: 'emailVerified', label: 'Email verified', done: checklist.emailVerified },
    { key: 'phoneVerified', label: 'Phone verified', done: checklist.phoneVerified },
    { key: 'serviceLocationSet', label: 'Service location', done: checklist.serviceLocationSet },
    { key: 'dob18Plus', label: 'Date of birth (18+)', done: checklist.dob18Plus },
    { key: 'businessTypeSet', label: 'Business type', done: checklist.businessTypeSet },
    { key: 'stripeReady', label: 'Stripe ready', done: checklist.stripeReady },
    ...(checklist.abnRequired ? [{ key: 'abnVerified', label: 'ABN verified', done: checklist.abnVerified }] : []),
  ];

  const completedCount = items.filter(item => item.done).length;
  const totalCount = items.length;
  const allDone = completedCount === totalCount;

  if (compact) {
    return (
      <div style={{ marginBottom: 0 }}>
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          aria-expanded={open}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '12px 16px',
            background: allDone ? '#ECFDF5' : '#FFF7ED',
            border: `1.5px solid ${allDone ? '#BBF7D0' : '#FED7AA'}`,
            borderRadius: 12,
            fontSize: 13,
            cursor: 'pointer',
            textAlign: 'left',
            fontFamily: 'Inter, sans-serif',
            transition: 'all 0.2s ease',
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
            <span
              aria-hidden="true"
              style={{
                width: 10,
                height: 10,
                borderRadius: 999,
                background: allDone ? '#10B981' : '#F59E0B',
                boxShadow: `0 0 0 3px ${allDone ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)'}`,
                flexShrink: 0,
              }}
            />
            <span style={{ fontWeight: 700, color: '#111827', fontSize: 14 }}>
              {allDone ? 'Ready to quote' : `${completedCount}/${totalCount} completed`}
            </span>
          </span>
          <span style={{ color: '#6B7280', fontWeight: 700, fontSize: 16 }}>
            {open ? '▴' : '▾'}
          </span>
        </button>

        {open && (
          <div style={{
            marginTop: 12,
            padding: 16,
            background: '#FFFFFF',
            border: '1px solid #E5E7EB',
            borderRadius: 12,
            boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
          }}>
            <div style={{ display: 'grid', gap: 8 }}>
              {items.map(item => (
                <div
                  key={item.key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 12px',
                    background: item.done ? '#F0FDF4' : '#F9FAFB',
                    border: `1px solid ${item.done ? '#BBF7D0' : '#E5E7EB'}`,
                    borderRadius: 10,
                  }}
                >
                  <span style={{
                    fontSize: 14,
                    fontWeight: 800,
                    color: item.done ? '#10B981' : '#9CA3AF',
                  }}>
                    {item.done ? <CheckCircle2 size={16} strokeWidth={2.4} /> : <Circle size={16} strokeWidth={2.2} />}
                  </span>
                  <span style={{
                    fontSize: 13,
                    fontWeight: item.done ? 600 : 500,
                    color: item.done ? '#059669' : '#6B7280',
                    fontFamily: 'Inter, sans-serif',
                  }}>
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{
      padding: 20,
      background: '#FFFFFF',
      border: '1px solid #E5E7EB',
      borderRadius: 12,
      marginBottom: 20,
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
      }}>
        <div>
          <h3 style={{
            fontSize: 16,
            fontWeight: 700,
            color: '#111827',
            margin: 0,
            marginBottom: 4,
          }}>
            Verification Progress
          </h3>
          <p style={{
            fontSize: 13,
            color: '#6B7280',
            margin: 0,
          }}>
            Complete all steps to start quoting on tasks
          </p>
        </div>
        <div style={{
          fontSize: 32,
        }}>
          {allDone ? <CheckCircle2 size={30} strokeWidth={2.3} color="#10B981" /> : <Clock3 size={30} strokeWidth={2.1} color="#F59E0B" />}
        </div>
      </div>

      {/* Progress bar */}
      <div style={{
        width: '100%',
        height: 8,
        backgroundColor: '#E5E7EB',
        borderRadius: 4,
        overflow: 'hidden',
        marginBottom: 16,
      }}>
        <div style={{
          width: `${(completedCount / totalCount) * 100}%`,
          height: '100%',
          backgroundColor: '#14C5C5',
          transition: 'width 0.3s ease',
        }} />
      </div>

      {/* Checklist items */}
      <div style={{ display: 'grid', gap: 8 }}>
        {items.map(item => (
          <div
            key={item.key}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 12px',
              background: item.done ? '#F0FDF4' : '#F9FAFB',
              border: `1px solid ${item.done ? '#BBF7D0' : '#E5E7EB'}`,
              borderRadius: 8,
            }}
          >
            <span style={{
              fontSize: 16,
              fontWeight: 700,
              color: item.done ? '#10B981' : '#9CA3AF',
            }}>
              {item.done ? <CheckCircle2 size={16} strokeWidth={2.4} /> : <Circle size={16} strokeWidth={2.2} />}
            </span>
            <span style={{
              fontSize: 14,
              fontWeight: item.done ? 600 : 400,
              color: item.done ? '#059669' : '#6B7280',
              textDecoration: item.done ? 'none' : 'none',
            }}>
              {item.label}
            </span>
          </div>
        ))}
      </div>

      {allDone && (
        <div style={{
          marginTop: 16,
          padding: 12,
          background: '#ECFDF5',
          border: '1px solid #A7F3D0',
          borderRadius: 8,
          fontSize: 13,
          color: '#065F46',
          fontWeight: 600,
          textAlign: 'center',
        }}>
          You’re all set. You can now submit quotes on tasks.
        </div>
      )}
    </div>
  );
}

/**
 * FormFieldError - Display inline error message for form fields
 */
export function FormFieldError({ message }) {
  if (!message) return null;
  
  return (
    <div style={{
      marginTop: 8,
      padding: '8px 12px',
      background: '#FEE2E2',
      border: '1px solid #FCA5A5',
      borderRadius: 8,
      fontSize: 13,
      color: '#991B1B',
      fontWeight: 600,
      display: 'flex',
      alignItems: 'center',
      gap: 8,
    }}>
      <AlertTriangle size={16} strokeWidth={2.3} />
      <span>{message}</span>
    </div>
  );
}

/**
 * FormFieldWarning - Display inline warning message for form fields
 */
export function FormFieldWarning({ message }) {
  if (!message) return null;
  
  return (
    <div style={{
      marginTop: 8,
      padding: '8px 12px',
      background: '#FEF3C7',
      border: '1px solid #FCD34D',
      borderRadius: 8,
      fontSize: 13,
      color: '#92400E',
      fontWeight: 600,
      display: 'flex',
      alignItems: 'center',
      gap: 8,
    }}>
      <Zap size={16} strokeWidth={2.3} />
      <span>{message}</span>
    </div>
  );
}


/**
 * LockedField - Wrapper for fields that should be locked after verification
 * Shows a lock icon and tooltip explaining why the field is locked
 */
