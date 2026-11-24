import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../../errors/appError.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import * as repo from "./public.repository.js";

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const programListSchema = listSchema.extend({
  when: z.enum(["upcoming", "past"]).default("upcoming"),
});

function cache(res: Response) {
  res.set("Cache-Control", "public, max-age=60");
}

export async function listPrograms(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = programListSchema.safeParse(req.query);
    if (!parsed.success) throw AppError.badRequest("Invalid public query", "VALIDATION_ERROR", parsed.error.flatten().fieldErrors);
    cache(res);
    const result = await repo.listPrograms(parsed.data.page, parsed.data.limit, parsed.data.when);
    return sendSuccess(res, result.data, "Programs retrieved", { total: result.total, page: parsed.data.page, limit: parsed.data.limit });
  } catch (error) { next(error); }
}

export async function getProgram(req: Request, res: Response, next: NextFunction) {
  try {
    cache(res);
    const row = await repo.findProgram(req.params.id as string);
    if (!row) throw AppError.notFound("Program not found", "PROGRAM_NOT_FOUND");
    return sendSuccess(res, row);
  } catch (error) { next(error); }
}

export async function listAnnouncements(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = listSchema.safeParse(req.query);
    if (!parsed.success) throw AppError.badRequest("Invalid public query", "VALIDATION_ERROR", parsed.error.flatten().fieldErrors);
    cache(res);
    const result = await repo.listAnnouncements(parsed.data.page, parsed.data.limit);
    return sendSuccess(res, result.data, "Announcements retrieved", { total: result.total, page: parsed.data.page, limit: parsed.data.limit });
  } catch (error) { next(error); }
}

export async function getAnnouncement(req: Request, res: Response, next: NextFunction) {
  try {
    cache(res);
    const row = await repo.findAnnouncement(req.params.id as string);
    if (!row) throw AppError.notFound("Announcement not found", "ANNOUNCEMENT_NOT_FOUND");
    return sendSuccess(res, row);
  } catch (error) { next(error); }
}
