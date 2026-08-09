import React, { useMemo } from 'react';
import { CheckCircle2, Circle, Sparkles } from 'lucide-react';
import { canQuote } from '../../utils/profileCompliance';
import './ExpertPrivateReadinessPanel.css';

/**
 * Builds display rows from computeReadiness() output. Does not change compliance rules —
 * `canQuote` remains the single source for “ready to quote”.
 */
function buildRows(readiness) {
  const contactDone = readiness.emailVerified && readiness.phoneVerified;
  const abnRequired = readiness.abnRequired === true;
  const abnDone = !abnRequired || (readiness.abnPresent && readiness.abnVerified);

  return [
    {
      key: 'contact',
      label: 'Contact details',
      sub: 'Verified email and phone',
      done: contactDone,
    },
    {
      key: 'location',
      label: 'Service location',
      sub: 'Your primary service area for matching',
      done: readiness.serviceLocationSet,
    },
    {
      key: 'businessType',
      label: 'Business type',
      sub: 'Individual, sole trader, or company',
      done: readiness.businessTypeSet,
    },
    {
      key: 'abn',
      label: abnRequired ? 'ABN verified' : 'ABN',
      sub: abnRequired
        ? 'Australian Business Number (required for your setup)'
        : 'Not required for your business type',
      done: abnDone,
    },
    {
      key: 'dob',
      label: 'Age requirement',
      sub: 'Date of birth — Experts must be 18 or older',
      done: readiness.dob18Plus,
    },
    {
      key: 'stripe',
      label: 'Payout setup',
      sub: 'Stripe account for secure payouts',
      done: readiness.stripeReady,
    },
    {
      key: 'profile',
      label: 'Public profile',
      sub: 'Profile marked complete for quoting',
      done: readiness.profileCompleted,
    },
  ];
}

function missingLabels(rows) {
  return rows.filter((r) => !r.done).map((r) => r.label);
}

/**
 * Quote readiness summary for the Expert private details card.
 * Uses `computeReadiness` output and `canQuote` from profileCompliance (unchanged).
 */
export default function ExpertPrivateReadinessPanel({ readiness }) {
  const rows = useMemo(() => (readiness ? buildRows(readiness) : []), [readiness]);
  const ready = useMemo(() => (readiness ? canQuote(readiness) : false), [readiness]);
  const missing = useMemo(() => missingLabels(rows), [rows]);

  if (!readiness) return null;

  return (
    <div className="expert-readiness-panel">
      <div className="expert-readiness-panel__shell">
        <header className="expert-readiness-panel__header">
          <h2 className="expert-readiness-panel__title">Quote readiness</h2>
          <p className="expert-readiness-panel__lede">
            <span className="expert-readiness-panel__lede-desktop">
              See what’s complete and what still needs attention before you can send quotes to Clients. Use{' '}
              <strong>Save private details</strong> below when you change anything on this card.
            </span>
            <span className="expert-readiness-panel__lede-mobile">
              What’s done and what’s left before you can quote — tap <strong>Save private details</strong> after
              changes.
            </span>
          </p>
        </header>

        <div className="expert-readiness-panel__status" aria-live="polite">
          {ready ? (
            <div className="expert-readiness-panel__success">
              <Sparkles className="expert-readiness-panel__success-icon" size={20} strokeWidth={2} aria-hidden />
              <div>
                <p className="expert-readiness-panel__success-title">You’re ready to quote</p>
                <p className="expert-readiness-panel__success-body">
                  Your private details meet the requirements to quote on tasks. Keep your information up to date
                  if anything changes.
                </p>
              </div>
            </div>
          ) : (
            <div className="expert-readiness-panel__next">
              <p className="expert-readiness-panel__next-title">Still to complete</p>
              {missing.length > 0 ? (
                <ul className="expert-readiness-panel__next-list">
                  {missing.map((label) => (
                    <li key={label}>{label}</li>
                  ))}
                </ul>
              ) : (
                <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: '#475569' }}>
                  Finish the checklist below — one or more items may still be processing after you save.
                </p>
              )}
            </div>
          )}
        </div>

        <ul className="expert-readiness-panel__grid">
          {rows.map((row) => (
            <li
              key={row.key}
              className={`expert-readiness-panel__row ${row.done ? 'expert-readiness-panel__row--done' : ''}`}
            >
              <span className="expert-readiness-panel__row-icon" aria-hidden>
                {row.done ? (
                  <CheckCircle2 size={18} strokeWidth={2.4} />
                ) : (
                  <Circle size={18} strokeWidth={2.2} />
                )}
              </span>
              <div className="expert-readiness-panel__row-text">
                <span className="expert-readiness-panel__row-label">{row.label}</span>
                <span className="expert-readiness-panel__row-sub">{row.sub}</span>
              </div>
            </li>
          ))}
        </ul>

        <p className="expert-readiness-panel__footnote">
          <span className="expert-readiness-panel__footnote-desktop">
            Requirements are checked automatically from your profile. This summary is a guide — if something looks
            wrong after you save, refresh the page or contact support.
          </span>
          <span className="expert-readiness-panel__footnote-mobile">
            Auto-checked from your profile. Refresh if it looks wrong after saving.
          </span>
        </p>
      </div>
    </div>
  );
}
