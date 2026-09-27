import React, { useMemo } from 'react';
import { expertCategoryOrder, phase1ExpertiseCatalog } from '../../shared/expertiseCatalog';
import { getCanonicalJobTypeLabel } from '../../constants/taskTaxonomy';
import { melbournePilotLocations, pilotServiceAreaDisplayName } from '../../shared/auLocations';

function groupExpertiseOptions(items) {
  const order = Array.isArray(expertCategoryOrder) && expertCategoryOrder.length > 0
    ? expertCategoryOrder
    : [...new Set(items.map((item) => item.expertCategory || item.category))];

  return order
    .map((title) => ({
      title,
      items: items.filter((item) => (item.expertCategory || item.category) === title),
    }))
    .filter((group) => group.items.length > 0);
}

export default function ExpertSignupSelections({
  expertise,
  serviceAreas,
  fieldErrors,
  onExpertiseToggle,
  onServiceAreaToggle,
}) {
  const groupedExpertise = useMemo(() => groupExpertiseOptions(phase1ExpertiseCatalog), []);

  return (
    <>
      <fieldset
        style={styles.fieldset}
        aria-describedby={`expert-service-areas-help${fieldErrors.serviceAreas ? ' expert-service-areas-error' : ''}`}
      >
        <legend style={styles.legend}>Service areas</legend>
        <div style={styles.header}>
          <p id="expert-service-areas-help" style={styles.help}>Select all Inner Melbourne pilot areas you can cover.</p>
          {serviceAreas.length > 0 ? <div style={styles.selectionBadge}>{serviceAreas.length} selected</div> : null}
        </div>
        <div style={styles.optionGrid} className="expert-signup-serviceAreasGrid">
          {melbournePilotLocations.map((location) => {
            const isSelected = serviceAreas.includes(location.suburb);
            return (
              <label
                key={`${location.suburb}|${location.postcode}`}
                style={{ ...styles.option, ...(isSelected ? styles.optionSelected : {}) }}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onServiceAreaToggle(location.suburb)}
                />
                <span>{pilotServiceAreaDisplayName(location.suburb)}</span>
              </label>
            );
          })}
        </div>
        {fieldErrors.serviceAreas ? <div id="expert-service-areas-error" role="alert" style={styles.fieldError}>{fieldErrors.serviceAreas}</div> : null}
      </fieldset>

      <fieldset
        style={styles.fieldset}
        aria-describedby={`expert-expertise-help${fieldErrors.expertise ? ' expert-expertise-error' : ''}`}
      >
        <legend style={styles.legend}>Areas of expertise</legend>
        <div style={styles.header}>
          <p id="expert-expertise-help" style={styles.help}>Select all that apply.</p>
          {expertise.length > 0 ? <div style={styles.selectionBadge}>{expertise.length} selected</div> : null}
        </div>
        {groupedExpertise.map((group) => (
          <div key={group.title} style={styles.group}>
            <h3 style={styles.groupTitle}>{group.title}</h3>
            <div style={styles.optionGrid} className="expert-signup-expertiseGrid">
              {group.items.map((option) => {
                const isSelected = expertise.includes(option.key);
                return (
                  <label
                    key={option.key}
                    style={{ ...styles.option, ...(isSelected ? styles.optionSelected : {}) }}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onExpertiseToggle(option.key)}
                    />
                    <span>{getCanonicalJobTypeLabel(option.key) || option.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
        {fieldErrors.expertise ? <div id="expert-expertise-error" role="alert" style={styles.fieldError}>{fieldErrors.expertise}</div> : null}
      </fieldset>
    </>
  );
}

const styles = {
  fieldset: {
    display: 'grid',
    gap: 18,
    minWidth: 0,
    margin: 0,
    padding: 0,
    border: 0,
  },
  legend: {
    padding: 0,
    fontSize: 14,
    fontWeight: 700,
    color: '#374151',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'flex-start',
    flexWrap: 'wrap',
  },
  help: {
    margin: 0,
    fontSize: 13,
    lineHeight: 1.6,
    color: '#6B7280',
  },
  selectionBadge: {
    borderRadius: 999,
    backgroundColor: '#ECFEFF',
    color: '#0F766E',
    border: '1px solid #A5F3FC',
    fontSize: 12,
    fontWeight: 800,
    padding: '7px 12px',
    whiteSpace: 'nowrap',
  },
  group: {
    display: 'grid',
    gap: 12,
  },
  groupTitle: {
    margin: 0,
    fontSize: 15,
    fontWeight: 800,
    color: '#111827',
  },
  optionGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: 12,
  },
  option: {
    minHeight: 48,
    boxSizing: 'border-box',
    borderRadius: 16,
    border: '1px solid #D1D5DB',
    backgroundColor: '#FFFFFF',
    color: '#111827',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    fontSize: 14,
    fontWeight: 600,
    lineHeight: 1.5,
    padding: '12px 14px',
    cursor: 'pointer',
  },
  optionSelected: {
    borderColor: '#14C5C5',
    backgroundColor: '#ECFEFF',
    color: '#0F766E',
    boxShadow: '0 0 0 1px rgba(20, 197, 197, 0.2)',
  },
  fieldError: {
    marginTop: 6,
    color: '#b91c1c',
    fontSize: 13,
    lineHeight: 1.4,
  },
};
