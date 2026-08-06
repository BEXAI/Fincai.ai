// Routes for the unified NotificationBell feed. Notifications are written by the
// server engines (price-alert monitor, strategy-runner) and — for agent order
// status changes, which are only known client-side — by the browser via the
// POST endpoint below.
//
// Ownership mirrors the rest of the feature routes: anonymous sessions are scoped
// to the shared DEMO_USER_ID, logged-in users to their own id. The POST endpoint
// is the only client-writable one and is deliberately constrained: it can only
// create 'agent_order' notifications, the userId is always taken from the session
// (never the body), and all text fields are length-capped. CSRF is validated on
// every mutating route; GET is read-only and needs none.
import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { validateCsrf } from "../csrf";
import { createRateLimiter } from "../rate-limiter";
import type { InsertNotification } from "@shared/schema";

const DEMO_USER_ID = "demo-user";

// Modest cap: the client only posts one notification per terminal order
// transition, so this comfortably absorbs bursts without enabling spam.
const notificationCreateRateLimiter = createRateLimiter(60, 60 * 1000, "notifications-create");

// Client-writable shape. `type` is intentionally absent — the server forces
// 'agent_order' so the browser can never spoof a price-alert / strategy event.
const createNotificationSchema = z.object({
  title: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(600),
  symbol: z.string().trim().max(12).optional(),
  relatedId: z.string().trim().max(120).optional(),
  dedupeKey: z.string().trim().min(1).max(200),
});

type OptionalAuth = (req: any, res: any, next: any) => void | Promise<void>;

export function registerNotificationRoutes(app: Express, optionalAuthForFeatures: OptionalAuth) {
  // List the current owner's notifications, most recent first.
  app.get("/api/notifications", optionalAuthForFeatures, async (req: any, res) => {
    try {
      const userId = req.isAnonymous ? DEMO_USER_ID : req.userId;
      const notifications = await storage.getNotificationsForUser(userId);
      res.json(notifications);
    } catch (err: any) {
      console.error("[notifications] list failed:", err?.message ?? err);
      res.status(500).json({ message: "Failed to load notifications" });
    }
  });

  // Mark all of the owner's notifications read. Defined before the :id route so
  // "read-all" can't be captured as an id.
  app.post("/api/notifications/read-all", validateCsrf, optionalAuthForFeatures, async (req: any, res) => {
    try {
      const userId = req.isAnonymous ? DEMO_USER_ID : req.userId;
      const count = await storage.markAllNotificationsRead(userId);
      res.json({ count });
    } catch (err: any) {
      console.error("[notifications] mark-all failed:", err?.message ?? err);
      res.status(500).json({ message: "Failed to mark notifications read" });
    }
  });

  // Mark a single notification read (scoped to the owner so one user can't flip
  // another's notification).
  app.patch("/api/notifications/:id/read", validateCsrf, optionalAuthForFeatures, async (req: any, res) => {
    try {
      const userId = req.isAnonymous ? DEMO_USER_ID : req.userId;
      const updated = await storage.markNotificationRead(req.params.id, userId);
      if (!updated) {
        return res.status(404).json({ message: "Notification not found" });
      }
      res.json(updated);
    } catch (err: any) {
      console.error("[notifications] mark-read failed:", err?.message ?? err);
      res.status(500).json({ message: "Failed to mark notification read" });
    }
  });

  // Create an agent-order notification. This is the ONLY client-writable source
  // (agent order status changes live in the browser's localStorage and are never
  // known server-side). type is forced; userId comes from the session.
  app.post(
    "/api/notifications",
    validateCsrf,
    notificationCreateRateLimiter,
    optionalAuthForFeatures,
    async (req: any, res) => {
      try {
        const parsed = createNotificationSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ message: "Invalid notification", errors: parsed.error.flatten() });
        }
        const userId = req.isAnonymous ? DEMO_USER_ID : req.userId;
        const insert: InsertNotification = {
          userId,
          type: "agent_order",
          title: parsed.data.title,
          message: parsed.data.message,
          symbol: parsed.data.symbol ?? null,
          relatedId: parsed.data.relatedId ?? null,
          dedupeKey: parsed.data.dedupeKey,
        };
        // Returns undefined when the (userId, dedupeKey) already exists — treat
        // that as success so the client can fire idempotently.
        const created = await storage.createNotification(insert);
        res.status(created ? 201 : 200).json(created ?? { deduped: true });
      } catch (err: any) {
        console.error("[notifications] create failed:", err?.message ?? err);
        res.status(500).json({ message: "Failed to create notification" });
      }
    },
  );
}
