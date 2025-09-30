import express from "express";
import { db } from "../db";
import { z } from "zod";
import { groupReports, insertGroupReportSchema } from "@shared/schema";
import { reportRateLimit } from "../middleware/rateLimits";

const router = express.Router();

/**
 * POST /api/report
 * Report content (posts or comments) for moderation
 */
router.post("/", reportRateLimit, async (req: any, res) => {
  try {
    if (!req.user?.claims?.sub) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const userId = req.user.claims.sub;

    // Validate request
    const schema = insertGroupReportSchema.extend({
      reasonCode: z.string().min(1),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ 
        message: "Invalid report data", 
        errors: parsed.error.errors 
      });
    }

    const reportData = parsed.data;

    // Create report
    const [newReport] = await db
      .insert(groupReports)
      .values({
        ...reportData,
        reporterId: userId,
        status: 'open',
      })
      .returning();

    res.status(201).json({ 
      message: "Report submitted successfully",
      reportId: newReport.id
    });
  } catch (error) {
    console.error("Error creating report:", error);
    res.status(500).json({ message: "Failed to submit report" });
  }
});

export default router;
