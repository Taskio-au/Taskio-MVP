import React from 'react';

export function PrivateDetailsConfirmModal({ open, onClose, onConfirm, styles }) {
  if (!open) return null;

  return (
    <div style={styles.modalOverlay} onMouseDown={onClose} role="dialog" aria-modal="true">
      <div style={styles.modalCard} onMouseDown={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <div>
            <div className="pp-modal-title-lg">
              Confirm private details
            </div>
            <div className="pp-modal-body">
              After saving, the following details can’t be edited to protect your identity and comply with payout requirements:
              <ul className="pp-modal-list">
                <li>Date of birth</li>
                <li>Business type</li>
                <li>ABN (if applicable)</li>
              </ul>
              <div className="pp-modal-note">
                If you need changes later, contact Taskio Support.
              </div>
            </div>
          </div>
          <button type="button" style={styles.modalClose} onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="pp-modal-actions">
          <button type="button" style={styles.verifyButton} onClick={onClose}>
            Cancel
          </button>
          <button type="button" style={styles.confirmButton} onClick={onConfirm}>
            Confirm and save
          </button>
        </div>
      </div>
    </div>
  );
}

export function ChangeRequestModal({
  open,
  onClose,
  styles,
  changeReqField,
  onFieldChange,
  changeReqValue,
  onChangeReqValue,
  changeReqReason,
  onChangeReqReason,
  draftFirstName,
  draftLastName,
  draftBusinessName,
  onSubmit,
  busy,
}) {
  if (!open) return null;

  return (
    <div style={styles.modalOverlay} onMouseDown={onClose} role="dialog" aria-modal="true">
      <div style={styles.modalCard} onMouseDown={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <div>
            <div className="pp-modal-title">Request a change</div>
            <div className="pp-modal-subtitle">Verified profiles require admin review for identity changes.</div>
          </div>
          <button type="button" style={styles.modalClose} onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="pp-modal-section">
          <div style={styles.label}>Select field to change</div>
          <select value={changeReqField} onChange={(e) => onFieldChange(e.target.value)} style={styles.input}>
            <option value="firstName">First name</option>
            <option value="lastName">Last name</option>
            <option value="businessName">Business name</option>
          </select>
        </div>

        <div className="pp-modal-section">
          <div style={styles.label}>Current value</div>
          <input
            value={
              changeReqField === 'firstName' ? draftFirstName :
              changeReqField === 'lastName' ? draftLastName :
              draftBusinessName
            }
            readOnly
            style={{ ...styles.input, background: '#F7F9FA', color: '#666' }}
          />
        </div>

        <div className="pp-modal-section">
          <div style={styles.label}>New requested value</div>
          <input
            value={changeReqValue}
            onChange={(e) => onChangeReqValue(e.target.value)}
            style={styles.input}
            placeholder={`Enter new ${changeReqField === 'firstName' ? 'first name' : changeReqField === 'lastName' ? 'last name' : 'business name'}`}
          />
        </div>

        <div className="pp-modal-section">
          <div style={styles.label}>Reason for change</div>
          <textarea
            value={changeReqReason}
            onChange={(e) => onChangeReqReason(e.target.value)}
            style={{ ...styles.input, minHeight: 90, resize: 'vertical' }}
            placeholder="Briefly explain why you need this change"
            maxLength={500}
          />
        </div>

        <div className="pp-modal-actions-lg">
          <button type="button" style={styles.buttonSecondary} onClick={onClose}>Cancel</button>
          <button type="button" style={styles.buttonPrimary} onClick={onSubmit} disabled={busy}>
            {busy ? 'Submitting…' : 'Submit request'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function DeletionRequestModal({
  open,
  onClose,
  styles,
  deleteStep,
  deletePassword,
  onDeletePasswordChange,
  deleteTyped,
  onDeleteTypedChange,
  deleteReason,
  onDeleteReasonChange,
  deleteDevLink,
  onRequestDeletion,
  deleteBusy,
}) {
  if (!open) return null;

  return (
    <div style={styles.modalOverlay} onMouseDown={onClose} role="dialog" aria-modal="true">
      <div style={styles.modalCard} onMouseDown={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <div>
            <div className="pp-modal-title">Request permanent deletion</div>
            <div className="pp-modal-subtitle">This is a multi-step process and may be blocked if you have active tasks or pending payments.</div>
          </div>
          <button type="button" style={styles.modalClose} onClick={onClose} aria-label="Close">×</button>
        </div>

        {deleteStep === 0 && (
          <div className="pp-modal-section">
            <div className="pp-modal-step-copy">
              Step 1/3: Re-authenticate to continue.
            </div>
            <div className="pp-modal-inner-gap">
              <div style={styles.label}>Password</div>
              <input
                type="password"
                value={deletePassword}
                onChange={(e) => onDeletePasswordChange(e.target.value)}
                style={styles.input}
                placeholder="Enter your password"
              />
              <div style={styles.hint}>If you signed up with Google/Apple, please re-login and try again.</div>
            </div>
          </div>
        )}

        {deleteStep === 1 && (
          <div className="pp-modal-section">
            <div className="pp-modal-step-copy">
              Step 2/3: Type <strong>DELETE</strong> and tell us why.
            </div>
            <div className="pp-modal-inner-gap">
              <div style={styles.label}>Type DELETE</div>
              <input value={deleteTyped} onChange={(e) => onDeleteTypedChange(e.target.value)} style={styles.input} placeholder="DELETE" />
            </div>
            <div className="pp-modal-inner-gap">
              <div style={styles.label}>Reason</div>
              <textarea
                value={deleteReason}
                onChange={(e) => onDeleteReasonChange(e.target.value)}
                style={{ ...styles.input, minHeight: 90, resize: 'vertical' }}
                placeholder="Reason for deletion"
                maxLength={500}
              />
            </div>
          </div>
        )}

        {deleteStep === 2 && (
          <div className="pp-modal-section">
            <div className="pp-modal-step-copy-wide">
              Step 3/3: Check your email and confirm the deletion link. Then a 7-day cooling-off period starts. You can cancel during this period.
            </div>
            {deleteDevLink && (
              <div className="pp-modal-dev-link">
                Dev confirm link: <a href={deleteDevLink} target="_blank" rel="noreferrer">{deleteDevLink}</a>
              </div>
            )}
          </div>
        )}

        <div className="pp-modal-actions-lg">
          <button type="button" style={styles.buttonSecondary} onClick={onClose}>Close</button>
          {deleteStep !== 2 && (
            <button type="button" style={styles.buttonDanger} onClick={onRequestDeletion} disabled={deleteBusy}>
              {deleteBusy ? 'Please wait…' : (deleteStep === 0 ? 'Continue' : 'Request deletion')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
