import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export function authOptional(req: Request, res: Response, next: NextFunction) {
  const hdr = req.headers.authorization || "";
  const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : null;
  if (token && process.env.JWT_SECRET) {
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET) as any;
      (req as any).user = { id: payload.uid };
    } catch {
      // Invalid token, proceed without user
    }
  }
  next();
}

export function authRequired(req: Request, res: Response, next: NextFunction) {
  authOptional(req, res, () => {
    if (!(req as any).user?.id) {
      return res.status(401).json({ error: "auth_required" });
    }
    next();
  });
}