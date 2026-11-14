import { Router } from "express";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireOffice } from "../../middleware/requireOffice.js";
import { summary } from "./publicity.controller.js";

export const publicityRouter = Router();

publicityRouter.get("/summary", requireAuth, requireOffice("publicity-coordinator"), summary);
