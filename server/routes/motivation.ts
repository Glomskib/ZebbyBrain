import { Router } from "express";
import { db } from "../db";
import { upliftingMessages } from "@shared/schema";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";

export const motivationRouter = Router();

motivationRouter.get("/motivation", async (_req, res) => {
  try {
    const [message] = await db
      .select()
      .from(upliftingMessages)
      .where(eq(upliftingMessages.active, true))
      .orderBy(sql`random()`)
      .limit(1);
    
    const text = message?.text ?? "You've got this. One small step at a time. 🌟";
    
    res.json({
      message: text,
      ts: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching motivation message:", error);
    res.json({
      message: "You've got this. One small step at a time. 🌟",
      ts: new Date().toISOString(),
    });
  }
});
