import type { Request, Response, NextFunction } from "express";
import { createEventSchema, eventIdSchema, listEventsSchema, updateEventSchema } from "./events.validation.js";
import * as service from "./events.service.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import { AppError } from "../../errors/appError.js";
import { hasOffice } from "../authorization/authorization.repository.js";

async function canViewDrafts(req: Request) {
  return hasOffice(req.user!.id, "publicity-coordinator");
}

function validationError(error: { flatten: () => { fieldErrors: Record<string, string[]> } }) {
  return AppError.badRequest("Invalid event data", "VALIDATION_ERROR", error.flatten().fieldErrors);
}

function parseId(value: string) {
  const parsed = eventIdSchema.safeParse(value);
  if (!parsed.success) {
    throw AppError.badRequest("Invalid event ID", "INVALID_ID_FORMAT", { id: ["Event ID must be a UUID"] });
  }
  return parsed.data;
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = listEventsSchema.safeParse(req.query);
    if (!parsed.success) throw validationError(parsed.error);
    const result = await service.getEvents(parsed.data, await canViewDrafts(req));
    return sendSuccess(res, result.data, "Programs retrieved", {
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
    return sendSuccess(res, await service.getEvent(parseId(req.params.id as string), await canViewDrafts(req)));
  } catch (err) {
    next(err);
  }
}

export async function featured(req: Request, res: Response, next: NextFunction) {
  try {
    return sendSuccess(res, await service.getFeaturedEvent());
  } catch (err) {
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = createEventSchema.safeParse(req.body);
    if (!parsed.success) throw validationError(parsed.error);
    return sendSuccess(res, await service.createEvent(parsed.data, req.user!.id), "Program created", undefined, 201);
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = updateEventSchema.safeParse(req.body);
    if (!parsed.success) throw validationError(parsed.error);
    return sendSuccess(res, await service.updateEvent(parseId(req.params.id as string), parsed.data), "Program updated");
  } catch (err) {
    next(err);
  }
}

export async function publish(req: Request, res: Response, next: NextFunction) {
  try {
    return sendSuccess(res, await service.publishEvent(parseId(req.params.id as string)), "Program published");
  } catch (err) {
    next(err);
  }
}

export async function cancel(req: Request, res: Response, next: NextFunction) {
  try {
    return sendSuccess(res, await service.cancelEvent(parseId(req.params.id as string)), "Program cancelled");
  } catch (err) {
    next(err);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    await service.deleteEvent(parseId(req.params.id as string));
    return sendSuccess(res, null, "Program deleted");
  } catch (err) {
    next(err);
  }
}
