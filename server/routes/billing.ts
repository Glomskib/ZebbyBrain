import { Router } from "express";
import Stripe from "stripe";
import { db } from "../db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import crypto from "crypto";
import rateLimit from "express-rate-limit";
import { log } from "../vite";

const r = Router();

// Initialize Stripe (check if properly configured)
function isValidStripeConfig(): boolean {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const priceId = process.env.STRIPE_PLUS_PRICE_ID;
  return !!(secretKey && secretKey.startsWith("sk_") && priceId && priceId.startsWith("price_"));
}

let stripe: Stripe | null = null;
let PRICE_ID: string = "";

if (isValidStripeConfig()) {
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2024-06-20" });
  PRICE_ID = process.env.STRIPE_PLUS_PRICE_ID!;
}

const DEFAULT_TRIAL_DAYS = parseInt(process.env.STRIPE_TRIAL_DAYS || "0", 10);
const KS_COUPON_ID = process.env.STRIPE_KS_COUPON_ID || null;

// Abuse prevention controls
const MAX_TRIAL_MONTHS = 3;
const ALLOWED_COUPONS = new Set(
  (process.env.ALLOWED_COUPON_IDS || "").split(",").filter(Boolean)
);

// Rate limiting for checkout session creation
const checkoutRateLimit = rateLimit({
  windowMs: 60_000, // 1 minute window
  max: 5, // 5 requests per minute per IP
  message: { error: "Too many checkout attempts, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

const bodySchema = z.object({
  userId: z.string().min(1).optional(),
  promoCode: z.string().optional(),
  couponId: z.string().optional(),
  trialMonths: z.number().int().min(0).max(12).optional()
});

r.post("/create-checkout-session", checkoutRateLimit, async (req, res) => {
  // Get user ID from either session auth (OIDC) or JWT auth ONLY - no body fallback for security
  const uid = (req as any).user?.claims?.sub || // Session-based OIDC auth
                (req as any).user?.id;         // JWT-based auth
  if (!uid) return res.status(401).json({ error: "auth_required" });

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "validation", detail: parsed.error.flatten() });
  }

  const { promoCode, couponId, trialMonths = 0 } = parsed.data;

  // Abuse prevention: validate trial months
  if (trialMonths && (trialMonths < 0 || trialMonths > MAX_TRIAL_MONTHS)) {
    return res.status(400).json({ error: "invalid_trial" });
  }

  // Abuse prevention: validate coupon allowlist
  if (couponId && ALLOWED_COUPONS.size > 0 && !ALLOWED_COUPONS.has(couponId)) {
    return res.status(400).json({ error: "coupon_not_allowed" });
  }

  try {
    // Fetch user
    const [user] = await db.select().from(users).where(eq(users.id, uid));
    if (!user) return res.status(404).json({ error: "user_not_found" });

    // Check if we're in test mode (no valid Stripe configuration)
    if (!stripe || !PRICE_ID) {
      return res.json({
        ok: true,
        test_mode: true,
        url: "https://checkout.stripe.com/test-session-url",
        message: "Test mode: Real Stripe integration requires valid API keys"
      });
    }

    // Get or create Stripe customer
    let customerId = user.stripeCustomerId || undefined;
    if (!customerId) {
      const customer = await stripe.customers.create({ 
        email: user.email || undefined 
      });
      customerId = customer.id;
      await db.update(users)
        .set({ stripeCustomerId: customerId })
        .where(eq(users.id, user.id));
    }

    // Convert trial months to days
    const trialDays = trialMonths > 0 ? trialMonths * 30 : DEFAULT_TRIAL_DAYS;

    // Build discounts array (coupons)
    const discounts: Stripe.Checkout.SessionCreateParams.Discount[] = [];
    if (couponId) {
      discounts.push({ coupon: couponId });
    }
    // Add default Kickstarter coupon if env is set and no explicit coupon given
    if (!couponId && KS_COUPON_ID) {
      discounts.push({ coupon: KS_COUPON_ID });
    }

    // Generate idempotency key to prevent duplicate subscriptions
    const idemKey = crypto
      .createHash("sha256")
      .update(`${uid}:${new Date().toISOString().slice(0,16)}`)
      .digest("hex");

    const params: Stripe.Checkout.SessionCreateParams = {
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: PRICE_ID, quantity: 1 }],
      allow_promotion_codes: true, // Enables promo code field at checkout
      success_url: `${process.env.APP_URL}/settings?purchase=success`,
      cancel_url: `${process.env.APP_URL}/settings?purchase=cancel`,
      subscription_data: {
        trial_period_days: trialDays > 0 ? trialDays : undefined,
        discounts: discounts.length ? discounts : undefined,
      }
    };

    const session = await stripe.checkout.sessions.create(params, {
      idempotencyKey: idemKey
    });

    // Structured security logging without PII
    log(JSON.stringify({
      userId: uid,
      trialMonths: trialMonths || 0,
      couponId: !!couponId,
      promoCode: !!promoCode,
      event: "billing:create_checkout_session"
    }), "billing");

    return res.json({ ok: true, url: session.url });

  } catch (error) {
    console.error("Error creating enhanced checkout session:", error);
    
    // Handle Stripe authentication errors gracefully
    if ((error as any).type === 'StripeAuthenticationError' || 
        (error as any).code === 'api_key_invalid') {
      return res.json({
        ok: true,
        test_mode: true,
        url: "https://checkout.stripe.com/test-session-url",
        message: "Test mode: Stripe authentication failed"
      });
    }

    res.status(500).json({ error: "Failed to create checkout session" });
  }
});

r.post("/create-portal-session", async (req, res) => {
  // Get user ID from either session auth (OIDC) or JWT auth ONLY - no body fallback for security
  const uid = (req as any).user?.claims?.sub || // Session-based OIDC auth
                (req as any).user?.id;         // JWT-based auth
  if (!uid) return res.status(401).json({ error: "auth_required" });

  try {
    const [user] = await db.select().from(users).where(eq(users.id, uid));
    if (!user?.stripeCustomerId) {
      return res.status(400).json({ error: "no_customer" });
    }

    if (!stripe) {
      return res.json({
        ok: true,
        test_mode: true,
        url: `${process.env.APP_URL}/settings`,
        message: "Test mode: Customer portal not available"
      });
    }

    const portal = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${process.env.APP_URL}/settings`
    });
    
    res.json({ ok: true, url: portal.url });
  } catch (error) {
    console.error("Error creating portal session:", error);
    res.status(500).json({ error: "Failed to create portal session" });
  }
});

export default r;