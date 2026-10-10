// ---------------------------------------------------------------------------
// Scheduler log gate: dev noisy by default. Set VERBOSE_SCHEDULER=true to see
// the 15-min heartbeat lines; errors always pass through.
// ---------------------------------------------------------------------------
(() => {
  if ((process.env.VERBOSE_SCHEDULER || "").toLowerCase() === "true") return;
  const NOISY = new Set<string>([
    // cron / scheduler heartbeat
    "reminder_processing_triggered",
    "reminder_processing_start",
    "reminder_processing_completed",
    "reminder_processing_no_due_reminders",
    "circle_alerts_processing_start",
    "circle_alerts_no_active_rules",
    "circle_alerts_processing_complete",
    "circle_alerts_processing_complete_with_count",
    "insights_precompute_start",
    "insights_precompute_complete",
    "insights_precompute_progress",
    "insights_precomputed",
    "active_users_identified",
    "dev_insights_precompute_start",
    "dev_insights_precompute_complete",
    "cron_job_triggered",
    "cron_job_completed",
    "cache_invalidated",
    "api_perf",
  ]);
  const origInfo = console.info.bind(console);
  console.info = (...args: any[]) => {
    const first = args[0];
    if (typeof first === "string" && first.startsWith("{")) {
      try {
        const parsed = JSON.parse(first);
        if (parsed && typeof parsed.evt === "string" && NOISY.has(parsed.evt)) {
          return;
        }
      } catch {
        /* not JSON — pass through */
      }
    }
    origInfo(...args);
  };
})();

import express, { type Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import hpp from "hpp";
import cors from "cors";
import compression from "compression";
import crypto from "crypto";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { setupCronJobs } from "./cron";
import { configMeta } from "./meta/config";
import { initDb } from "./bootstrap/initDb";

const app = express();

// Fail-fast on secrets in production only. Dev gets sane defaults.
if (!process.env.SESSION_SECRET) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be set for secure session management");
  }
  process.env.SESSION_SECRET = "dev-insecure-session-secret-change-me";
}
if (!process.env.STRIPE_WEBHOOK_SECRET && process.env.NODE_ENV === "production") {
  throw new Error("STRIPE_WEBHOOK_SECRET must be set for webhook signature verification in production");
}
// The shared-password test login is for local/staging smoke tests only.
// Refuse to boot a production server with it switched on.
if (
  process.env.NODE_ENV === "production" &&
  (process.env.ALLOW_TEST_LOGIN || "").toLowerCase() === "true"
) {
  throw new Error("ALLOW_TEST_LOGIN must not be enabled in production");
}
// Health data (Visit Recorder transcripts and recaps) is encrypted at rest.
// If the feature is on in production, the key must be present and valid.
if (
  process.env.NODE_ENV === "production" &&
  (process.env.FF_VISIT_RECORDER || "").toLowerCase() === "true" &&
  !/^[0-9a-fA-F]{64}$/.test(process.env.HEALTH_DATA_KEY || "")
) {
  throw new Error("HEALTH_DATA_KEY (64 hex chars) must be set when FF_VISIT_RECORDER is on in production");
}

// HTTP Security Headers and Protection
// Strict CORS: only your known origins (including mobile)
const allowed = [
  process.env.APP_URL, 
  "http://localhost:5173", 
  "http://localhost:5000",
  ...(process.env.ALLOWED_ORIGINS || "").split(",").filter(Boolean)
].filter(Boolean) as string[];

// Log CORS configuration on boot
console.log("CORS allowed origins:", allowed.length ? allowed : ["[localhost-only]"]);

app.use(cors({ 
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    return cb(null, allowed.includes(origin));
  },
  credentials: true 
}));

// Per-request nonce for inline scripts (if needed)
app.use((req, res, next) => {
  (res as any).nonce = crypto.randomBytes(16).toString("base64");
  next();
});

// Compression middleware
app.use(compression({
  threshold: 1024, // skip tiny responses
  filter: (req, res) => {
    const type = res.getHeader("Content-Type") as string | undefined;
    if (type && /(^text\/event-stream)/i.test(type)) return false;
    return compression.filter(req, res);
  }
}));

// Ensure correct caches on proxies
app.use((req, res, next) => {
  res.setHeader("Vary", "Accept-Encoding");
  next();
});

// Helmet for comprehensive security headers
const isDev = process.env.NODE_ENV !== "production";
const supabaseOrigin = (() => {
  try {
    return process.env.SUPABASE_URL ? [new URL(process.env.SUPABASE_URL).origin] : [];
  } catch {
    return [];
  }
})();
const cspDirectives: any = {
  "default-src": ["'self'"],
  "img-src": ["'self'", "data:", "blob:"],
  "font-src": ["'self'", "https://fonts.gstatic.com"],
  // In dev, Vite injects styles via runtime <style> tags; allow 'unsafe-inline'.
  // Prod still locks down to 'self' + Google Fonts.
  "style-src": isDev
    ? ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"]
    : ["'self'", "https://fonts.googleapis.com"],
  "script-src": isDev
    ? ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://js.stripe.com"]
    : ["'self'", "https://js.stripe.com", (req: any, res: any) => `'nonce-${res.nonce}'`],
  // Allow Vite's HMR websocket in dev; 'self' only in prod. AI calls are
  // server-side only, so OpenAI is never reachable from the browser. Supabase
  // is allowed so Visit Recorder audio can upload straight to private storage
  // through a short-lived signed link.
  "connect-src": [
    "'self'",
    ...(isDev ? ["ws:", "wss:"] : []),
    "https://api.stripe.com",
    ...supabaseOrigin,
  ],
  // Recorded audio is played back from local blob: URLs before upload.
  "media-src": ["'self'", "blob:"],
  "frame-src": ["https://js.stripe.com"],
  "frame-ancestors": ["'none'"],
  "object-src": ["'none'"],
  "base-uri": ["'self'"],
};

if (process.env.NODE_ENV === "production") {
  cspDirectives["upgrade-insecure-requests"] = [];
}

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: cspDirectives,
  },
  frameguard: { action: "deny" }, // Explicitly set X-Frame-Options to DENY
  referrerPolicy: { policy: "no-referrer" },
  crossOriginEmbedderPolicy: false, // for in-browser rendering
  noSniff: true // X-Content-Type-Options: nosniff
}));

// CSP Report-Only for monitoring violations without blocking (prod only —
// in dev it would produce noise for Vite's inline styles).
if (!isDev) {
  app.use(helmet.contentSecurityPolicy({
    reportOnly: true,
    useDefaults: true,
    directives: {
      "default-src": ["'self'"],
      "img-src": ["'self'", "data:", "blob:"],
      "font-src": ["'self'", "https://fonts.gstatic.com"],
      "style-src": ["'self'", "https://fonts.googleapis.com"],
      "script-src": ["'self'", "https://js.stripe.com", (req: any, res: any) => `'nonce-${res.nonce}'`],
      "connect-src": ["'self'", "https://api.stripe.com", ...supabaseOrigin],
      "media-src": ["'self'", "blob:"],
      "frame-src": ["https://js.stripe.com"],
      "frame-ancestors": ["'none'"],
      "object-src": ["'none'"],
      "base-uri": ["'self'"],
      "report-uri": ["/csp/report"]
    }
  }));
}

// Browser feature lockdown. The microphone is allowed for our own pages only
// (Visit Recorder), geolocation for our own pages only (weather on symptom
// logs), and everything else sensitive is off.
app.use((_req, res, next) => {
  res.setHeader(
    "Permissions-Policy",
    "microphone=(self), geolocation=(self), camera=(), payment=(self \"https://js.stripe.com\"), usb=(), serial=(), bluetooth=()",
  );
  next();
});

// HTTP Parameter Pollution protection
app.use(hpp());

// Reduce fingerprinting
app.disable("x-powered-by");

// Request timeouts to prevent slowloris attacks
app.use((req, res, next) => {
  req.setTimeout(10_000); // 10 seconds
  res.setTimeout(10_000);
  next();
});

app.use(express.json({ limit: "512kb" })); // Prevent large payload abuse
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  // PII/PHI redaction for health data protection
  const SENSITIVE_KEYS = [
    "notes", "email", "phone", "token", "accessToken", "profile", "address",
    "title", "transcript", "recap", "consentEvidence", "reply", "answer", "url", "signedUrl",
  ];
  function redact(obj: any): any {
    if (!obj || typeof obj !== "object") return obj;
    if (Array.isArray(obj)) return obj.map(redact);
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) =>
        SENSITIVE_KEYS.includes(k) ? [k, "[redacted]"] : [k, redact(v as any)]
      )
    );
  }

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = process.env.NODE_ENV === "production" ? redact(bodyJson) : bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      // Response bodies are logged in development only. In production they
      // can hold health text (titles, transcripts, recaps, AI replies) or
      // short-lived upload links, so nothing past the status line is written.
      if (capturedJsonResponse && process.env.NODE_ENV !== "production") {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Initialize local DB (pglite) if needed — idempotent. No-op against Neon.
  await initDb();

  // Visit Recorder: make sure the private audio bucket exists and stays private.
  if ((process.env.FF_VISIT_RECORDER || "").toLowerCase() === "true") {
    try {
      const { ensureVisitAudioBucket } = await import("./lib/visitStorage");
      await ensureVisitAudioBucket();
    } catch (err) {
      console.error("[visits] could not prepare the private audio bucket:", (err as Error).message);
    }
  }

  // Add rate limiting for API endpoints BEFORE route registration
  const authdLimiter = rateLimit({ 
    windowMs: 60_000, // 1 minute window
    max: 60, // 60 requests per minute per user
    message: { message: "Too many requests, please try again later" },
    standardHeaders: true,
    legacyHeaders: false,
  });
  
  // Apply rate limiting to API routes BEFORE they're registered
  app.use("/api", authdLimiter);
  
  // CSP violation reporting endpoint
  app.post("/csp/report", express.json({ type: "application/csp-report" }), (req, res) => {
    console.warn("CSP violation report:", JSON.stringify(req.body?.['csp-report'] ?? req.body, null, 2));
    res.sendStatus(204);
  });
  
  // E2E testing routes and mocks (only in test environment)
  if (process.env.E2E_MOCKS === 'true') {
    const { e2eMocks } = await import('./dev/e2e-mocks.js');
    const { e2eDevRoutes } = await import('./dev/e2e-dev-routes.js');
    app.use('/api', e2eMocks());
    app.use('/e2e', e2eDevRoutes());
    log('E2E mocks and dev routes enabled');
  }
  
  // Config metadata endpoint for easy debugging
  app.use("/api", configMeta);
  
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  // reusePort is not supported on macOS/BSD; keep it off outside Linux.
  const listenOpts: any = { port, host: "0.0.0.0" };
  if (process.platform === "linux") listenOpts.reusePort = true;
  server.listen(listenOpts, () => {
    log(`serving on port ${port}`);
    
    // Start cron jobs for nightly insights precomputation
    setupCronJobs();
  });
})();
