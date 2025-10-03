import { Router } from "express";

export const configMeta = Router();

function bool(v?: string) {
  return (v ?? "").toString().toLowerCase() === "true";
}

const parsedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

console.info("[BOOT] FF_RAG (backend):", bool(process.env.FF_RAG));
console.info("[BOOT] FF_RAG (frontend):", process.env.VITE_FF_RAG);
console.info("[BOOT] CORS allowed origins:", parsedOrigins.length > 0 ? parsedOrigins : ["localhost-only"]);
console.info("[BOOT] Firebase configured:", Boolean(
  process.env.FIREBASE_PROJECT_ID &&
  process.env.FIREBASE_CLIENT_EMAIL &&
  process.env.FIREBASE_PRIVATE_KEY
));

configMeta.get("/meta/config", (_req, res) => {
  res.json({
    ok: true,
    ff_rag_backend: bool(process.env.FF_RAG),
    ff_rag_frontend: process.env.VITE_FF_RAG, // Pass through as-is for debugging
    cors_allowed_origins: parsedOrigins.length > 0 ? parsedOrigins : ["localhost-only"],
    firebase_configured: Boolean(
      process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY
    )
  });
});
