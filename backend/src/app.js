'use strict';

const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');

const { errorHandler } = require('./middleware/errorHandler');
const { requestContext } = require('./middleware/requestContext');

const healthRoutes = require('./routes/health');
const userRoutes = require('./routes/users');
const aiRoutes = require('./routes/ai');
const suburbRoutes = require('./routes/suburb');
const jobRoutes = require('./routes/jobs');
const tradieRoutes = require('./routes/tradie');
const adminRoutes = require('./routes/admin');
const meRoutes = require('./routes/me');
const stripeWebhookRoutes = require('./routes/stripeWebhook');
const internalStripeVerifiedEventRoutes = require('./routes/internalStripeVerifiedEvent');
const reviewRoutes = require('./routes/reviews');
const authRoutes = require('./routes/auth');

function parseAllowedOrigins() {
  const allowedOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  // Safe defaults for local dev only
  if (allowedOrigins.length === 0 && process.env.NODE_ENV !== 'production') {
    return [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://localhost:5173',
      'http://127.0.0.1:5173',
    ];
  }

  return allowedOrigins;
}

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(requestContext);

  // If behind a proxy (Render/Heroku/Nginx), you must enable this for correct rate limiting + IP logging.
  if (process.env.TRUST_PROXY === 'true') {
    app.set('trust proxy', 1);
  }

  /* ------------------------------- Security -------------------------------- */
  const allowedOrigins = parseAllowedOrigins();

  const corsOptions = {
    origin: (origin, callback) => {
      // Allow non-browser requests (no Origin header) such as curl/Postman
      if (!origin) return callback(null, true);

      // In production, require an allowlist (avoid accidental open CORS)
      if (process.env.NODE_ENV === 'production' && allowedOrigins.length === 0) {
        return callback(new Error('CORS blocked: no allowlist configured'));
      }

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
    max: 500, // Increased for dev (polling dashboard makes ~18 req/min)
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.method === 'POST' && req.path === '/internal/stripe/verified-event',
  });
  const aiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: process.env.NODE_ENV === 'production' ? 60 : 180,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many AI requests. Please try again shortly.' },
  });

  app.use(generalLimiter);
  app.use('/api/ai', aiLimiter);
  // Stripe webhook MUST be registered before JSON body parsing (Stripe needs raw body for signature verification)
  app.use(stripeWebhookRoutes);
  // Internal A2 ingest: own 256kb JSON parser, no Firebase auth, not mounted on createWebhookApp()
  app.use(internalStripeVerifiedEventRoutes);
  app.use(express.json({ limit: '1mb' }));

  /* ------------------------------------------------------------------------ */
  /* Routes                                                                   */
  /* ------------------------------------------------------------------------ */
  app.use(healthRoutes);
  app.use(userRoutes);
  app.use(aiRoutes);
  app.use(suburbRoutes);
  app.use(jobRoutes);
  app.use(tradieRoutes);
  app.use(adminRoutes);
  app.use(meRoutes);
  app.use(reviewRoutes);
  app.use(authRoutes);

  /* ------------------------------------------------------------------------ */
  /* Error Handling                                                           */
  /* ------------------------------------------------------------------------ */
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };


