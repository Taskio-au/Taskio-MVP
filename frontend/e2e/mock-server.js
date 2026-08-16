'use strict';

const http = require('http');
const { URL } = require('url');

const PORT = Number(process.env.E2E_MOCK_API_PORT || 3800);
const jobs = new Map();

function send(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  });
  res.end(body);
}

function requireAuth(req, res) {
  const auth = String(req.headers.authorization || '');
  if (!auth.startsWith('Bearer ')) {
    send(res, 401, { message: 'Unauthorized for e2e mock API.' });
    return false;
  }
  return true;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += String(chunk);
      if (raw.length > 1024 * 1024) reject(new Error('payload_too_large'));
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function ensureJob(jobId) {
  if (!jobs.has(jobId)) {
    jobs.set(jobId, {
      jobId,
      status: 'in_progress',
      paymentState: 'in_escrow',
      disputeFlag: false,
    });
  }
  return jobs.get(jobId);
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    return send(res, 200, { ok: true });
  }

  const parsed = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const path = parsed.pathname;

  try {
    if (req.method === 'GET' && path === '/health') {
      return send(res, 200, { ok: true });
    }

    if (req.method === 'POST' && /^\/api\/jobs\/[^/]+\/checkout$/.test(path)) {
      if (!requireAuth(req, res)) return;
      const body = await readJson(req);
      const quoteId = String(body.quoteId || '');

      if (quoteId === 'phone-gate') {
        return send(res, 403, {
          message: 'Verify your email or continue with Google before paying.',
          code: 'account_completion_required',
        });
      }

      return send(res, 200, { sessionId: 'cs_test_taskio_e2e_123' });
    }

    if (req.method === 'POST' && path === '/api/e2e/payment/start') {
      if (!requireAuth(req, res)) return;
      const body = await readJson(req);
      const jobId = String(body.jobId || 'e2e-job-1');
      const job = ensureJob(jobId);
      job.paymentState = 'in_escrow';
      job.status = 'in_progress';
      job.disputeFlag = false;
      return send(res, 200, job);
    }

    if (req.method === 'POST' && path === '/api/e2e/payment/flag-dispute') {
      if (!requireAuth(req, res)) return;
      const body = await readJson(req);
      const jobId = String(body.jobId || 'e2e-job-1');
      const job = ensureJob(jobId);
      job.disputeFlag = true;
      job.status = 'disputed';
      job.paymentState = 'disputed';
      return send(res, 200, job);
    }

    if (req.method === 'POST' && path === '/api/e2e/payment/clear-dispute') {
      if (!requireAuth(req, res)) return;
      const body = await readJson(req);
      const jobId = String(body.jobId || 'e2e-job-1');
      const job = ensureJob(jobId);
      job.disputeFlag = false;
      job.status = 'in_progress';
      job.paymentState = 'in_escrow';
      return send(res, 200, job);
    }

    if (req.method === 'POST' && path === '/api/e2e/payment/release') {
      if (!requireAuth(req, res)) return;
      const body = await readJson(req);
      const jobId = String(body.jobId || 'e2e-job-1');
      const job = ensureJob(jobId);
      job.status = 'completed';
      job.paymentState = 'released';
      return send(res, 200, job);
    }

    return send(res, 404, { message: 'not_found' });
  } catch (e) {
    return send(res, 500, { message: e?.message || 'mock_server_error' });
  }
});

module.exports = { server, PORT };

if (require.main === module) {
  server.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`E2E mock API listening on ${PORT}`);
  });
}
