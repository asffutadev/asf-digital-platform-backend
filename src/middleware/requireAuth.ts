import type { Request, Response, NextFunction } from "express";
import { AppError } from "../errors/appError.js";
import { appConfig } from "../config/app.config.js";
import { hashToken } from "../utils/token.js";
import * as authRepository from "../modules/auth/auth.repository.js";
import { db } from "../db/index.js";

// While a temporary password is pending, these are the only routes a session may use.
const ALLOWED_WHILE_PASSWORD_CHANGE_PENDING = new Set([
  "/api/auth/me",
  "/api/auth/logout",
  "/api/auth/change-password",
]);

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const rawSessionToken = req.cookies?.asf_session;

    if (!rawSessionToken) {
      throw AppError.unauthorized("Not authenticated", "NO_SESSION");
    }

    const sessionTokenHash = hashToken(rawSessionToken);
    const session = await authRepository.findActiveSessionByHash(sessionTokenHash);

    if (!session) {
      throw AppError.unauthorized("Session is invalid or has expired", "INVALID_SESSION");
    }

    const user = await authRepository.findUserById(db, session.userId);
    if (!user) {
      throw AppError.unauthorized("User no longer exists", "INVALID_SESSION");
    }

    if (user.accountStatus !== "Active") {
      throw AppError.forbidden("Account is not active", "ACCOUNT_NOT_ACTIVE");
    }

    const msUntilExpiry = session.expiresAt.getTime() - Date.now();
    const renewalThresholdMs = appConfig.auth.sessionSlidingRenewalDays * 24 * 60 * 60 * 1000;

    const shouldRenew = msUntilExpiry < renewalThresholdMs;
    const newExpiresAt = shouldRenew
      ? new Date(Date.now() + appConfig.auth.sessionTtlDays * 24 * 60 * 60 * 1000)
      : null;

    await authRepository.touchSession(session.id, newExpiresAt);

    const roles = await authRepository.getUserRolesByUserId(user.id);

    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      department: user.department,
      departmentId: user.departmentId,
      gender: user.gender,
      academicLevel: user.academicLevel,
      accountStatus: user.accountStatus,
      mustChangePassword: user.mustChangePassword,
      roles,
    };
    req.sessionId = session.id;

    if (user.mustChangePassword) {
      const fullPath = (req.baseUrl + req.path).replace(/\/+$/, "");
      if (!ALLOWED_WHILE_PASSWORD_CHANGE_PENDING.has(fullPath)) {
        throw AppError.forbidden(
          "You must change your temporary password before continuing",
          "PASSWORD_CHANGE_REQUIRED"
        );
      }
    }

    next();
  } catch (err) {
    next(err);
  }
}