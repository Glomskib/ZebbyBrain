import request from "supertest";
import express from "express";
import { requireAuth } from "../middleware/requireAuth";
import billingRoutes from "../routes/billing";

// Create test app
const app = express();
app.use(express.json());

// Apply auth middleware to billing routes
app.use("/api/billing", requireAuth, billingRoutes);

describe("Billing auth", () => {
  test("rejects unauthenticated checkout session", async () => {
    const res = await request(app)
      .post("/api/billing/create-checkout-session")
      .send({ userId: "forged" }); // should be ignored anyway
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("auth_required");
  });

  test("rejects forged userId even if token missing", async () => {
    const res = await request(app)
      .post("/api/billing/create-checkout-session")
      .send({ userId: "someone-else" });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("auth_required");
  });

  test("rejects unauthenticated portal session", async () => {
    const res = await request(app)
      .post("/api/billing/create-portal-session")
      .send({ userId: "forged-portal-user" });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("auth_required");
  });

  test("rejects all billing endpoints without authentication", async () => {
    // Test all billing endpoints to ensure comprehensive protection
    const endpoints = [
      "/api/billing/create-checkout-session",
      "/api/billing/create-portal-session",
    ];

    for (const endpoint of endpoints) {
      const res = await request(app)
        .post(endpoint)
        .send({ userId: "fake-user", arbitrary: "data" });
      
      expect(res.status).toBe(401);
      expect(res.body.error).toBe("auth_required");
    }
  });
});