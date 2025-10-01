import { Router } from "express";

const r = Router();

// Production health check endpoint
r.get("/health", (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || "development"
  });
});

r.get("/status", (req, res) => {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const stripePriceId = process.env.STRIPE_PLUS_PRICE_ID;
  
  res.json({
    stripe: {
      configured: !!(stripeKey && stripePriceId),
      mode: stripeKey?.split("_")[1] === "test" ? "test" : "live",
    },
    env: process.env.NODE_ENV || "development",
    timestamp: new Date().toISOString()
  });
});

export default r;