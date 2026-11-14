import type { Request, Response, NextFunction } from "express";
import { sendSuccess } from "../../utils/apiResponse.js";
import { getSummary } from "./publicity.repository.js";

export async function summary(_req: Request, res: Response, next: NextFunction) {
  try {
    return sendSuccess(res, await getSummary(), "Publicity summary retrieved");
  } catch (err) {
    next(err);
  }
}
