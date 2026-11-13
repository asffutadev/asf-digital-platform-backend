import { Router } from "express";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireOffice } from "../../middleware/requireOffice.js";
import { list, getById, featured, create, update, publish, cancel, remove } from "./events.controller.js";

export const eventsRouter = Router();

const publicityAccess = [requireAuth, requireOffice("publicity-coordinator")];

eventsRouter.get("/", requireAuth, list);
eventsRouter.get("/featured", requireAuth, featured);
eventsRouter.get("/:id", requireAuth, getById);
eventsRouter.post("/", ...publicityAccess, create);
eventsRouter.put("/:id", ...publicityAccess, update);
eventsRouter.patch("/:id/publish", ...publicityAccess, publish);
eventsRouter.patch("/:id/cancel", ...publicityAccess, cancel);
eventsRouter.delete("/:id", ...publicityAccess, remove);