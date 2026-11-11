import { Router } from "express";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireOffice } from "../../middleware/requireOffice.js";
import { list, create, submitForReview, approve, requestRevision, editAfterRevision, publish, archive } from "./announcements.controller.js";

export const announcementsRouter = Router();

const publicityAccess = [requireAuth, requireOffice("publicity-coordinator")];

announcementsRouter.get("/", requireAuth, list);
announcementsRouter.post("/", ...publicityAccess, create);
announcementsRouter.patch("/:id/submit-review", ...publicityAccess, submitForReview);
announcementsRouter.patch("/:id/approve", ...publicityAccess, approve);
announcementsRouter.patch("/:id/request-revision", ...publicityAccess, requestRevision);
announcementsRouter.put("/:id", ...publicityAccess, editAfterRevision);
announcementsRouter.patch("/:id/publish", ...publicityAccess, publish);
announcementsRouter.patch("/:id/archive", ...publicityAccess, archive);