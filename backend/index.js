'use strict';

const express = require('express');
const admin = require('firebase-admin');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

// TODO: Add your Stripe secret key to your .env file
// const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

/* -------------------------------------------------------------------------- */
/* Firebase Admin Init                                                          */
/* -------------------------------------------------------------------------- */
if (!admin.apps.length) {
  // If running locally, prefer GOOGLE_APPLICATION_CREDENTIALS env var
  // Alternatively, you can set FIREBASE_SERVICE_ACCOUNT_JSON to stringified json
  const saJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (saJson) {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(saJson)) });
  } else {
    admin.initializeApp();
  }
}

const db = admin.firestore();

/* -------------------------------------------------------------------------- */
/* Express Setup                                                                */
/* -------------------------------------------------------------------------- */
const app = express();
const port = process.env.PORT || 8000;

/* ------------------------------- Security --------------------------------- */
// CORS allowlist (recommended for production)
const allowedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    // Allow non-browser requests (no Origin header) such as curl/Postman
    if (!origin) return callback(null, true);

    // If no allowlist configured, block browser origins to avoid accidental open CORS
    if (allowedOrigins.length === 0) return callback(new Error('CORS blocked: no allowlist configured'));

    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
};

app.use(cors(corsOptions));
app.use(helmet());

// Rate limiters
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(generalLimiter);
app.use(express.json({ limit: '1mb' }));

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */
function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function safeToMillis(ts) {
  // Firestore Timestamp -> millis; safely handle undefined/serverTimestamp placeholders
  try {
    if (!ts) return 0;
    if (typeof ts.toMillis === 'function') return ts.toMillis();
    // If something like { _seconds } leaks through
    if (typeof ts._seconds === 'number') return ts._seconds * 1000;
    return 0;
  } catch {
    return 0;
  }
}

/* -------------------------------------------------------------------------- */
/* Authentication Middleware                                                    */
/* -------------------------------------------------------------------------- */
const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).send({ message: 'Unauthorized: No token provided' });
  }
  const idToken = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.user = decodedToken;
    return next();
  } catch (error) {
    return res.status(401).send({ message: 'Unauthorized: Invalid token' });
  }
};

/* -------------------------------------------------------------------------- */
/* Admin Middleware                                                             */
/* -------------------------------------------------------------------------- */
const adminMiddleware = async (req, res, next) => {
  const user = req.user;
  if (user && user.admin === true) {
    return next();
  }
  return res.status(403).send({ message: 'Forbidden: Requires admin privileges' });
};

/* -------------------------------------------------------------------------- */
/* Health / Root                                                                */
/* -------------------------------------------------------------------------- */
app.get('/health', (req, res) => res.status(200).json({ ok: true }));

app.get('/', (req, res) => {
  res.send('Taskio Backend is running and connected to Firebase!');
});

/* -------------------------------------------------------------------------- */
/* User Registration                                                           */
/* -------------------------------------------------------------------------- */
app.post('/api/users/register', authLimiter, async (req, res) => {
  try {
    const { email, password, role, expertise, firstName, lastName } = req.body;

    if (!role || (role !== 'homeowner' && role !== 'tradie')) {
      return res.status(400).send({ message: "A valid role ('homeowner' or 'tradie') is required." });
    }
    if (!isNonEmptyString(email)) {
      return res.status(400).send({ message: 'A valid email is required.' });
    }
    if (!isNonEmptyString(password) || password.length < 8) {
      return res.status(400).send({ message: 'Password must be at least 8 characters.' });
    }

    const userRecord = await admin.auth().createUser({
      email: email.trim().toLowerCase(),
      password,
      emailVerified: false,
      displayName: `${firstName || ''} ${lastName || ''}`.trim(),
    });

    // Keep your role claim
    await admin.auth().setCustomUserClaims(userRecord.uid, { role });

    const userData = {
      email: userRecord.email,
      firstName: firstName || '',
      lastName: lastName || '',
      role,
      status: 'active',
      verified: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (role === 'tradie') {
      userData.expertise = Array.isArray(expertise) ? expertise : (expertise ? [expertise] : []);
    }

    await db.collection('users').doc(userRecord.uid).set(userData);

    return res.status(201).send({ message: 'User created successfully', uid: userRecord.uid });
  } catch (error) {
    console.error('Error in user registration:', error);
    return res.status(400).send({ message: 'Error creating user', error: error.message });
  }
});

/* -------------------------------------------------------------------------- */
/* AI Endpoints (Gemini)                                                       */
/* -------------------------------------------------------------------------- */

// --- AI Title Suggestions Endpoint ---
app.post('/api/title-suggestions', async (req, res) => {
  const { title } = req.body;
  if (!title) return res.status(400).json({ error: 'Title is required.' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Server configuration error.' });

  const prompt =
    `A user is typing a job title: "${title}". Based on this, suggest 3 to 5 clearer, more specific job titles a tradie would understand. ` +
    `Return ONLY a valid JSON array of strings. For example: ["Fix leaking kitchen sink tap", "Replace kitchen mixer tap", "Investigate low water pressure in kitchen"].`;

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;
  const payload = { contents: [{ role: 'user', parts: [{ text: prompt }] }] };

  try {
    const apiResponse = await axios.post(apiUrl, payload, { timeout: 15000 });
    const textResponse = apiResponse.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    const jsonString = textResponse.replace(/```json|```/g, '').trim();
    const suggestions = JSON.parse(jsonString);

    return res.json({ suggestions });
  } catch (error) {
    console.error('Error fetching title suggestions:', error.response ? error.response.data : error.message);
    return res.status(500).json({ error: 'Failed to generate title suggestions.' });
  }
});

// --- AI Job Description Generation Endpoint (Multi-Mode) ---
app.post('/api/generate-description', async (req, res) => {
  const { title, description, mode, answers } = req.body;

  if (!title) return res.status(400).json({ error: 'A valid job title is required.' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Server configuration error.' });

  let prompt;

  if (mode === 'draft') {
    prompt =
      `You are a homeowner in Sydney, Australia, posting a task on a website. Your task is about "${title}". ` +
      `Write a short, simple, and friendly description of what you need done. Speak in the first person (e.g., "I need...", "My tap is..."). ` +
      `Keep it to 2-3 casual sentences. Do not use any headings, titles, bullet points, or any formal language like "Key Responsibilities" or "Requirements".`;
  } else if (mode === 'clarify') {
    prompt = `You are an AI assistant helping a homeowner write a job post. Your task is to refine their input into a simple, friendly summary.

User's Title: "${title}"
User's Draft Description: "${description}"

Rewrite their description into a single, short paragraph of 2-4 sentences. Write from the homeowner's perspective (e.g., "I'm looking for someone to...", "My tap is...").

IMPORTANT RULES:
- DO NOT use any headings or titles like "Job Description" or "Overview".
- DO NOT use any bullet points or numbered lists.
- DO NOT use any formal language like "Key Responsibilities", "Requirements", or "To Apply".
- The entire output must be a single, casual paragraph.`;
  } else if (mode === 'clarify_with_answers') {
    const formattedAnswers = answers && typeof answers === 'object'
      ? Object.entries(answers).map(([q, a]) => `- ${q}\n  - ${a}`).join('\n')
      : '';
    prompt = `You are an AI assistant helping a homeowner write a job post. The user has provided an initial description and answered some clarifying questions. Your task is to combine all this information into a single, clear, and concise job description.

User's Title: "${title}"
User's Original Description: "${description}"
User's Answers to Questions:
${formattedAnswers}

Rewrite the description from the homeowner's perspective into a single, natural-sounding paragraph. Seamlessly integrate the answers into the text. Do not use any headings or formal language.`;
  } else {
    return res.status(400).json({ error: 'Invalid mode specified.' });
  }

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;
  const payload = { contents: [{ role: 'user', parts: [{ text: prompt }] }] };

  try {
    const apiResponse = await axios.post(apiUrl, payload, { timeout: 15000 });
    const result = apiResponse.data;

    const generatedText = result?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!generatedText) throw new Error('Invalid response structure from API.');

    const cleanedText = generatedText.replace(/(\*\*|##|#|\*|-)/g, '').trim();
    return res.json({ description: cleanedText });
  } catch (error) {
    console.error('Error in /api/generate-description:', error.response ? error.response.data : error.message);
    return res.status(500).json({ error: 'An internal server error occurred.' });
  }
});

// --- AI Question Generation Endpoint ---
app.post('/api/ask-questions', async (req, res) => {
  const { title, description } = req.body;
  if (!title || !description) return res.status(400).json({ error: 'Title and description are required.' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Server configuration error.' });

  const prompt = `A user has written a job description. Ask 2-4 clarifying questions to get more specific details that a tradie would need to provide an accurate quote. The questions should be simple and easy for a homeowner to answer.

Job Title: "${title}"
Job Description: "${description}"

Return ONLY a valid JSON array of strings. For example: ["Is the tap dripping constantly or only when in use?", "What brand is the tap, if you know?", "Is there any visible water damage under the sink?"].`;

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;
  const payload = { contents: [{ role: 'user', parts: [{ text: prompt }] }] };

  try {
    const apiResponse = await axios.post(apiUrl, payload, { timeout: 15000 });
    const textResponse = apiResponse.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    const jsonString = textResponse.replace(/```json|```/g, '').trim();
    const questions = JSON.parse(jsonString);

    return res.json({ questions });
  } catch (error) {
    console.error('Error fetching questions:', error.response ? error.response.data : error.message);
    return res.status(500).json({ error: 'Failed to generate questions.' });
  }
});

/* -------------------------------------------------------------------------- */
/* Suburb Search Proxy (single canonical route)                                */
/* -------------------------------------------------------------------------- */
app.get('/api/suburb-search', async (req, res) => {
  const q = (req.query.q || '').toString().trim();
  if (!q) return res.status(400).send({ message: 'A search query is required.' });

  try {
    let apiUrl;
    if (!Number.isNaN(Number(q)) && q.length === 4) {
      apiUrl = `https://v0.postcodeapi.com.au/suburbs.json?postcode=${q}`;
    } else {
      apiUrl = `https://v0.postcodeapi.com.au/suburbs.json?name=${encodeURIComponent(q)}`;
    }

    const response = await axios.get(apiUrl, { timeout: 10000 });
    return res.status(200).send(response.data);
  } catch (error) {
    console.error('Suburb Search API proxy error:', error.message);
    return res.status(500).send({ message: 'Failed to fetch suburb data.' });
  }
});

/* -------------------------------------------------------------------------- */
/* Jobs (Homeowner)                                                            */
/* -------------------------------------------------------------------------- */

// Create Job Endpoint - PROTECTED
app.post('/api/jobs', authMiddleware, async (req, res) => {
  try {
    const { title, description, location, timeline, budget } = req.body;
    const homeownerUid = req.user.uid;

    if (!isNonEmptyString(title) || !isNonEmptyString(description)) {
      return res.status(400).send({ message: 'Title and description are required.' });
    }

    const jobData = {
      homeownerUid,
      title: title.trim(),
      description: description.trim(),
      location: location || '',
      timeline: timeline || '',
      budget: budget ?? null,
      status: 'open',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      invitedTradieUids: [],
    };

    const jobRef = await db.collection('jobs').add(jobData);
    return res.status(201).send({ message: 'Job created successfully', jobId: jobRef.id });
  } catch (error) {
    console.error('Error creating job:', error);
    return res.status(500).send({ message: 'Failed to create job' });
  }
});

// Get Job by ID Endpoint (owner or admin only)
app.get('/api/jobs/:id', authMiddleware, async (req, res) => {
  try {
    const jobId = req.params.id;
    const jobDoc = await db.collection('jobs').doc(jobId).get();

    if (!jobDoc.exists) return res.status(404).send({ message: 'Job not found' });

    const jobData = jobDoc.data();
    if (jobData.homeownerUid !== req.user.uid && !req.user.admin) {
      return res.status(403).send({ message: 'Forbidden: You do not have access to this job.' });
    }

    return res.status(200).send({ id: jobDoc.id, ...jobData });
  } catch (error) {
    console.error('Error fetching job:', error);
    return res.status(500).send({ message: 'Failed to fetch job' });
  }
});

// Get Jobs for a specific Homeowner
app.get('/api/homeowner/jobs', authMiddleware, async (req, res) => {
  try {
    const homeownerUid = req.user.uid;

    const jobsSnapshot = await db.collection('jobs').where('homeownerUid', '==', homeownerUid).get();
    if (jobsSnapshot.empty) return res.status(200).send([]);

    const jobsDataPromises = jobsSnapshot.docs.map(async (doc) => {
      const jobData = { id: doc.id, ...doc.data() };

      const quotesSnapshot = await db.collection('quotes').where('jobId', '==', doc.id).get();
      jobData.quoteCount = quotesSnapshot.size;

      return jobData;
    });

    const jobsWithQuotes = await Promise.all(jobsDataPromises);

    jobsWithQuotes.sort((a, b) => safeToMillis(b.createdAt) - safeToMillis(a.createdAt));
    return res.status(200).send(jobsWithQuotes);
  } catch (error) {
    console.error("Error fetching homeowner's jobs:", error);
    return res.status(500).send({ message: 'Failed to fetch jobs' });
  }
});

// Get all quotes for a specific job (for the job owner)
app.get('/api/jobs/:jobId/quotes', authMiddleware, async (req, res) => {
  try {
    const { jobId } = req.params;
    const homeownerUid = req.user.uid;

    const jobDoc = await db.collection('jobs').doc(jobId).get();
    if (!jobDoc.exists || jobDoc.data().homeownerUid !== homeownerUid) {
      return res.status(403).send({ message: 'Forbidden: You do not have access to this job.' });
    }

    const quotesSnapshot = await db.collection('quotes').where('jobId', '==', jobId).get();
    if (quotesSnapshot.empty) return res.status(200).send([]);

    const quotes = quotesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    quotes.sort((a, b) => safeToMillis(b.createdAt) - safeToMillis(a.createdAt));

    return res.status(200).send(quotes);
  } catch (error) {
    console.error('Error fetching quotes for job:', error);
    return res.status(500).send({ message: 'Failed to fetch quotes' });
  }
});

/* -------------------------------------------------------------------------- */
/* Quotes (Tradie submits)                                                     */
/* -------------------------------------------------------------------------- */
app.post('/api/jobs/:id/quotes', authMiddleware, async (req, res) => {
  try {
    const jobId = req.params.id;
    const tradieUid = req.user.uid;
    const { amount, message } = req.body;

    const amt = Number(amount);
    if (Number.isNaN(amt) || amt <= 0 || !isNonEmptyString(message)) {
      return res.status(400).send({ message: 'Invalid quote data. Please provide a positive amount and a message.' });
    }

    const quoteData = {
      jobId,
      tradieUid,
      amount: amt,
      message: message.trim(),
      status: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const quoteRef = await db.collection('quotes').add(quoteData);
    return res.status(201).send({ message: 'Quote submitted successfully', quoteId: quoteRef.id });
  } catch (error) {
    console.error('Error submitting quote:', error);
    return res.status(500).send({ message: 'Failed to submit quote' });
  }
});

/* -------------------------------------------------------------------------- */
/* Funding (Simulated Stripe)                                                  */
/* -------------------------------------------------------------------------- */
/**
 * @route POST /api/jobs/:jobId/fund
 * @description Creates a payment intent for a job after a quote is accepted.
 * @access Private (Homeowner)
 */
app.post('/api/jobs/:jobId/fund', authMiddleware, async (req, res) => {
  try {
    const { jobId } = req.params;
    const { quoteId } = req.body;
    const homeownerUid = req.user.uid;

    if (!quoteId) return res.status(400).send({ message: 'A valid quoteId is required.' });

    const jobRef = db.collection('jobs').doc(jobId);
    const quoteRef = db.collection('quotes').doc(quoteId);

    const [jobDoc, quoteDoc] = await Promise.all([jobRef.get(), quoteRef.get()]);
    if (!jobDoc.exists || !quoteDoc.exists) {
      return res.status(404).send({ message: 'Job or Quote not found.' });
    }

    const jobData = jobDoc.data();
    const quoteData = quoteDoc.data();

    if (jobData.homeownerUid !== homeownerUid) {
      return res.status(403).send({ message: 'Forbidden: You do not own this job.' });
    }
    if (quoteData.jobId !== jobId) {
      return res.status(400).send({ message: 'Mismatch: This quote does not belong to the specified job.' });
    }
    if (jobData.status !== 'open' && jobData.status !== 'assigned') {
      return res.status(400).send({ message: `Cannot fund job with status: ${jobData.status}` });
    }

    const amountInCents = Number(quoteData.amount) * 100;

    // SIMULATED STRIPE RESPONSE (keep as-is for MVP until Stripe is wired)
    const now = Date.now();
    const simulatedPaymentIntent = {
      id: `pi_${now}`,
      client_secret: `pi_${now}_secret_${now}`,
      amount: amountInCents,
      currency: 'aud',
    };

    const batch = db.batch();
    batch.update(jobRef, {
      status: 'awaiting_funding',
      acceptedQuoteId: quoteId,
      acceptedTradieUid: quoteData.tradieUid, // keeping your existing field name
    });
    batch.update(quoteRef, { status: 'accepted' });
    await batch.commit();

    return res.status(200).send({
      clientSecret: simulatedPaymentIntent.client_secret,
      message: 'Payment intent created successfully.',
    });
  } catch (error) {
    console.error('Error creating payment intent:', error);
    return res.status(500).send({ message: 'Failed to create payment intent.' });
  }
});

/* -------------------------------------------------------------------------- */
/* Tradie Endpoints                                                            */
/* -------------------------------------------------------------------------- */

// Get all jobs a tradie has been invited to
app.get('/api/tradie/jobs', authMiddleware, async (req, res) => {
  try {
    const tradieUid = req.user.uid;

    const jobsSnapshot = await db.collection('jobs')
      .where('invitedTradieUids', 'array-contains', tradieUid)
      .get();

    if (jobsSnapshot.empty) return res.status(200).send([]);

    const jobs = jobsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    jobs.sort((a, b) => safeToMillis(b.createdAt) - safeToMillis(a.createdAt));

    return res.status(200).send(jobs);
  } catch (error) {
    console.error("Error fetching tradie's jobs:", error);
    return res.status(500).send({ message: 'Failed to fetch jobs for tradie' });
  }
});

// Get a single job for an invited tradie
app.get('/api/tradie/jobs/:jobId', authMiddleware, async (req, res) => {
  try {
    const tradieUid = req.user.uid;
    const { jobId } = req.params;

    const jobDoc = await db.collection('jobs').doc(jobId).get();
    if (!jobDoc.exists) return res.status(404).send({ message: 'Job not found.' });

    const jobData = jobDoc.data();

    if (!jobData.invitedTradieUids || !jobData.invitedTradieUids.includes(tradieUid)) {
      return res.status(403).send({ message: 'Forbidden: You are not invited to quote on this job.' });
    }

    return res.status(200).send({ id: jobDoc.id, ...jobData });
  } catch (error) {
    console.error('Error fetching single job for tradie:', error);
    return res.status(500).send({ message: 'Failed to fetch job details.' });
  }
});

/* -------------------------------------------------------------------------- */
/* Admin Endpoints                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Issue 1 - Option A:
 * - Protected by authMiddleware + adminMiddleware
 * - Disabled by default unless ENABLE_SET_ADMIN_ENDPOINT=true
 */
app.post('/api/admin/set-admin/:uid', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    if (process.env.ENABLE_SET_ADMIN_ENDPOINT !== 'true') {
      return res.status(404).send({ message: 'Not found' });
    }

    const uid = req.params.uid;
    const userRecord = await admin.auth().getUser(uid);
    const customClaims = userRecord.customClaims || {};

    await admin.auth().setCustomUserClaims(uid, { ...customClaims, admin: true });

    return res.status(200).send({ message: `Successfully made user ${uid} an admin.` });
  } catch (error) {
    console.error('Error setting admin claim:', error);
    return res.status(500).send({ message: 'Error setting admin claim', error: error.message });
  }
});

app.get('/api/admin/jobs', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const jobsSnapshot = await db.collection('jobs').get();
    const jobs = jobsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    jobs.sort((a, b) => safeToMillis(b.createdAt) - safeToMillis(a.createdAt));
    return res.status(200).send(jobs);
  } catch (error) {
    console.error('Failed to fetch jobs:', error);
    return res.status(500).send({ message: 'Failed to fetch jobs' });
  }
});

app.get('/api/admin/users', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const usersSnapshot = await db.collection('users').get();
    const users = usersSnapshot.docs.map(doc => ({
      uid: doc.id,
      ...doc.data(),
    }));
    return res.status(200).send(users);
  } catch (error) {
    console.error('Failed to fetch users:', error);
    return res.status(500).send({ message: 'Failed to fetch users' });
  }
});

app.put('/api/admin/users/:uid/verify', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const uid = req.params.uid;
    await db.collection('users').doc(uid).update({ verified: true });
    return res.status(200).send({ message: `Successfully verified user ${uid}.` });
  } catch (error) {
    console.error('Error verifying user:', error);
    return res.status(500).send({ message: 'Error verifying user', error: error.message });
  }
});

app.put('/api/admin/users/:uid/status', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { uid } = req.params;
    const { status } = req.body;

    if (status !== 'active' && status !== 'disabled') {
      return res.status(400).send({ message: 'Invalid status provided.' });
    }

    await db.collection('users').doc(uid).update({ status });

    // Keep your existing auth disable/enable behaviour
    await admin.auth().updateUser(uid, { disabled: status === 'disabled' });

    return res.status(200).send({ message: `Successfully set user ${uid} status to ${status}.` });
  } catch (error) {
    console.error('Error updating user status:', error);
    return res.status(500).send({ message: 'Error updating user status', error: error.message });
  }
});

app.post('/api/admin/jobs/:jobId/assign', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { jobId } = req.params;
    const { tradieUid } = req.body;

    if (!tradieUid) {
      return res.status(400).send({ message: 'tradieUid is required in the request body.' });
    }

    // Server-side enforcement: must be verified, active tradie
    const tradieDoc = await db.collection('users').doc(tradieUid).get();
    if (!tradieDoc.exists) return res.status(404).send({ message: 'Tradie not found.' });

    const tradieData = tradieDoc.data();
    if (tradieData.role !== 'tradie') return res.status(400).send({ message: 'User is not a tradie.' });
    if (tradieData.verified !== true) return res.status(400).send({ message: 'Tradie is not verified.' });
    if (tradieData.status !== 'active') return res.status(400).send({ message: 'Tradie is not active.' });

    const jobRef = db.collection('jobs').doc(jobId);
    const jobDoc = await jobRef.get();
    if (!jobDoc.exists) return res.status(404).send({ message: 'Job not found.' });

    await jobRef.update({
      invitedTradieUids: admin.firestore.FieldValue.arrayUnion(tradieUid),
      status: 'assigned',
    });

    return res.status(200).send({ message: `Successfully invited tradie ${tradieUid} to job ${jobId}.` });
  } catch (error) {
    console.error('Error assigning job:', error);
    return res.status(500).send({ message: 'Failed to assign job' });
  }
});

app.delete('/api/admin/jobs/:jobId/assign/:tradieId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { jobId, tradieId } = req.params;

    const jobRef = db.collection('jobs').doc(jobId);

    await jobRef.update({
      invitedTradieUids: admin.firestore.FieldValue.arrayRemove(tradieId),
    });

    const updatedJobDoc = await jobRef.get();
    if (!updatedJobDoc.exists) return res.status(404).send({ message: 'Job not found.' });

    const updatedJobData = updatedJobDoc.data();
    if (updatedJobData.invitedTradieUids && updatedJobData.invitedTradieUids.length === 0) {
      await jobRef.update({ status: 'open' });
    }

    return res.status(200).send({ message: `Successfully unassigned tradie ${tradieId} from job ${jobId}.` });
  } catch (error) {
    console.error('Error unassigning job:', error);
    return res.status(500).send({ message: 'Failed to unassign job' });
  }
});

app.put('/api/admin/jobs/:jobId/status', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { jobId } = req.params;
    const { status } = req.body;

    const validStatuses = ['open', 'assigned', 'awaiting_funding', 'in_progress', 'completed', 'cancelled'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).send({ message: 'A valid status is required.' });
    }

    await db.collection('jobs').doc(jobId).update({ status });
    return res.status(200).send({ message: `Successfully updated job ${jobId} status to ${status}.` });
  } catch (error) {
    console.error('Error updating job status:', error);
    return res.status(500).send({ message: 'Failed to update job status' });
  }
});

/* -------------------------------------------------------------------------- */
/* Error Handling                                                              */
/* -------------------------------------------------------------------------- */
app.use((err, req, res, next) => {
  if (err && typeof err.message === 'string' && err.message.startsWith('CORS blocked')) {
    return res.status(403).json({ message: err.message });
  }
  console.error('Unhandled error:', err);
  return res.status(500).json({ message: 'Internal server error' });
});

/* -------------------------------------------------------------------------- */
/* Server Initialization                                                       */
/* -------------------------------------------------------------------------- */
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
