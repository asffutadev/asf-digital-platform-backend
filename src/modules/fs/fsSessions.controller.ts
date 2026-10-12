import type { Request, Response, NextFunction } from "express";
import { sendSuccess } from "../../utils/apiResponse.js";
import * as service from "./fsSessions.service.js";

export async function list(_req: Request, res: Response, next: NextFunction) {
  try {
    return sendSuccess(res, await service.getSessions());
  } catch (err) {
    next(err);
  }
}