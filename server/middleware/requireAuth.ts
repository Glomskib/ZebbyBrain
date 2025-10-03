import { Request, Response, NextFunction } from "express";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user;
  const userId = user?.claims?.sub || user?.id;
  if (!userId) {
    return res.status(401).json({ error: "auth_required" });
  }
  next();
}