import { Router } from "express";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireOffice } from "../../middleware/requireOffice.js";
import { getPublic, getDraft, saveDraft, publish, discard, reset } from "./cms.controller.js";

export const cmsRouter = Router();

const publicityAccess = [requireAuth, requireOffice("publicity-coordinator")];

cmsRouter.get("/website", getPublic);
cmsRouter.get("/website/draft", ...publicityAccess, getDraft);
cmsRouter.post("/website/draft", ...publicityAccess, saveDraft);
cmsRouter.post("/website/publish", ...publicityAccess, publish);
cmsRouter.post("/website/draft/discard", ...publicityAccess, discard);
cmsRouter.post("/website/reset", ...publicityAccess, reset);