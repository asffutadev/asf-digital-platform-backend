import { Router } from "express";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireOffice } from "../../middleware/requireOffice.js";
import { list, getById, create, submitForReview, approve, requestRevision, update, publish, schedule, archive, remove } from "./announcements.controller.js";

export const announcementsRouter = Router();

const publicityAccess = [requireAuth, requireOffice("publicity-coordinator")];

announcementsRouter.get("/", requireAuth, list);
announcementsRouter.get("/:id", requireAuth, getById);
announcementsRouter.post("/", ...publicityAccess, create);
announcementsRouter.patch("/:id/submit-review", ...publicityAccess, submitForReview);
announcementsRouter.patch("/:id/approve", ...publicityAccess, approve);
announcementsRouter.patch("/:id/request-revision", ...publicityAccess, requestRevision);
announcementsRouter.put("/:id", ...publicityAccess, update);
announcementsRouter.patch("/:id/publish", ...publicityAccess, publish);
announcementsRouter.patch("/:id/schedule", ...publicityAccess, schedule);
announcementsRouter.patch("/:id/archive", ...publicityAccess, archive);
announcementsRouter.delete("/:id", ...publicityAccess, remove);