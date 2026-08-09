'use strict';

const { admin, db } = require('../firebaseAdmin');
const { refreshWorkItemSla } = require('./adminWorkItemService');
const { evaluateJobRiskById } = require('./riskAutomationPipeline');
const { safeToMillis } = require('../utils/firestore');

const STALE_RISK_MS = 2 * 60 * 60 * 1000;

/**
 * Idempotent batch: refresh SLA labels + optionally re-evaluate stale job risk.
 */
async function runStaleWorkflowRefresh() {
  const now = Date.now();
  const snap = await db.collection('admin_work_items').limit(400).get();
  let refreshed = 0;
  const jobRiskRefreshed = new Set();

  for (const doc of snap.docs) {
    const data = doc.data() || {};
    if (String(data.status) === 'resolved') continue;

    await refreshWorkItemSla(doc.ref, data, now);
    refreshed += 1;

    if (data.entityType === 'job' && ['payment', 'dispute', 'risk'].includes(String(data.category))) {
      const jid = String(data.entityId || '');
      if (!jid || jobRiskRefreshed.has(jid)) continue;
      const jSnap = await db.collection('jobs').doc(jid).get();
      if (!jSnap.exists) continue;
      const j = jSnap.data() || {};
      const last = j.riskSummary?.lastEvaluatedAtMs || 0;
      if (!last || now - last > STALE_RISK_MS) {
        try {
          await evaluateJobRiskById(jid);
          jobRiskRefreshed.add(jid);
        } catch (_) {
          /* ignore */
        }
      }
    }
  }

  return { refreshed, jobRiskSnapshotsUpdated: jobRiskRefreshed.size };
}

module.exports = { runStaleWorkflowRefresh, STALE_RISK_MS };
