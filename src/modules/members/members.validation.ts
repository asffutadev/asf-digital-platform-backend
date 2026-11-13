import { z } from "zod";
import { appConfig } from "../../config/app.config.js";
import { canonicalSubgroups } from "../../config/subgroups.config.js";

export const academicLevelOverrideSchema = z.object({
  newLevel: z.enum(["100 Level", "200 Level", "300 Level", "400 Level", "500 Level", "Postgraduate", "Alumni"]),
  overrideReason: z.string().trim().min(5, "A reason of at least 5 characters is required"),
});

export type AcademicLevelOverrideInput = z.infer<typeof academicLevelOverrideSchema>;

export const listMembersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(appConfig.pagination.maxPageSize).default(appConfig.pagination.defaultPageSize),
  search: z.string().trim().max(255).optional(),
  academicLevel: z.string().trim().optional(),
  subgroup: z.enum(canonicalSubgroups).optional(),
  departmentId: z.string().trim().min(1).max(100).optional(),
  membershipStatus: z.enum(["Active Student", "Alumni", "Visiting"]).optional(),
});

export type ListMembersQuery = z.infer<typeof listMembersQuerySchema>;

export const updateRoleSchema = z.object({
  action: z.enum(["assign", "remove"]),
  roleId: z.string().trim().min(1, "roleId is required"),
});

// Publicity can suspend and reactivate. Deactivating accounts is not part of this flow.
export const updateStatusSchema = z.object({
  accountStatus: z.enum(["Active", "Suspended"]),
  reason: z.string().trim().max(500).optional(),
});

export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;

export const resetPasswordSchema = z.object({
  newPassword: z.string().min(8, "Password must be at least 8 characters").max(128),
});

export const updateSubgroupSchema = z.object({
  subgroup: z.enum(canonicalSubgroups),
  replaceExisting: z.boolean().optional().default(false),
});

export type UpdateSubgroupInput = z.infer<typeof updateSubgroupSchema>;