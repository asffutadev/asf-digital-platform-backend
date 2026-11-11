import { Router } from "express";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireOffice } from "../../middleware/requireOffice.js";
import { list, featured, create, update, cancel } from "./events.controller.js";

export const eventsRouter = Router();

const publicityAccess = [requireAuth, requireOffice("publicity-coordinator")];

eventsRouter.get("/", requireAuth, list);
eventsRouter.get("/featured", requireAuth, featured);
eventsRouter.post("/", ...publicityAccess, create);
eventsRouter.put("/:id", ...publicityAccess, update);
eventsRouter.patch("/:id/cancel", ...publicityAccess, cancel);