'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');

const { extractJsonObject, generateContent } = require('../services/gemini');
const { db } = require('../firebaseAdmin');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

// ---------------------------------------------------------------------------
// Description tidy helper
// ---------------------------------------------------------------------------
function fallbackDescription({ description, jobTypeLabel }) {
  const d = String(description || '').trim();
  const cleanType = String(jobTypeLabel || 'this task').trim().toLowerCase();
  if (d) {
    const cleaned = d.replace(/\s+/g, ' ').trim();
    const withCapital = cleaned.length > 0 ? cleaned[0].toUpperCase() + cleaned.slice(1) : cleaned;
    return /[.!?]$/.test(withCapital) ? withCapital : `${withCapital}.`;
  }
  return `I need help with ${cleanType}.`;
}

router.post('/api/generate-description', aiLimiter, async (req, res) => {
  const { description, mode, jobTypeLabel } = req.body;
  if (mode !== 'clarify') return res.status(400).json({ error: 'Invalid mode specified.' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.json({ description: fallbackDescription({ description, jobTypeLabel }), fallback: true });

  const prompt = `You are an AI assistant helping a homeowner tidy their draft task description so it reads clearer.

Selected Job Type: "${jobTypeLabel || 'small indoor job'}"
User's Draft Description: "${description}"

Rewrite the description into a single paragraph (1-4 short sentences), from the homeowner's perspective.

IMPORTANT RULES:
- Only tidy wording, grammar, and readability.
- DO NOT add any new requirements, scope, materials, prices, timelines, or details that are not explicitly in the draft.
- Keep the job within the same small indoor task type. Do not introduce electrical, plumbing, gas, waterproofing, or large-project work.
- DO NOT invent brand/model details, measurements, or causes.
- If something is unclear, keep it vague rather than adding assumptions.
- DO NOT use any headings or titles like "Job Description" or "Overview".
- DO NOT use any bullet points or numbered lists.
- DO NOT use any formal language like "Key Responsibilities", "Requirements", or "To Apply".
- The entire output must be a single, casual paragraph.

Output ONLY the rewritten paragraph (no extra commentary).`;

  try {
    const generatedText = await generateContent({ apiKey, prompt, timeoutMs: 15000 });
    if (!generatedText) throw new Error('Invalid response structure from API.');
    const cleanedText = String(generatedText).replace(/(\*\*|##|#|\*|-)/g, '').trim();
    return res.json({ description: cleanedText });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error in /api/generate-description:', error.details || (error.response ? error.response.data : error.message));
    return res.json({ description: fallbackDescription({ description, jobTypeLabel }), fallback: true });
  }
});

// ---------------------------------------------------------------------------
// Quote assistant — wording only
// ---------------------------------------------------------------------------

/**
 * Wording-only fallback.  No price is generated — the Expert sets the final price.
 */
function fallbackQuoteSuggestion({ job }) {
  const title = String(job?.title || '').trim() || 'the task';
  const desc  = String(job?.description || '').replace(/\s+/g, ' ').trim();
  const descSnippet = desc ? desc.slice(0, 140) : '';
  const reference = descSnippet
    ? `Based on your description ("${descSnippet}${desc.length > 140 ? '\u2026' : ''}"), I can help with this work.`
    : "Based on the details provided, I'm happy to assist with this task.";

  const message = [
    `Hi! Thanks for the post \u2014 I can help with ${title.toLowerCase()}.`,
    '',
    reference,
    '',
    'Scope of work:',
    '- Complete the work as described',
    '- Check the result with you on the day',
    '- Tidy up the work area on completion',
    '',
    'Exclusions: Anything not described above.',
    '',
    'Please let me know your preferred day and time, and any access details. I\u2019ll confirm availability.',
    '',
    '\u2014',
    'Draft only. Final price and availability are set by the Expert. Payments must stay on Taskio.',
  ].join('\n');

  return {
    message,
    assumptions: [
      'Standard site access and safe working conditions assumed.',
      'If anything is unclear from the description, the Expert will confirm before proceeding.',
      'Any additional work not described above will be agreed before starting.',
    ],
  };
}

/**
 * Patterns that must never appear in an AI-generated quote message.
 * These are applied line-by-line; any line matching a pattern is dropped.
 */
const PRICE_LINE_PATTERNS = [
  /\$\s*\d/,                                                   // $120, $ 200
  /\bAUD\b/i,                                                  // AUD anywhere
  /\b\d[\d,]*\s*(dollars?|aud)\b/i,                           // 120 dollars
  /\bestimated?\s+(price|cost|quote|range|total|fee)\b/i,     // Estimated price/cost
  /\bprice\s+range\b/i,                                        // price range
  /\bquote\s+amount\b/i,                                       // quote amount
  /\bcost\s+estimate\b/i,                                      // cost estimate
  /\btotal\s+cost\b/i,                                         // total cost
  /\bstarting\s+(from|at)\s*\$/i,                              // starting from $
  /\bfrom\s*\$\d/i,                                            // from $120
  /\bapprox(imately)?\s*\$/i,                                  // approximately $
  /\bbudget(ed)?\s*(is|at|of)?\s*\$/i,                        // budget $
  /\bgst\s+inclu/i,                                            // GST included
  /\bgst\s+excl/i,                                             // GST excl
  /\b(plus|ex|inc)\s*gst\b/i,                                 // plus/ex/inc GST
  /\bgst[\s-]inclusive\b/i,                                    // GST-inclusive
];

const INSPECTION_REQUEST_LINE_PATTERNS = [
  /suitable\s+time\s+for\s+(an?\s+)?(on-?site\s+)?inspect/i, // suitable time for inspection
  /let\s+me\s+know\s+.{0,30}inspect/i,                       // let me know … inspect
  /please\s+.{0,30}inspect(ion)?\s+time/i,                   // please … inspection time
  /arrange\s+.{0,20}inspect/i,                                // arrange an inspection
  /confirm\s+.{0,20}inspect/i,                                // confirm inspection
  /schedule\s+.{0,20}inspect/i,                               // schedule inspection
  /book\s+.{0,20}inspect/i,                                   // book inspection
];

const TRADIE_PATTERN = /\btradie\b/gi;

const DEFAULT_INSPECTION_PHRASES = [
  /subject\s+to\s+(an?\s+)?on-?site\s+inspect/i,             // subject to on-site inspection
  /subject\s+to\s+inspect/i,                                  // subject to inspection
  /firm\s+quote\s+(after|following|post)\s+inspect/i,         // firm quote after inspection
  /final\s+price\s+(confirmed|after)\s+inspect/i,             // final price after inspection
  /pricing\s+confirmed\s+(on[\s-]?site|after\s+inspect)/i,   // pricing confirmed on-site
];

/**
 * Returns true if the job description itself mentions inspection.
 */
function jobMentionsInspection(jobDescription) {
  const d = String(jobDescription || '').toLowerCase();
  return /\b(inspect|assessment|diagnos|survey|evaluate|check)\b/.test(d);
}

/**
 * Hard sanitisation pass applied to every AI-generated message before sending
 * to the frontend.  Removes any pricing, inspection-request, or tradie lines
 * regardless of what the LLM generated.
 *
 * Returns { message: string, sanitised: boolean }
 */
function sanitiseAiQuoteMessage(rawMessage, jobDescription) {
  const allowInspection = jobMentionsInspection(jobDescription);
  const lines = String(rawMessage || '').split('\n');
  let dropped = 0;

  const cleaned = lines
    .map(line => {
      // Replace every occurrence of "tradie" with "Expert"
      let out = line.replace(TRADIE_PATTERN, 'Expert');

      // Drop lines with price content
      if (PRICE_LINE_PATTERNS.some(re => re.test(out))) {
        dropped++;
        return null;
      }

      // Drop inspection-request lines (always — Expert has not confirmed availability)
      if (INSPECTION_REQUEST_LINE_PATTERNS.some(re => re.test(out))) {
        dropped++;
        return null;
      }

      // Drop default "subject to inspection" lines unless the job actually mentions inspection
      if (!allowInspection && DEFAULT_INSPECTION_PHRASES.some(re => re.test(out))) {
        dropped++;
        return null;
      }

      return out;
    })
    .filter(l => l !== null);

  // Collapse more than two consecutive blank lines into one
  const collapsed = [];
  let blanks = 0;
  for (const l of cleaned) {
    if (l.trim() === '') {
      blanks++;
      if (blanks <= 1) collapsed.push(l);
    } else {
      blanks = 0;
      collapsed.push(l);
    }
  }

  const message = collapsed.join('\n').trim();
  return { message, sanitised: dropped > 0 };
}

/**
 * POST /api/quote-assistant (expert / tradie role)
 * Drafts a quote *message* only — no price is generated or returned.
 * Body: { jobId: string }
 */
router.post('/api/quote-assistant', aiLimiter, requireAuth, requireRole('tradie'), async (req, res) => {
  try {
    const { jobId } = req.body || {};
    if (!jobId || typeof jobId !== 'string') return res.status(400).json({ error: 'jobId is required.' });

    const expertUid = req.user.uid;

    const [jobDoc, expertDoc] = await Promise.all([
      db.collection('jobs').doc(jobId).get(),
      db.collection('users').doc(expertUid).get(),
    ]);

    if (!jobDoc.exists) return res.status(404).json({ error: 'Job not found.' });
    const job = jobDoc.data() || {};

    if (!Array.isArray(job.invitedTradieUids) || !job.invitedTradieUids.includes(expertUid)) {
      return res.status(403).json({ error: 'Forbidden: You are not invited to quote on this job.' });
    }

    const expert = expertDoc.exists ? (expertDoc.data() || {}) : {};

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.json({ ...fallbackQuoteSuggestion({ job }), fallback: true });

    // -----------------------------------------------------------------------
    // Prompt: explicitly forbids prices, inspection requests, and tradie wording
    // -----------------------------------------------------------------------
    const prompt = `You are an assistant helping an Expert on Taskio draft a professional quote message for a small service job.

YOUR ONLY JOB: Write the quote message text. Nothing else.

ABSOLUTE RULES — NEVER BREAK THESE:
1. DO NOT include any price, cost, dollar amount ($), price range, estimated cost, total cost, AUD figure, GST, or budget reference of any kind. The Expert will enter the price manually. The message must contain zero pricing information.
2. DO NOT include the word "tradie" or "tradesperson". Use "I" (first person) or "the Expert" if needed.
3. DO NOT include any section heading called "Estimated price", "Price range", "Cost", "Quote amount", or anything similar.
4. DO NOT ask the client for a time to arrange an inspection unless the job description clearly states that an inspection is required.
5. DO NOT say "subject to on-site inspection", "firm quote after inspection", "pricing confirmed on site", or similar phrases unless the description explicitly asks for an inspection.
6. DO NOT add scope that the client did not request. For example: if the client did not ask for cable concealment, do not mention cable concealment.
7. DO NOT commit to a specific date or time unless the Expert has provided availability.
8. DO NOT use markdown headers (##), bullet asterisks (*), or bold (**).

TONE AND STYLE:
- First person, professional, concise, and confident
- Plain Australian English
- No emojis
- Max 200 words in the message

STRUCTURE — follow this exactly:
1. One sentence confirming you can do the job (reference a concrete detail from the description)
2. Short scope of work — 2–4 plain bullet points using "-" starting each line
3. One "Exclusions:" line listing what is not included
4. One closing sentence asking for preferred day/time and access details

JOB:
- Title: ${JSON.stringify(job.title || '')}
- Description: ${JSON.stringify(job.description || '')}
- Location: ${JSON.stringify(job.location || '')}
- Timeline: ${JSON.stringify(job.timeline || '')}

EXPERT expertise areas: ${JSON.stringify(Array.isArray(expert.expertise) ? expert.expertise : [])}

EXAMPLE of a good output for a TV mounting job:
{
  "message": "Hi, I can help with mounting your 65-inch TV in Melbourne.\\n\\nScope of work:\\n- Mount the TV securely to the wall using the bracket provided\\n- Basic setup and cable tidying\\n- Leave the work area tidy\\n\\nExclusions: Cable concealment in walls, additional brackets, or any work not described above.\\n\\nPlease let me know a preferred day and time and any access details (parking, stairs, lift access).",
  "assumptions": ["Wall is suitable for mounting", "Bracket is provided by the client"]
}

Return ONLY valid JSON. No extra text, no markdown outside the JSON.
{
  "message": string,
  "assumptions": string[]
}`;

    const textResponse = await generateContent({ apiKey, prompt, timeoutMs: 20000 });
    const parsed = extractJsonObject(textResponse);

    const messageRaw = typeof parsed.message === 'string' ? parsed.message.trim() : '';
    if (!messageRaw) {
      // eslint-disable-next-line no-console
      console.warn('[quote-assistant] Empty message from AI, using fallback');
      return res.json({ ...fallbackQuoteSuggestion({ job }), fallback: true });
    }

    // Hard sanitisation — strip any pricing/inspection/tradie content the LLM may have included
    const { message: sanitised, sanitised: wasSanitised } = sanitiseAiQuoteMessage(messageRaw, job.description);

    if (wasSanitised) {
      // eslint-disable-next-line no-console
      console.warn('[quote-assistant] Sanitiser removed prohibited content from AI output');
    }

    // If sanitisation removed all substantive content, use fallback.
    // "Substantive" = at least one non-blank, non-separator line with 5+ chars.
    const hasContent = sanitised.split('\n').some(l => l.trim().length >= 5 && l.trim() !== '\u2014');
    if (!hasContent) {
      // eslint-disable-next-line no-console
      console.warn('[quote-assistant] Sanitised message has no substantive content, using fallback');
      return res.json({ ...fallbackQuoteSuggestion({ job }), fallback: true });
    }

    const assumptions = Array.isArray(parsed.assumptions)
      ? parsed.assumptions
          .map(a => String(a || '').trim().replace(TRADIE_PATTERN, 'Expert'))
          .filter(a => !PRICE_LINE_PATTERNS.some(re => re.test(a)))
          .slice(0, 4)
      : [];

    const disclaimer = '\n\n\u2014\nDraft only. Final price and availability are set by the Expert. Payments must stay on Taskio.';
    const message = `${sanitised}${disclaimer}`;

    return res.json({ message, assumptions });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[quote-assistant] Error:', error.details || (error.response ? error.response.data : error.message));
    const job = {};
    return res.json({ ...fallbackQuoteSuggestion({ job }), assumptions: ['Fallback quote assistant used.'], fallback: true });
  }
});

module.exports = router;
