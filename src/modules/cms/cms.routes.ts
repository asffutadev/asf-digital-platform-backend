import { Router } from "express";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireOffice } from "../../middleware/requireOffice.js";
import { getPublic, getThemes, getDraft, saveDraft, publish, discard, reset, history, restore, activate } from "./cms.controller.js";

export const cmsRouter = Router();

const publicityAccess = [requireAuth, requireOffice("publicity-coordinator")];

cmsRouter.get("/website", getPublic);
cmsRouter.get("/website/themes", getThemes);
cmsRouter.get("/themes", getThemes);
cmsRouter.get("/website/draft", ...publicityAccess, getDraft);
cmsRouter.post("/website/draft", ...publicityAccess, saveDraft);
cmsRouter.post("/website/publish", ...publicityAccess, publish);
cmsRouter.post("/website/draft/discard", ...publicityAccess, discard);
cmsRouter.post("/website/reset", ...publicityAccess, reset);
cmsRouter.get("/website/history", ...publicityAccess, history);
cmsRouter.post("/website/restore", ...publicityAccess, restore);
cmsRouter.post("/website/activate", ...publicityAccess, activate);