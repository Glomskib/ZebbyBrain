/**
 * Auth shim. Historically this file held Replit-OIDC-only auth.
 * It now provides a local-first session auth (email + password) with a
 * compatibility path for Replit OIDC, so the app can run on any host.
 *
 * Public API kept stable so route files don't need to change:
 *   - setupAuth(app)         → installs session + passport + auth routes
 *   - isAuthenticated        → RequestHandler used by every protected route
 *   - getSession()           → exported for tests/Replit
 *
 * Session shape (what routes already depend on):
 *   req.user = {
 *     claims: { sub, email, first_name, last_name, exp },
 *     expires_at: <unix seconds>,
 *     id: <user.id>,
 *     plan: "free" | "plus",
 *   }
 */
import session from "express-session";
import createMemoryStore from "memorystore";
import connectPg from "connect-pg-simple";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import type { Express, RequestHandler } from "express";
import bcrypt from "bcrypt";
import { storage } from "./storage";
import { db, isLocalDb } from "./db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function getSession() {
  const secret = process.env.SESSION_SECRET || "dev-insecure-session-secret-change-me";
  const cookie = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: ONE_WEEK_MS,
    sameSite: "lax" as const,
  };

  // Prefer Postgres-backed sessions when we have a real connection string.
  if (!isLocalDb && process.env.DATABASE_URL) {
    const pgStore = connectPg(session);
    return session({
      secret,
      store: new pgStore({
        conString: process.env.DATABASE_URL,
        createTableIfMissing: false,
        ttl: ONE_WEEK_MS / 1000,
        tableName: "sessions",
      }),
      resave: false,
      saveUninitialized: false,
      cookie,
    });
  }

  // Local dev: in-memory store (pglite doesn't speak native pg wire protocol)
  const MemoryStore = createMemoryStore(session);
  return session({
    secret,
    store: new MemoryStore({ checkPeriod: ONE_WEEK_MS }),
    resave: false,
    saveUninitialized: false,
    cookie,
  });
}

async function loadUserForSession(userId: string) {
  const user = await storage.getUser(userId);
  if (!user) return null;
  return user;
}

function makeSessionUser(user: {
  id: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  plan?: string | null;
}) {
  const expiresAt = Math.floor((Date.now() + ONE_WEEK_MS) / 1000);
  return {
    id: user.id,
    plan: user.plan || "free",
    claims: {
      sub: user.id,
      email: user.email || "",
      first_name: user.firstName || "",
      last_name: user.lastName || "",
      exp: expiresAt,
    },
    expires_at: expiresAt,
  };
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  passport.serializeUser((user: any, cb) => cb(null, user));
  passport.deserializeUser((user: any, cb) => cb(null, user));

  // Local email/password strategy
  passport.use(
    "local",
    new LocalStrategy(
      { usernameField: "email", passwordField: "password" },
      async (email, password, done) => {
        try {
          const normalized = email.trim().toLowerCase();
          const [row] = await db
            .select()
            .from(users)
            .where(eq(users.email, normalized));
          if (!row || !row.passwordHash) {
            return done(null, false, { message: "Invalid email or password" });
          }
          const ok = await bcrypt.compare(password, row.passwordHash);
          if (!ok) return done(null, false, { message: "Invalid email or password" });
          return done(null, makeSessionUser(row));
        } catch (err) {
          return done(err as any);
        }
      },
    ),
  );

  // ===== Signup =====
  app.post("/api/auth/signup", async (req, res) => {
    try {
      const { email, password, firstName, lastName } = req.body ?? {};
      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }
      if (typeof password !== "string" || password.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters" });
      }
      const normalized = String(email).trim().toLowerCase();
      const [existing] = await db.select().from(users).where(eq(users.email, normalized));
      if (existing) {
        return res.status(409).json({ message: "An account with that email already exists" });
      }
      const passwordHash = await bcrypt.hash(password, 12);
      const [created] = await db
        .insert(users)
        .values({
          email: normalized,
          passwordHash,
          firstName: firstName || null,
          lastName: lastName || null,
          plan: "free",
          planStatus: "inactive",
        })
        .returning();

      const sessionUser = makeSessionUser(created);
      req.login(sessionUser, (err) => {
        if (err) {
          console.error("signup login err:", err);
          return res.status(500).json({ message: "Session error" });
        }
        res.json({
          ok: true,
          user: {
            id: created.id,
            email: created.email,
            firstName: created.firstName,
            lastName: created.lastName,
            plan: created.plan,
            onboardingCompleted: created.onboardingCompleted,
          },
        });
      });
    } catch (err: any) {
      console.error("signup error:", err);
      res.status(500).json({ message: "Signup failed" });
    }
  });

  // ===== Login =====
  app.post("/api/auth/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ message: info?.message || "Unauthorized" });
      req.login(user, async (loginErr) => {
        if (loginErr) return next(loginErr);
        const dbUser = await storage.getUser(user.id);
        res.json({
          ok: true,
          user: {
            id: dbUser?.id,
            email: dbUser?.email,
            firstName: dbUser?.firstName,
            lastName: dbUser?.lastName,
            plan: dbUser?.plan,
            onboardingCompleted: dbUser?.onboardingCompleted,
          },
        });
      });
    })(req, res, next);
  });

  // ===== Logout =====
  app.post("/api/auth/logout", (req, res) => {
    req.logout(() => {
      req.session?.destroy(() => {
        res.clearCookie("connect.sid");
        res.json({ ok: true });
      });
    });
  });

  // Legacy GET routes that used to hit Replit OIDC. Keep them so old links work.
  app.get("/api/login", (_req, res) => res.redirect("/login"));
  app.get("/api/logout", (req, res) => {
    req.logout(() => {
      req.session?.destroy(() => {
        res.clearCookie("connect.sid");
        res.redirect("/");
      });
    });
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const user = req.user as any;
  if (!req.isAuthenticated?.() || !user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const now = Math.floor(Date.now() / 1000);
  if (user.expires_at && now > user.expires_at) {
    req.logout?.(() => {});
    return res.status(401).json({ message: "Session expired" });
  }

  const userId = user.claims?.sub || user.id;
  if (userId) {
    const dbUser = await loadUserForSession(userId);
    if (dbUser) {
      user.plan = dbUser.plan || "free";
      user.id = dbUser.id;
    }
  }
  next();
};
