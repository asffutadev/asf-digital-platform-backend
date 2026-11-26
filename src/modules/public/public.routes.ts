import { Router } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { listPrograms, getProgram, listAnnouncements, getAnnouncement } from "./public.controller.js";

export const publicRouter = Router();

publicRouter.use(rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? ""),
}));

publicRouter.get("/programs", listPrograms);
publicRouter.get("/programs/:id", getProgram);
publicRouter.get("/announcements", listAnnouncements);
publicRouter.get("/announcements/:id", getAnnouncement);
