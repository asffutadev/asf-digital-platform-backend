import type { Request, Response, NextFunction } from "express";
import { AppError } from "../errors/appError.js";
import { hasCapability, hasOffice } from "../modules/authorization/authorization.repository.js";

export function requireOfficeOrCapability(officeId: string, capabilityId: string) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw AppError.unauthorized("Not authenticated", "NO_SESSION");
      }
      const [office, capability] = await Promise.all([
        hasOffice(req.user.id, officeId),
        hasCapability(req.user.id, capabilityId),
      ]);
      if (!office && !capability) {
        throw AppError.forbidden("This action requires a specific office or capability", "OFFICE_OR_CAPABILITY_REQUIRED");
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}