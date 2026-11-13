import { Router } from "express";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requirePermission } from "../../middleware/requirePermission.js";
import { requireOffice } from "../../middleware/requireOffice.js";
import { requireOfficeOrCapability } from "../../middleware/requireOfficeOrCapability.js";
import { overrideLevel, list, updateRole, updateStatus, getById, resetPassword, updateSubgroup } from "./members.controller.js";

export const membersRouter = Router();

const publicityAccess = [requireAuth, requireOffice("publicity-coordinator")];

membersRouter.get("/", requireAuth, requirePermission("members.view_directory"), list);
membersRouter.get("/:id", requireAuth, requirePermission("members.view_directory"), getById);
membersRouter.patch("/:id/academic-level", ...publicityAccess, overrideLevel);
membersRouter.patch("/:id/status", ...publicityAccess, updateStatus);
membersRouter.patch("/:id/subgroup", ...publicityAccess, updateSubgroup);
membersRouter.patch("/:id/reset-password", requireAuth, requireOfficeOrCapability("publicity-coordinator", "technical_head"), resetPassword);
membersRouter.patch("/:id/role", requireAuth, requireOffice("president"), updateRole);