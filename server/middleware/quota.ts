import type { RequestHandler } from "express";

const store = new Map<string, { date: string; count: number }>();

export const quota =
  (limitFree: number, limitPaid: number): RequestHandler =>
  (req, res, next) => {
    const user = (req as any).user as { id: string; plan?: "free" | "plus" } | undefined;
    if (!user) return res.status(401).json({ message: "Unauthorized" });

    const today = new Date().toISOString().slice(0, 10);
    const key = `${user.id}:${today}`;
    const rec = store.get(key) ?? { date: today, count: 0 };
    if (rec.date !== today) { 
      rec.date = today; 
      rec.count = 0; 
    }

    const limit = user?.plan === "plus" ? limitPaid : limitFree;

    if (rec.count >= limit) {
      return res.status(429).json({ 
        message: "Daily RAG query limit reached",
        limit,
        plan: user?.plan || "free"
      });
    }
    
    rec.count++;
    store.set(key, rec);
    
    res.locals.quotaCount = rec.count;
    res.locals.quotaLimit = limit;
    
    next();
  };
