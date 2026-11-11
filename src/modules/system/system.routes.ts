import { Router } from "express";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireCapability } from "../../middleware/requireCapability.js";
import { getHealth, getPulse } from "./system.controller.js";

export const systemRouter = Router();

systemRouter.get("/health", requireAuth, requireCapability("technical_head"), getHealth);
systemRouter.get("/pulse", requireAuth, requireCapability("technical_head"), getPulse);