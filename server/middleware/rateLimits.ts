import rateLimit from 'express-rate-limit';

// Posts: 6 per hour (per user)
export const postRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 6,
  message: 'Too many posts created. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => req.user?.claims?.sub || 'anonymous',
  handler: (req, res) => {
    res.status(429).set('Retry-After', '3600').json({
      error: 'rate_limited',
      message: 'Too many posts created. Please try again later.',
    });
  },
});

// Comments: 20 per hour (per user)
export const commentRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  message: 'Too many comments created. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => req.user?.claims?.sub || 'anonymous',
  handler: (req, res) => {
    res.status(429).set('Retry-After', '3600').json({
      error: 'rate_limited',
      message: 'Too many comments created. Please try again later.',
    });
  },
});

// Reactions: 60 per hour (per user)
export const reactionRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 60,
  message: 'Too many reactions. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => req.user?.claims?.sub || 'anonymous',
  handler: (req, res) => {
    res.status(429).set('Retry-After', '3600').json({
      error: 'rate_limited',
      message: 'Too many reactions. Please try again later.',
    });
  },
});

// Reports: 10 per hour (per user)
export const reportRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: 'Too many reports submitted. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => req.user?.claims?.sub || 'anonymous',
  handler: (req, res) => {
    res.status(429).set('Retry-After', '3600').json({
      error: 'rate_limited',
      message: 'Too many reports submitted. Please try again later.',
    });
  },
});
