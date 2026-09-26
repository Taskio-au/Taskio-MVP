'use strict';

/**
 * Manually maintained launch-gate manifest.
 * Reviewed commits only. No secrets. Do not scrape markdown at runtime.
 * Companion prose: docs/LAUNCH_READINESS.md, docs/TASKIO_STATUS.md.
 */

const MANIFEST_VERSION = 2;
const MANIFEST_UPDATED_AT = '2026-09-26';

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
  note: 'P07 security/configuration readiness does not activate production. P10 owns controlled production acceptance; P11 owns controlled launch execution and is not required for READY TO OPEN.',
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
      status: GATE_STATUS.PRODUCTION_PASS,
      evidenceSummary: 'Staging and production transactional email proofs passed; production SMTP/sender/domain are proven.',
      lastUpdated: '2026-09-25',
      notes: 'P03 is complete and closed. Customer-facing email remains disabled pending later approved activation.',
    }),
    Object.freeze({
      id: 'P04',
      label: 'Analytics',
      group: GATE_GROUP.PRODUCTION_SERVICES,
      requiredForReadyToOpen: true,
      requiredResult: REQUIRED_RESULT.PRODUCTION_PASS,
      status: GATE_STATUS.PASS,
      evidenceSummary: 'Staging analytics proof passed. Owner-approved production-OFF exception satisfies this gate; production GA4 remains disabled.',
      lastUpdated: '2026-09-26',
      notes: 'Keep production GA4 off through P06/P09. If later selected, enablement and proof belong to P10 after approved privacy wording.',
    }),
    Object.freeze({
      id: 'P05',
      label: 'App Check',
      group: GATE_GROUP.PRODUCTION_SERVICES,
      requiredForReadyToOpen: true,
      requiredResult: REQUIRED_RESULT.PRODUCTION_PASS,
      status: GATE_STATUS.PRODUCTION_PASS,
      evidenceSummary: 'Production Firestore and Storage enforcement proven; temporary proof surface removed.',
      lastUpdated: '2026-09-26',
      notes: 'P05 is complete and closed. Auth App Check remains unenforced/monitoring and out of the approved MVP scope.',
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
      status: GATE_STATUS.PASS,
      evidenceSummary: 'Fail-closed production API, current Firestore/Storage rules, P03 email, P05 App Check, and legacy Expert fail-closed compatibility are complete.',
      lastUpdated: '2026-09-26',
      notes: 'P07 is closed without a final RED mutation. Auth signup and Stripe LIVE remain intentionally disabled; P10 owns controlled enablement/proof after P06/P09. Production GA4 remains off by owner decision.',
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
      evidenceSummary: 'Production acceptance has not started: SPA/API path, Authorization forwarding, controlled Auth enablement, LIVE Stripe money loop, and critical failures remain open.',
      lastUpdated: '2026-09-26',
      notes: 'Customer-email journey is included if required. GA4 proof is optional only if later approved after P06/P09.',
    }),
    Object.freeze({
      id: 'P11',
      label: 'Controlled launch',
      group: GATE_GROUP.LAUNCH,
      requiredForReadyToOpen: false,
      requiredResult: REQUIRED_RESULT.PASS,
      status: GATE_STATUS.BLOCKED,
      evidenceSummary: 'Execution gate. Cannot start until FULL LAUNCH READY, adequate launch-ready Expert supply/coverage, and explicit owner activation.',
      lastUpdated: '2026-09-26',
      notes: 'Not a READY TO OPEN prerequisite. pilotSettings remain unmodified.',
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
