import { Router } from "express";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireOffice } from "../../middleware/requireOffice.js";
import { list } from "./fsSessions.controller.js";

export const fsSessionsRouter = Router();

fsSessionsRouter.get("/", requireAuth, requireOffice("vice-president"), list);