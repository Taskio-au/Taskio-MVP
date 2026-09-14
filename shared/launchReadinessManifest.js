'use strict';

/**
 * Manually maintained launch-gate manifest.
 * Reviewed commits only. No secrets. Do not scrape markdown at runtime.
 * Companion prose: docs/LAUNCH_READINESS.md, docs/TASKIO_STATUS.md.
 */

const MANIFEST_VERSION = 1;
const MANIFEST_UPDATED_AT = '2026-09-14';

const GATE_STATUS = Object.freeze({
  PASS: 'PASS',
  PASS_COMPLETE: 'PASS / COMPLETE',
  COMPLETE: 'COMPLETE',
  PRODUCTION_PASS: 'PRODUCTION PASS',
  STAGING_PASS_PRODUCTION_PENDING: 'STAGING PASS / PRODUCTION PENDING',
  PRODUCTION_PENDING: 'PRODUCTION PENDING',
  OPEN: 'OPEN',
  PENDING: 'PENDING',
  BLOCKED: 'BLOCKED',
  NOT_STARTED: 'NOT STARTED',
});

const REQUIRED_RESULT = Object.freeze({
  PASS: 'PASS',
  PRODUCTION_PASS: 'PRODUCTION PASS',
});

const GATE_GROUP = Object.freeze({
  PAYMENTS: 'Payments',
  LEGAL_PRIVACY: 'Legal / Privacy',
  PRODUCTION_SERVICES: 'Production Services',
  SECURITY: 'Security / Configuration',
  OPERATIONS: 'Operations',
  TRUST: 'Legal / Trust Implementation',
  ACCEPTANCE: 'Production Acceptance',
  LAUNCH: 'Controlled Launch',
});

const KNOWN_GATE_STATUSES = new Set(Object.values(GATE_STATUS));

const launchReadinessManifest = Object.freeze({
  version: MANIFEST_VERSION,
  updatedAt: MANIFEST_UPDATED_AT,
  source: 'shared/launchReadinessManifest.js',
  note: 'P11 is controlled-launch execution and is not required for READY TO OPEN.',
  gates: Object.freeze([
    Object.freeze({
      id: 'P01',
      label: 'Payments',
      group: GATE_GROUP.PAYMENTS,
      requiredForReadyToOpen: true,
      requiredResult: REQUIRED_RESULT.PASS,
      status: GATE_STATUS.PASS_COMPLETE,
      evidenceSummary: 'Stripe TEST connected-account bank payout proven.',
      lastUpdated: '2026-09-07',
      notes: 'Production live money-loop re-proof remains inside P10.',
    }),
    Object.freeze({
      id: 'P02',
      label: 'Refund',
      group: GATE_GROUP.PAYMENTS,
      requiredForReadyToOpen: true,
      requiredResult: REQUIRED_RESULT.PASS,
      status: GATE_STATUS.COMPLETE,
      evidenceSummary: 'Staging TEST pre-release full refund proven.',
      lastUpdated: '2026-08-30',
      notes: 'Production refund re-proof remains inside P10. P02B admin refund is optional.',
    }),
    Object.freeze({
      id: 'P03',
      label: 'Email',
      group: GATE_GROUP.PRODUCTION_SERVICES,
      requiredForReadyToOpen: true,
      requiredResult: REQUIRED_RESULT.PRODUCTION_PASS,
      status: GATE_STATUS.STAGING_PASS_PRODUCTION_PENDING,
      evidenceSummary: 'Staging transactional email verified. Production email is not configured.',
      lastUpdated: '2026-09-04',
    }),
    Object.freeze({
      id: 'P04',
      label: 'Analytics',
      group: GATE_GROUP.PRODUCTION_SERVICES,
      requiredForReadyToOpen: true,
      requiredResult: REQUIRED_RESULT.PRODUCTION_PASS,
      status: GATE_STATUS.STAGING_PASS_PRODUCTION_PENDING,
      evidenceSummary: 'Staging analytics Realtime receipt confirmed. Production analytics remain off.',
      lastUpdated: '2026-09-06',
    }),
    Object.freeze({
      id: 'P05',
      label: 'App Check',
      group: GATE_GROUP.PRODUCTION_SERVICES,
      requiredForReadyToOpen: true,
      requiredResult: REQUIRED_RESULT.PRODUCTION_PASS,
      status: GATE_STATUS.STAGING_PASS_PRODUCTION_PENDING,
      evidenceSummary: 'Staging Firestore and Storage enforcement proven. Production App Check is pending.',
      lastUpdated: '2026-09-06',
      notes: 'Auth App Check remains out of MVP scope.',
    }),
    Object.freeze({
      id: 'P06',
      label: 'Legal / Privacy',
      group: GATE_GROUP.LEGAL_PRIVACY,
      requiredForReadyToOpen: true,
      requiredResult: REQUIRED_RESULT.PASS,
      status: GATE_STATUS.OPEN,
      evidenceSummary: 'Owner facts complete. AU solicitor and focused insurance review remain open. Not PASS.',
      lastUpdated: '2026-09-12',
    }),
    Object.freeze({
      id: 'P07',
      label: 'Security',
      group: GATE_GROUP.SECURITY,
      requiredForReadyToOpen: true,
      requiredResult: REQUIRED_RESULT.PASS,
      status: GATE_STATUS.OPEN,
      evidenceSummary: 'P07A audit complete / remediation pending. Not PASS. Auth signup still disabled. See docs/P07_SECURITY_CONFIG_REMEDIATION.md.',
      lastUpdated: '2026-09-14',
    }),
    Object.freeze({
      id: 'P08',
      label: 'Operations',
      group: GATE_GROUP.OPERATIONS,
      requiredForReadyToOpen: true,
      requiredResult: REQUIRED_RESULT.PASS,
      status: GATE_STATUS.NOT_STARTED,
      evidenceSummary: 'Production operations gate has not started.',
      lastUpdated: '2026-09-06',
    }),
    Object.freeze({
      id: 'P09',
      label: 'Trust Implementation',
      group: GATE_GROUP.TRUST,
      requiredForReadyToOpen: true,
      requiredResult: REQUIRED_RESULT.PASS,
      status: GATE_STATUS.BLOCKED,
      blockedBy: Object.freeze(['P06']),
      evidenceSummary: 'Blocked on P06 approved outcomes. Must not invent legal conclusions.',
      lastUpdated: '2026-09-12',
    }),
    Object.freeze({
      id: 'P10',
      label: 'Acceptance',
      group: GATE_GROUP.ACCEPTANCE,
      requiredForReadyToOpen: true,
      requiredResult: REQUIRED_RESULT.PASS,
      status: GATE_STATUS.NOT_STARTED,
      evidenceSummary: 'Production acceptance of the money loop and critical failures has not started.',
      lastUpdated: '2026-09-06',
    }),
    Object.freeze({
      id: 'P11',
      label: 'Controlled launch',
      group: GATE_GROUP.LAUNCH,
      requiredForReadyToOpen: false,
      requiredResult: REQUIRED_RESULT.PASS,
      status: GATE_STATUS.BLOCKED,
      evidenceSummary: 'Execution gate. Cannot start until FULL LAUNCH READY, then explicit owner activation.',
      lastUpdated: '2026-09-13',
      notes: 'Not a READY TO OPEN prerequisite.',
    }),
  ]),
});

module.exports = {
  MANIFEST_VERSION,
  MANIFEST_UPDATED_AT,
  GATE_STATUS,
  REQUIRED_RESULT,
  GATE_GROUP,
  KNOWN_GATE_STATUSES,
  launchReadinessManifest,
};
