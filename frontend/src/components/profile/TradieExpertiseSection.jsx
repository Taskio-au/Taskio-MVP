import React, { useMemo, useState, useId } from 'react';
import Tooltip from '../Tooltip';
import { getCanonicalJobTypeLabel } from '../../constants/taskTaxonomy';
import {
  phase1ExpertiseCatalog,
  expertCategoryOrder,
} from '../../shared/expertiseCatalog';

const MAX_CORE_EXPERTISE = 5;

const expertiseInfoMap = {
  general_odd_jobs: {
    ariaLabel: 'More info about General odd jobs',
    text: 'Basic help that doesn’t need a specialist or licence.',
  },
  small_removals: {
    ariaLabel: 'More info about Small removals',
    text: 'Small transport jobs; larger moves should use Moving help.',
  },
};

/** Group catalog rows by expertCategory for the editor, preserving product category order. */
function groupCatalogByCategory(rows) {
  const map = new Map();
  for (const row of rows) {
    const cat = row.expertCategory || row.category || 'Other';
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat).push(row);
  }
  const ordered = [];
  for (const name of expertCategoryOrder) {
    if (map.has(name)) {
      ordered.push([name, map.get(name)]);
      map.delete(name);
    }
  }
  const restKeys = Array.from(map.keys()).sort((a, b) => a.localeCompare(b));
  for (const name of restKeys) {
    ordered.push([name, map.get(name)]);
  }
  return ordered;
}

function ExpertiseEditorModal({
  open,
  onClose,
  styles,
  draftExpertiseApproved,
  toggleExpertiseLocal,
  expertiseSaving,
  searchQuery,
  onSearchQueryChange,
}) {
  const titleId = useId();
  const descriptionId = useId();
  const filteredCatalog = useMemo(() => {
    const q = String(searchQuery || '').trim().toLowerCase();
    if (!q) return phase1ExpertiseCatalog;
    return phase1ExpertiseCatalog.filter((row) => {
      const a = (row.label || '').toLowerCase();
      const b = (row.expertLabel || '').toLowerCase();
      const c = (row.expertCategory || row.category || '').toLowerCase();
      return a.includes(q) || b.includes(q) || c.includes(q);
    });
  }, [searchQuery]);

  const grouped = useMemo(() => groupCatalogByCategory(filteredCatalog), [filteredCatalog]);

  if (!open) return null;

  return (
    <div
      className="pp-expertise-modal-backdrop"
      style={styles.modalOverlay}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        className="pp-expertise-modal-card"
        style={styles.modalCard}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div style={styles.modalHeader}>
          <div>
            <div id={titleId} className="pp-expertise-modal-title">
              Edit task types
            </div>
            <div id={descriptionId} className="pp-modal-subtitle">
              Choose the kinds of tasks you want to be matched to. Clients use these to find Experts like you.
            </div>
          </div>
          <button
            type="button"
            style={styles.modalClose}
            className="pp-expertise-modal-close"
            onClick={onClose}
            aria-label="Close editor"
          >
            ×
          </button>
        </div>

        <div className="pp-expertise-modal-search-wrap">
          <label htmlFor="pp-expertise-search" className="pp-expertise-search-label">
            Search
          </label>
          <input
            id="pp-expertise-search"
            type="search"
            className="pp-expertise-search-input profile-input"
            placeholder="Filter by task name or category…"
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            autoComplete="off"
          />
        </div>

        <div className="pp-expertise-modal-scroll">
          {filteredCatalog.length === 0 ? (
            <p className="pp-expertise-modal-empty">No task types match your search. Try another word.</p>
          ) : (
            grouped.map(([categoryName, items]) => (
              <section key={categoryName} className="pp-expertise-modal-section">
                <h3 className="pp-expertise-modal-cat">{categoryName}</h3>
                <div className="pp-expertise-modal-grid">
                  {items.map(({ key, label }) => {
                    const isSelected =
                      Array.isArray(draftExpertiseApproved) && draftExpertiseApproved.includes(key);
                    const info = expertiseInfoMap[key];
                    const displayLabel = getCanonicalJobTypeLabel(key) || label;
                    return (
                      <label
                        key={key}
                        className={`pp-expertise-modal-tile ${isSelected ? 'pp-expertise-modal-tile--selected' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleExpertiseLocal(key)}
                          className="pp-expertise-modal-checkbox"
                          disabled={expertiseSaving}
                        />
                        <span className="pp-expertise-modal-tile-text">
                          <span className="pp-expertise-label-text" title={displayLabel}>
                            {displayLabel}
                          </span>
                        </span>
                        {info ? (
                          <span className="pp-expertise-tooltip-wrap pp-expertise-tooltip-wrap--modal">
                            <Tooltip content={info.text} ariaLabel={info.ariaLabel} placement="top" />
                          </span>
                        ) : null}
                      </label>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </div>

        <div className="pp-modal-actions-lg pp-expertise-modal-footer">
          <button type="button" style={styles.buttonSecondary} onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TradieExpertiseSection({
  styles,
  draftBio,
  onDraftBioChange,
  bioTooShort,
  draftExpertiseApproved,
  toggleExpertiseLocal,
  expertiseSaving,
  expertiseMsg,
  expertiseMsgType,
  sectionDirty,
  onSavePublicProfile,
}) {
  const [expertiseEditorOpen, setExpertiseEditorOpen] = useState(false);
  const [expertiseSearchQuery, setExpertiseSearchQuery] = useState('');

  const selectedCount = Array.isArray(draftExpertiseApproved) ? draftExpertiseApproved.length : 0;
  const coreExpertise = useMemo(
    () => (Array.isArray(draftExpertiseApproved) ? draftExpertiseApproved.slice(0, MAX_CORE_EXPERTISE) : []),
    [draftExpertiseApproved]
  );
  const additionalExpertise = useMemo(
    () => (Array.isArray(draftExpertiseApproved) ? draftExpertiseApproved.slice(MAX_CORE_EXPERTISE) : []),
    [draftExpertiseApproved]
  );

  const openEditor = () => {
    setExpertiseSearchQuery('');
    setExpertiseEditorOpen(true);
  };

  const closeEditor = () => setExpertiseEditorOpen(false);

  return (
    <>
      <section className="pp-public-profile-section pp-public-profile-section--bio pp-expert-subsection pp-expert-subsection--about">
        <p className="pp-expert-eyebrow">About</p>
        <div style={styles.formGroup}>
          <div style={styles.labelContainer}>
            <label style={styles.fieldLabel} className="pp-public-profile-label">
              Bio / tagline <span style={styles.required}>*</span>
            </label>
            <span style={styles.charCounter}>{draftBio.length}/250</span>
          </div>
          <textarea
            value={draftBio}
            onChange={(e) => onDraftBioChange(e.target.value)}
            style={styles.textArea}
            className="profile-textarea pp-public-profile-textarea"
            placeholder="Tell Clients what you do, your experience, and what makes your work stand out."
            maxLength={250}
          />
          <p style={styles.fieldHint}>
            Shown on your public profile. Helps Clients decide whether to invite or accept your quote (minimum 20
            characters).
          </p>
          {bioTooShort ? (
            <div className="pp-bio-too-short">Bio must be at least 20 characters.</div>
          ) : null}
        </div>
      </section>

      <section className="pp-public-profile-section pp-public-profile-section--expertise pp-expert-subsection pp-expert-subsection--tasks">
        <div style={styles.formGroup}>
          <div className="pp-expertise-header pp-expertise-header--with-eyebrow">
            <div>
              <p className="pp-expert-eyebrow pp-expert-eyebrow--inline">Task types</p>
              <p className="pp-expertise-lede pp-expertise-lede--tight">
                Your core focus (up to {MAX_CORE_EXPERTISE}) appears first. Add more for broader visibility—many Experts
                do best with a tight set that matches how Clients search.
              </p>
            </div>
            {expertiseSaving ? (
              <span style={styles.savingIndicator}>
                <span style={styles.buttonSpinner}>↻</span> Saving...
              </span>
            ) : null}
          </div>
          <p className="pp-expertise-required-hint">
            <span style={styles.required}>*</span> Select at least one task type Clients can hire you for.
          </p>

          {selectedCount > MAX_CORE_EXPERTISE ? (
            <div className="pp-expertise-tip-banner" role="status">
              Tip: Experts who keep 3–5 focused task types often receive more relevant invitations.
            </div>
          ) : null}

          <div className="pp-expertise-summary-panel">
            <div className="pp-expertise-summary-heading">Core focus (shown first)</div>
            {coreExpertise.length === 0 ? (
              <p className="pp-expertise-empty">No task types selected yet. Add at least one to appear in search.</p>
            ) : (
              <ul className="pp-expertise-chip-list" aria-label="Core task types">
                {coreExpertise.map((k) => (
                  <li key={k} className="pp-expertise-chip pp-expertise-chip--core">
                    {getCanonicalJobTypeLabel(k) || k}
                  </li>
                ))}
              </ul>
            )}

            {additionalExpertise.length > 0 ? (
              <div className="pp-expertise-additional-block">
                <div className="pp-expertise-summary-heading pp-expertise-summary-heading--sub">
                  Additional ({additionalExpertise.length})
                </div>
                <ul className="pp-expertise-additional-chips" aria-label="Additional task types">
                  {additionalExpertise.map((k) => (
                    <li key={k} className="pp-expertise-chip pp-expertise-chip--additional">
                      {getCanonicalJobTypeLabel(k) || k}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <div className="pp-expertise-actions-row">
            <button type="button" className="pp-expertise-edit-btn" onClick={openEditor} disabled={expertiseSaving}>
              {expertiseSaving ? 'Saving…' : 'Edit task types'}
            </button>
            {selectedCount > 0 ? (
              <span className="pp-expertise-count-pill">
                {selectedCount} selected
              </span>
            ) : null}
          </div>

          {expertiseMsg ? (
            <div
              className={
                expertiseMsgType === 'success'
                  ? 'pp-expertise-inline-msg pp-expertise-inline-msg--success'
                  : 'pp-expertise-inline-msg pp-expertise-inline-msg--notice'
              }
              role="status"
              aria-live="polite"
            >
              {expertiseMsg}
            </div>
          ) : null}

          <div
            className={`pp-expertise-save-row${sectionDirty ? '' : ' pp-expertise-save-row--clean'}`}
          >
            {sectionDirty ? (
              <div className="pp-expert-save-toolbar" aria-live="polite">
                <span className="pp-save-pill pp-save-pill--unsaved">Unsaved changes</span>
              </div>
            ) : null}
            <button
              type="button"
              style={{
                ...styles.buttonPrimary,
                ...(expertiseSaving || !sectionDirty || bioTooShort ? { opacity: 0.6, cursor: 'not-allowed' } : null),
              }}
              onClick={onSavePublicProfile}
              disabled={expertiseSaving || !sectionDirty || bioTooShort}
            >
              {expertiseSaving ? 'Saving…' : 'Save public profile'}
            </button>
          </div>
        </div>
      </section>

      <ExpertiseEditorModal
        open={expertiseEditorOpen}
        onClose={closeEditor}
        styles={styles}
        draftExpertiseApproved={draftExpertiseApproved}
        toggleExpertiseLocal={toggleExpertiseLocal}
        expertiseSaving={expertiseSaving}
        searchQuery={expertiseSearchQuery}
        onSearchQueryChange={setExpertiseSearchQuery}
      />
    </>
  );
}
