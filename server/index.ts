import express, { type Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import hpp from "hpp";
import cors from "cors";
import crypto from "crypto";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { setupCronJobs } from "./cron";

const app = express();

// Validate required secrets on boot (fail-fast security)
if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET must be set for secure session management");
}
if (!process.env.STRIPE_WEBHOOK_SECRET && process.env.NODE_ENV === "production") {
  throw new Error("STRIPE_WEBHOOK_SECRET must be set for webhook signature verification in production");
}

// HTTP Security Headers and Protection
// Strict CORS: only your known origins
const allowed = [process.env.APP_URL, "http://localhost:5173", "http://localhost:5000"].filter(Boolean) as string[];
app.use(cors({ 
  origin: allowed, 
  credentials: true 
}));

// Per-request nonce for inline scripts (if needed)
app.use((req, res, next) => {
  (res as any).nonce = crypto.randomBytes(16).toString("base64");
  next();
});

// Helmet for comprehensive security headers
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "default-src": ["'self'"],
      "img-src": ["'self'", "data:", "blob:"],
      "font-src": ["'self'", "https://fonts.gstatic.com"],
      "style-src": ["'self'", "https://fonts.googleapis.com"], // for Tailwind + Google Fonts
      "script-src": process.env.NODE_ENV === "development" 
        ? ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://js.stripe.com"] // Allow inline scripts in development for Vite + Stripe
        : ["'self'", "https://js.stripe.com", (req: any, res: any) => `'nonce-${res.nonce}'`],
      "connect-src": ["'self'", "https://api.stripe.com", "https://api.openai.com"],
      "frame-src": ["https://js.stripe.com"],
      "frame-ancestors": ["'none'"],
      "object-src": ["'none'"],
      "base-uri": ["'self'"],
    },
  },
  frameguard: { action: "deny" }, // Explicitly set X-Frame-Options to DENY
  referrerPolicy: { policy: "no-referrer" },
  crossOriginEmbedderPolicy: false, // for in-browser rendering
  noSniff: true // X-Content-Type-Options: nosniff
}));

// CSP Report-Only for monitoring violations without blocking
app.use(helmet.contentSecurityPolicy({
  reportOnly: true,
  useDefaults: true,
  directives: {
    "default-src": ["'self'"],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'", "https://fonts.gstatic.com"],
    "style-src": ["'self'", "https://fonts.googleapis.com"], // for Tailwind + Google Fonts
    "script-src": process.env.NODE_ENV === "development" 
      ? ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://js.stripe.com"] // Allow inline scripts in development for Vite + Stripe
      : ["'self'", "https://js.stripe.com", (req: any, res: any) => `'nonce-${res.nonce}'`],
    "connect-src": ["'self'", "https://api.stripe.com", "https://api.openai.com"],
    "frame-src": ["https://js.stripe.com"],
    "frame-ancestors": ["'none'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "report-uri": ["/csp/report"]
  }
}));

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
  const SENSITIVE_KEYS = ["notes", "email", "phone", "token", "accessToken", "profile", "address"];
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
      if (capturedJsonResponse) {
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
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
    
    // Start cron jobs for nightly insights precomputation
    setupCronJobs();
  });
})();
