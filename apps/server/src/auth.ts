import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { db } from "./db";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

export interface AuthedRequest extends Request {
  userId?: string;
}

export function signToken(userId: string): string {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: "30d" });
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing auth token" });
  }
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET) as { sub: string };
    // The token can outlive the account it points to (e.g. a dev database reset,
    // or a deleted account) - without this check, routes that trust req.userId
    // blindly hit a foreign-key failure deep in a query instead of a clean 401.
    const user = db.prepare("SELECT id FROM users WHERE id = ?").get(payload.sub);
    if (!user) {
      return res.status(401).json({ error: "Your session is no longer valid. Please log in again." });
    }
    req.userId = payload.sub;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}
