import React from 'react';
import { CheckCircle2, Lock } from 'lucide-react';
import PrivateDetailsVerificationCard from './PrivateDetailsVerificationCard';
import ExpertPrivateReadinessPanel from './ExpertPrivateReadinessPanel';
import { FormFieldError, FormFieldWarning } from './ProfileComplianceUI';

export default function TradiePrivateDetailsPanel({
  styles,
  readiness,
  onProfileRefresh,
  serviceLocationWrapRef,
  serviceLocationQuery,
  onServiceLocationQueryChange,
  serviceLocationResults,
  setServiceLocationOpen,
  serviceLocationOpen,
  serviceLocationIndex,
  setServiceLocationIndex,
  selectServiceLocation,
  draftServiceLocation,
  setDraftServiceLocation,
  setServiceLocationQuery,
  setServiceLocationResults,
  serviceLocationErr,
  serviceLocationLoading,
  businessTypeLocked,
  draftBusinessType,
  onBusinessTypeChange,
  showAbn,
  abnRequired,
  draftAbn,
  setDraftAbn,
  abnLocked,
  profileAbnVerified,
  verifyAbnFromProfile,
  verifiedIdentity,
  abnVerifyBusy,
  abnError,
  abnVerifyMsg,
  dobLocked,
  draftDob,
  onDobChange,
  maxDobDate,
  dobError,
  dobValidation,
  memberSince,
}) {
  return (
    <>
      {readiness ? <ExpertPrivateReadinessPanel readiness={readiness} /> : null}

      <div style={styles.privateCardsPanel} className="pp-private-details-fields">
        <div className="pp-private-cards-grid pp-private-cards-grid--expert">
          <p className="pp-private-group-label">Contact</p>
          <div className="pp-private-slot pp-private-slot--email">
            <PrivateDetailsVerificationCard variant="email" onProfileRefresh={onProfileRefresh} />
          </div>
          <div className="pp-private-slot pp-private-slot--phone">
            <PrivateDetailsVerificationCard variant="phone" onProfileRefresh={onProfileRefresh} />
          </div>
          <p className="pp-private-group-label">Service</p>
          <div className="pp-private-slot pp-private-slot--service">
            <div style={styles.privateSubCard} className="pp-private-subcard">
              <div style={styles.privateSubCardHeader}>
                <div>
                  <div style={styles.privateSubCardTitle}>Service location</div>
                  <div style={styles.privateSubCardSub}>
                    Used to match you with nearby tasks in inner Melbourne. Clients see relevant Experts by area.
                  </div>
                </div>
              </div>
              <div style={styles.typeaheadWrap} ref={serviceLocationWrapRef}>
                <div style={styles.smartInputWrap}>
                  <div style={styles.smartInputIconLeft}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M8 1C5.24 1 3 3.24 3 6c0 3.5 5 9 5 9s5-5.5 5-9c0-2.76-2.24-5-5-5zm0 7c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z" fill="#9CA3AF" />
                    </svg>
                  </div>

                  <input
                    value={serviceLocationQuery}
                    onChange={(e) => onServiceLocationQueryChange(e.target.value)}
                    onFocus={() => {
                      if (serviceLocationResults.length > 0) setServiceLocationOpen(true);
                    }}
                    onKeyDown={(e) => {
                      if (!serviceLocationOpen || serviceLocationResults.length === 0) return;
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setServiceLocationIndex((prev) => (prev + 1) % serviceLocationResults.length);
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setServiceLocationIndex((prev) => (prev - 1 + serviceLocationResults.length) % serviceLocationResults.length);
                      } else if (e.key === 'Enter') {
                        e.preventDefault();
                        if (serviceLocationIndex > -1) selectServiceLocation(serviceLocationResults[serviceLocationIndex]);
                      } else if (e.key === 'Escape') {
                        setServiceLocationOpen(false);
                      }
                    }}
                    placeholder="Enter a supported Melbourne suburb or postcode"
                    style={{
                      ...styles.textInput,
                      ...(draftServiceLocation ? styles.smartInputFilled : {}),
                      paddingLeft: 40,
                      paddingRight: draftServiceLocation ? 40 : 14,
                    }}
                    className="profile-input smart-location-input"
                    autoComplete="off"
                  />

                  {draftServiceLocation && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        setDraftServiceLocation(null);
                        setServiceLocationQuery('');
                        setServiceLocationOpen(false);
                        setServiceLocationResults([]);
                      }}
                      style={styles.smartInputClearBtn}
                      className="smart-input-clear-btn"
                      aria-label="Clear location"
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M1 1L13 13M1 13L13 1" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    </button>
                  )}
                </div>
                {serviceLocationErr ? (
                  <div className="pp-inline-hint pp-inline-hint--location">
                    {serviceLocationErr}
                  </div>
                ) : null}
                {serviceLocationLoading ? (
                  <div style={{ marginTop: 8, fontSize: 12, color: '#6B7280' }}>
                    Searching…
                  </div>
                ) : null}
                {serviceLocationOpen && serviceLocationResults.length > 0 ? (
                  <ul style={styles.typeaheadMenu} role="listbox" aria-label="Service locations">
                    {serviceLocationResults.map((s, idx) => (
                      <li
                        key={`${s.name}-${s.postcode}-${idx}`}
                        role="option"
                        aria-selected={idx === serviceLocationIndex}
                        className="location-typeahead-item"
                        onMouseDown={(ev) => {
                          ev.preventDefault();
                          selectServiceLocation(s);
                        }}
                        onMouseEnter={() => setServiceLocationIndex(idx)}
                        style={{
                          ...styles.typeaheadItem,
                          ...(idx === serviceLocationIndex ? styles.typeaheadItemActive : null),
                        }}
                      >
                        <div style={styles.typeaheadItemIcon}>
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M8 1C5.24 1 3 3.24 3 6c0 3.5 5 9 5 9s5-5.5 5-9c0-2.76-2.24-5-5-5zm0 7c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z" fill="#6B7280" />
                          </svg>
                        </div>
                        <div style={styles.typeaheadItemContent}>
                          <div style={styles.typeaheadItemPrimary}>{s.name}</div>
                          <div style={styles.typeaheadItemSecondary}>
                            {s.state?.abbreviation} {s.postcode}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
          </div>

          <p className="pp-private-group-label">Business & identity</p>
          <div className="pp-private-slot pp-private-slot--business">
            <div style={styles.privateSubCard} className="pp-private-subcard">
              <div style={styles.privateSubCardHeader}>
                <div>
                  <div style={{ ...styles.privateSubCardTitle, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    Business type
                    {businessTypeLocked ? (
                      <Lock size={14} strokeWidth={2.25} color="#6b7280" aria-label="Locked" />
                    ) : null}
                  </div>
                  <div style={styles.privateSubCardSub}>Used for payouts and tax settings.</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                {[
                  { key: 'individual', label: 'Individual' },
                  { key: 'sole_trader', label: 'Sole trader' },
                  { key: 'company', label: 'Business (Company)' },
                ].map((opt) => (
                  <label
                    key={opt.key}
                    style={{
                      ...styles.radioPill,
                      ...(businessTypeLocked ? styles.radioPillLocked : null),
                    }}
                    title={businessTypeLocked ? 'Locked for safety. Contact support to change.' : undefined}
                  >
                    <input
                      type="radio"
                      name="businessType"
                      value={opt.key}
                      checked={draftBusinessType === opt.key}
                      onChange={() => onBusinessTypeChange(opt.key)}
                      disabled={businessTypeLocked}
                      style={{ marginRight: 8 }}
                    />
                    {opt.label}
                  </label>
                ))}
              </div>

              {showAbn && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#374151', marginBottom: 8 }}>
                    ABN {abnRequired && <span style={{ color: '#DC2626' }}>*</span>}
                  </div>
                  <div className="pp-expert-abn-row" style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <input
                      type="text"
                      value={draftAbn}
                      onChange={(e) => setDraftAbn(e.target.value)}
                      disabled={abnLocked}
                      readOnly={abnLocked}
                      placeholder="11-digit ABN"
                      style={{
                        ...styles.textInput,
                        flex: 1,
                        ...(abnLocked ? styles.inputLocked : null),
                      }}
                      className="profile-input"
                    />
                    {!profileAbnVerified && (
                      <button
                        type="button"
                        onClick={verifyAbnFromProfile}
                        disabled={verifiedIdentity || abnVerifyBusy || !String(draftAbn || '').trim()}
                        style={{
                          ...styles.verifyButton,
                          ...(verifiedIdentity || abnVerifyBusy || !String(draftAbn || '').trim() ? styles.verifyButtonDisabled : null),
                        }}
                        title={abnLocked ? 'Locked for safety. Contact support to change.' : undefined}
                      >
                        {abnVerifyBusy ? 'Verifying…' : 'Verify ABN'}
                      </button>
                    )}
                  </div>
                  <FormFieldError message={abnError} />
                  {abnVerifyMsg ? (
                    <div style={{ marginTop: 8, fontSize: 13, color: '#065F46', fontWeight: 700 }}>
                      {abnVerifyMsg}
                    </div>
                  ) : null}
                  {profileAbnVerified ? (
                    <span
                      style={{
                        ...styles.verifiedPill,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        marginTop: 10,
                      }}
                    >
                      <CheckCircle2 size={14} strokeWidth={2.5} color="#065f46" aria-hidden />
                      <span>ABN verified</span>
                    </span>
                  ) : (
                    <p style={styles.fieldHint}>
                      {abnRequired
                        ? 'Enter your ABN, then use Verify ABN. Required when your business type needs it.'
                        : 'Shown when your business type or business name requires an ABN.'}
                    </p>
                  )}
                </div>
              )}

              {(businessTypeLocked || abnLocked) ? <p style={styles.fieldHint}>Locked for safety. Contact support to change.</p> : null}
            </div>
          </div>

          <p className="pp-private-group-label">Account</p>
          <div className="pp-private-slot pp-private-slot--dob">
            <div id="dob-section" style={styles.privateSubCard} className="pp-private-subcard">
              <div style={styles.privateSubCardHeader}>
                <div>
                  <div style={{ ...styles.privateSubCardTitle, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    Date of birth
                    {dobLocked ? (
                      <Lock size={14} strokeWidth={2.25} color="#6b7280" aria-label="Locked" />
                    ) : null}
                  </div>
                  <div style={styles.privateSubCardSub}>Experts must be 18 or older to quote for Clients.</div>
                </div>
              </div>
              <input
                type="date"
                value={draftDob}
                onChange={onDobChange}
                max={maxDobDate}
                disabled={dobLocked}
                readOnly={dobLocked}
                style={{ ...styles.textInput, ...(dobLocked ? styles.inputLocked : null) }}
                className="profile-input"
              />
              <FormFieldError message={dobError} />
              {dobValidation.valid && !dobValidation.isAdult && (
                <FormFieldWarning message="You must be 18 or older to quote for Clients" />
              )}
              {dobLocked ? (
                <p style={styles.fieldHint}>Locked for safety. Contact support to change.</p>
              ) : null}
            </div>
          </div>

          <div className="pp-private-slot pp-private-slot--member">
            <div style={styles.privateSubCard} className="pp-private-subcard">
              <div style={styles.privateSubCardHeader}>
                <div>
                  <div style={styles.privateSubCardTitle}>Member since</div>
                </div>
              </div>
              <input
                value={memberSince}
                readOnly
                style={styles.readOnlyInput}
                className="profile-input"
                aria-label="Member since"
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
