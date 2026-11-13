import type { Request, Response, NextFunction } from "express";
import {
  announcementIdSchema,
  createAnnouncementSchema,
  editAnnouncementSchema,
  listAnnouncementsSchema,
  revisionRequestSchema,
  scheduleAnnouncementSchema,
} from "./announcements.validation.js";
import * as service from "./announcements.service.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import { AppError } from "../../errors/appError.js";
import { hasOffice } from "../authorization/authorization.repository.js";

function validationError(error: { flatten: () => { fieldErrors: Record<string, string[]> } }) {
  return AppError.badRequest("Invalid announcement data", "VALIDATION_ERROR", error.flatten().fieldErrors);
}

function parseId(value: string) {
  const parsed = announcementIdSchema.safeParse(value);
  if (!parsed.success) {
    throw AppError.badRequest("Invalid announcement ID", "INVALID_ID_FORMAT", {
      id: ["Announcement ID must be a UUID"],
    });
  }
  return parsed.data;
}

async function canSeeAll(req: Request) {
  return hasOffice(req.user!.id, "publicity-coordinator");
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = listAnnouncementsSchema.safeParse(req.query);
    if (!parsed.success) throw validationError(parsed.error);
    const includeAll = await canSeeAll(req);
    const result = await service.getAnnouncements(parsed.data, includeAll, req.user!);
    return sendSuccess(res, result.data, "Announcements retrieved", {
      total: result.total,
      page: parsed.data.page,
      limit: parsed.data.limit,
    });
  } catch (err) {
    next(err);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    return sendSuccess(res, await service.getAnnouncement(parseId(req.params.id as string), await canSeeAll(req), req.user!));
  } catch (err) {
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = createAnnouncementSchema.safeParse(req.body);
    if (!parsed.success) throw validationError(parsed.error);
    return sendSuccess(res, await service.createAnnouncement(parsed.data, req.user!.id), "Announcement created", undefined, 201);
  } catch (err) {
    next(err);
  }
}

export async function submitForReview(req: Request, res: Response, next: NextFunction) {
  try {
    return sendSuccess(res, await service.submitForReview(parseId(req.params.id as string)), "Submitted for review");
  } catch (err) {
    next(err);
  }
}

export async function approve(req: Request, res: Response, next: NextFunction) {
  try {
    return sendSuccess(res, await service.approve(parseId(req.params.id as string), req.user!.id), "Announcement approved");
  } catch (err) {
    next(err);
  }
}

export async function requestRevision(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = revisionRequestSchema.safeParse(req.body);
    if (!parsed.success) throw validationError(parsed.error);
    return sendSuccess(res, await service.requestRevision(parseId(req.params.id as string), parsed.data), "Revision requested");
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = editAnnouncementSchema.safeParse(req.body);
    if (!parsed.success) throw validationError(parsed.error);
    return sendSuccess(res, await service.updateAnnouncement(parseId(req.params.id as string), parsed.data), "Announcement updated");
  } catch (err) {
    next(err);
  }
}

export async function publish(req: Request, res: Response, next: NextFunction) {
  try {
    return sendSuccess(res, await service.publish(parseId(req.params.id as string), req.user!.id), "Announcement published");
  } catch (err) {
    next(err);
  }
}

export async function schedule(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = scheduleAnnouncementSchema.safeParse(req.body);
    if (!parsed.success) throw validationError(parsed.error);
    return sendSuccess(res, await service.schedule(parseId(req.params.id as string), parsed.data.publishAt), "Announcement scheduled");
  } catch (err) {
    next(err);
  }
}

export async function archive(req: Request, res: Response, next: NextFunction) {
  try {
    return sendSuccess(res, await service.archive(parseId(req.params.id as string)), "Announcement archived");
  } catch (err) {
    next(err);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    await service.deleteAnnouncement(parseId(req.params.id as string));
    return sendSuccess(res, null, "Announcement deleted");
  } catch (err) {
    next(err);
  }
}
