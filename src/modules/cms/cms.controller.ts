import type { Request, Response, NextFunction } from "express";
import { AppError } from "../../errors/appError.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import { activateSchema, restoreSchema, saveDraftSchema } from "./cms.validation.js";
import * as service from "./cms.service.js";


export async function getPublic(req: Request, res: Response, next: NextFunction) {
  try { res.set("Cache-Control", "public, max-age=300"); return sendSuccess(res, await service.getPublic()); } catch (err) { next(err); }
}
export async function getThemes(req: Request, res: Response, next: NextFunction) {
  try { return sendSuccess(res, await service.listThemes()); } catch (err) { next(err); }
}
export async function getDraft(req: Request, res: Response, next: NextFunction) {
  try { return sendSuccess(res, await service.getDraft()); } catch (err) { next(err); }
}
export async function saveDraft(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = saveDraftSchema.safeParse(req.body);
    if (!parsed.success) throw AppError.badRequest("Invalid website data", "VALIDATION_ERROR", parsed.error.flatten().fieldErrors);
    return sendSuccess(res, await service.saveDraft(parsed.data, req.user!.id), "Draft saved successfully");
  } catch (err) { next(err); }
}
export async function publish(req: Request, res: Response, next: NextFunction) {
  try { return sendSuccess(res, await service.publish(req.user!.id), "Website published live"); } catch (err) { next(err); }
}
export async function discard(req: Request, res: Response, next: NextFunction) {
  try { return sendSuccess(res, await service.discardDraft(req.user!.id), "Draft discarded"); } catch (err) { next(err); }
}
export async function reset(req: Request, res: Response, next: NextFunction) {
  try { return sendSuccess(res, await service.factoryReset(req.user!.id), "Website reset to defaults"); } catch (err) { next(err); }
}
export async function history(req: Request, res: Response, next: NextFunction) {
  try { return sendSuccess(res, await service.getHistory()); } catch (err) { next(err); }
}
export async function restore(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = restoreSchema.safeParse(req.body);
    if (!parsed.success) throw AppError.badRequest("Invalid restore request", "VALIDATION_ERROR", parsed.error.flatten().fieldErrors);
    return sendSuccess(res, await service.restore(parsed.data.historyId, req.user!.id), "Draft restored");
  } catch (err) { next(err); }
}
export async function activate(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = activateSchema.safeParse(req.body);
    if (!parsed.success) {
      if (req.body?.confirm !== true) throw AppError.badRequest("Activation confirmation is required", "CONFIRMATION_REQUIRED");
      throw AppError.badRequest("Invalid activation request", "VALIDATION_ERROR", parsed.error.flatten().fieldErrors);
    }
    return sendSuccess(res, await service.activateTheme(parsed.data.themeId, req.user!.id), "Website theme activated");
  } catch (err) { next(err); }
}
