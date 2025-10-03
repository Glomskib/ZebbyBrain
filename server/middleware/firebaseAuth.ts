import { RequestHandler } from "express";
import admin from "firebase-admin";
import { storage } from "../storage";

function initAdmin() {
  if (admin.apps.length) return;
  
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  
  if (!projectId || !clientEmail || !privateKey) {
    console.warn("Firebase credentials not configured, Firebase auth will be unavailable");
    return;
  }
  
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey: privateKey.replace(/\\n/g, "\n"),
    }),
  });
}

initAdmin();

export const verifyFirebase: RequestHandler = async (req, res, next) => {
  try {
    if (!admin.apps.length) {
      return res.status(503).json({ 
        message: "Firebase authentication not configured",
        requiresSetup: true 
      });
    }
    
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    
    if (!token) {
      return res.status(401).json({ message: "Missing bearer token" });
    }
    
    const decoded = await admin.auth().verifyIdToken(token);
    
    const userId = decoded.uid;
    const email = decoded.email || "";
    
    let dbUser = await storage.getUser(userId);
    if (!dbUser) {
      dbUser = await storage.upsertUser({
        id: userId,
        email,
        firstName: decoded.name?.split(" ")[0],
        lastName: decoded.name?.split(" ").slice(1).join(" "),
        profileImageUrl: decoded.picture,
      });
    }
    
    (req as any).user = {
      id: userId,
      email,
      plan: dbUser.plan || "free",
      claims: { sub: userId },
    };
    
    return next();
  } catch (err) {
    console.error("Firebase token verification error:", err);
    return res.status(401).json({ message: "Invalid token" });
  }
};
