import React from 'react';
import { Lock } from 'lucide-react';
import { FormFieldError } from './ProfileComplianceUI';
import ChangeRequestHistory from './ChangeRequestHistory';

export default function TradieIdentitySection({
  styles,
  profile,
  displayPhotoUrl,
  headerName,
  headerEmail,
  tradieFileRef,
  onPhotoSelect,
  photoBusy,
  photoProgress,
  photoError,
  businessNameRequired,
  draftFirstName,
  draftLastName,
  draftBusinessName,
  onDraftFirstNameChange,
  onDraftLastNameChange,
  onDraftBusinessNameChange,
  businessNameError,
  onOpenChangeRequest,
  changeReqHistoryLoading,
  changeReqHistory,
}) {
  return (
    <>
      <section className="pp-expert-subsection pp-expert-subsection--identity">
        <p className="pp-expert-eyebrow">Identity</p>
      <div style={styles.profileHeaderImproved} className="pp-expert-identity-header">
        <div style={styles.avatarSectionCentered} className="pp-expert-identity-avatar">
          <div style={styles.avatarWrapLarger}>
            {displayPhotoUrl ? (
              <img src={displayPhotoUrl} alt="Profile" style={styles.avatarImg} />
            ) : (
              <div style={styles.avatarFallback}>{(headerName || headerEmail || 'U').slice(0, 2).toUpperCase()}</div>
            )}
          </div>
          <input
            ref={tradieFileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="pp-hidden-file-input"
            onChange={(e) => onPhotoSelect(e.target.files?.[0])}
          />
          <button
            type="button"
            style={styles.photoButtonSubtle}
            className="profile-photo-btn"
            onClick={() => tradieFileRef.current?.click()}
            disabled={photoBusy}
          >
            {photoBusy ? (
              <>
                <span style={styles.buttonSpinner}>↻</span> Uploading {photoProgress}%
              </>
            ) : (
              <>{displayPhotoUrl ? 'Change photo' : 'Upload photo'}</>
            )}
          </button>
          {photoError && <div style={styles.photoError}>{photoError}</div>}
        </div>

        <div style={styles.profileInfoImproved} className="pp-expert-identity-info">
          <div style={styles.profileNameLarge}>{headerName || 'Add your name'}</div>
          {draftBusinessName && (
            <div style={styles.profileBusinessSubtle}>{draftBusinessName}</div>
          )}
          <div style={styles.badgeRowInline}>
            <span style={styles.roleBadgeSubtle}>Expert</span>
            {profile?.verified === true && (
              <span style={styles.verifiedBadgeWithTooltip} title="Verified by Taskio after identity and business checks">
                <span className="pp-verified-check">✓</span> Verified
              </span>
            )}
          </div>
        </div>
      </div>

      <div style={styles.identityFieldsContainer} className="pp-expert-identity-fields">
        <div style={styles.nameBusinessRow} className="name-business-row">
          <div style={styles.formGroup}>
            <label style={{ ...styles.fieldLabel, display: 'flex', alignItems: 'center', gap: 6 }}>
              First name
              <Lock size={12} strokeWidth={2.25} color="#9ca3af" aria-label="Locked" />
            </label>
            <input
              value={draftFirstName}
              onChange={(e) => onDraftFirstNameChange(e.target.value)}
              style={{ ...styles.textInput, ...styles.inputLocked }}
              className="profile-input"
              placeholder="First name"
              maxLength={40}
              readOnly
              disabled
            />
          </div>

          <div style={styles.formGroup}>
            <label style={{ ...styles.fieldLabel, display: 'flex', alignItems: 'center', gap: 6 }}>
              Last name
              <Lock size={12} strokeWidth={2.25} color="#9ca3af" aria-label="Locked" />
            </label>
            <input
              value={draftLastName}
              onChange={(e) => onDraftLastNameChange(e.target.value)}
              style={{ ...styles.textInput, ...styles.inputLocked }}
              className="profile-input"
              placeholder="Last name"
              maxLength={40}
              readOnly
              disabled
            />
          </div>

          <div style={styles.formGroup}>
            <label style={{ ...styles.fieldLabel, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              Business name{businessNameRequired ? '' : ' (if applicable)'} {businessNameRequired && <span className="pp-required-asterisk">*</span>}
              {profile?.verified === true ? (
                <Lock size={12} strokeWidth={2.25} color="#9ca3af" aria-label="Locked" />
              ) : null}
            </label>
            <input
              value={draftBusinessName}
              onChange={(e) => onDraftBusinessNameChange(e.target.value)}
              style={{ ...styles.textInput, ...(profile?.verified ? styles.inputLocked : {}) }}
              className="profile-input"
              placeholder={businessNameRequired ? 'Required for your business type' : 'Optional (e.g. Smith Home Services)'}
              maxLength={120}
              readOnly={profile?.verified === true}
              disabled={profile?.verified === true}
            />
            <FormFieldError message={businessNameError} />
            {businessNameRequired && !draftBusinessName && !profile?.verified && (
              <p className="pp-field-hint-notice">
                Business name is required for company accounts.
              </p>
            )}
          </div>
        </div>

        <div style={styles.requestChangeLinkContainer} className="pp-expert-request-change-wrap">
          <button
            type="button"
            style={styles.requestChangeLinkSimple}
            className="request-change-btn pp-expert-request-change-btn"
            onClick={onOpenChangeRequest}
            title="Request a review when your verified name or business details need updating"
          >
            Request a name or business update
          </button>
        </div>
      </div>

      <ChangeRequestHistory
        visible={profile?.verified === true}
        loading={changeReqHistoryLoading}
        items={changeReqHistory}
        styles={styles}
      />
      </section>
    </>
  );
}
