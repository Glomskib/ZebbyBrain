import { Router } from "express";
import { EMBEDDING_MODEL, EMBEDDING_DIM } from "../rag/config";

const r = Router();

// Simple uptime check
r.get("/ping", (_req, res) => {
  res.json({ ok: true });
});

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

r.get("/rag/health", (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ 
    ok: true, 
    model: EMBEDDING_MODEL, 
    dim: EMBEDDING_DIM 
  });
});

export default r;