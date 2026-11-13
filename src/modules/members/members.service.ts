import { db } from "../../db/index.js";
import { AppError } from "../../errors/appError.js";
import * as repo from "./members.repository.js";
import type {
  AcademicLevelOverrideInput,
  ListMembersQuery,
  UpdateRoleInput,
  UpdateStatusInput,
  UpdateSubgroupInput,
} from "./members.validation.js";
import { users } from "../../db/schema/index.js";
import { hashPassword } from "../../utils/password.js";
import { recordAudit } from "../../utils/auditLog.js";
import { getUserExecutiveOffices, hasCapability, hasOffice } from "../authorization/authorization.repository.js";

type UserRow = typeof users.$inferSelect;

// Never send the password hash to any client, even admins.
function withoutPasswordHash(user: UserRow | null | undefined) {
  if (!user) return user;
  const { passwordHash: _passwordHash, ...safe } = user;
  return safe;
}

function toMemberView(user: UserRow, canViewPrivate: boolean): PublicMemberView | PrivateMemberView {
  const base: PublicMemberView = {
    id: user.id,
    name: user.name,
    department: user.department,
    departmentId: user.departmentId,
    academicLevel: user.academicLevel,
    subgroup: user.subgroup,
    membershipStatus: user.membershipStatus,
    avatarUrl: user.avatarUrl,
  };
  if (!canViewPrivate) return base;
  return { ...base, email: user.email, phoneNumber: user.phoneNumber, accountStatus: user.accountStatus, gender: user.gender };
}

export interface PublicMemberView {
  id: string;
  name: string;
  department: string | null;
  departmentId: string | null;
  academicLevel: string;
  subgroup: string | null;
  membershipStatus: string;
  avatarUrl: string | null;
}

export interface PrivateMemberView extends PublicMemberView {
  email: string;
  phoneNumber: string | null;
  accountStatus: string;
  gender: string | null;
}

// Email, phone, gender and account status are visible to the Publicity Coordinator and the President only.
export async function canViewPrivateDetails(userId: string) {
  const [publicity, president] = await Promise.all([
    hasOffice(userId, "publicity-coordinator"),
    hasOffice(userId, "president"),
  ]);
  return publicity || president;
}

const PROTECTED_ROLES = ["President / Executive", "Technical Administrator"];

// A member is protected when they hold any executive office, the technical_head capability,
// or one of the high-privilege roles. Publicity cannot suspend them or reset their password.
async function describeTarget(userId: string) {
  const [offices, isTechnicalHead, roleIds] = await Promise.all([
    getUserExecutiveOffices(userId),
    hasCapability(userId, "technical_head"),
    repo.getRoleIds(userId),
  ]);
  const officeIds = offices.map((office) => office.id);
  const holdsProtectedRole = roleIds.some((roleId) => PROTECTED_ROLES.includes(roleId));
  return {
    officeIds,
    isTechnicalHead,
    holdsProtectedRole,
    isProtected: officeIds.length > 0 || isTechnicalHead || holdsProtectedRole,
  };
}

function protectedMemberError() {
  return AppError.forbidden(
    "This member holds an executive office or technical access and cannot be managed here",
    "PROTECTED_MEMBER"
  );
}

export async function overrideAcademicLevel(
  targetUserId: string,
  input: AcademicLevelOverrideInput,
  actingUserId: string
) {
  const targetUser = await repo.findUserById(targetUserId);
  if (!targetUser) {
    throw AppError.notFound("Member not found", "MEMBER_NOT_FOUND");
  }

  const activeSession = await repo.getActiveSession();
  if (!activeSession) {
    throw AppError.internal("No active academic session is configured", "NO_ACTIVE_SESSION");
  }

  const newMembershipStatus = input.newLevel === "Alumni" ? "Alumni" : "Active Student";

  return db.transaction(async (tx) => {
    await repo.applyOverride(
      tx,
      targetUserId,
      input.newLevel,
      newMembershipStatus,
      activeSession.id,
      input.overrideReason,
      actingUserId
    );
    await recordAudit({
      actorId: actingUserId,
      action: "member.academic_level_changed",
      targetType: "user",
      targetId: targetUserId,
      metadata: { from: targetUser.academicLevel, to: input.newLevel, reason: input.overrideReason },
    }, tx);
    const updated = await repo.findUserByIdTx(tx, targetUserId);
    return withoutPasswordHash(updated);
  });
}

export async function getMemberDirectory(query: ListMembersQuery, canViewPrivate: boolean) {
  const { rows, total } = await repo.listMembers(query);
  return { data: rows.map((u) => toMemberView(u, canViewPrivate)), total };
}

export async function getMemberById(id: string, canViewPrivate: boolean) {
  const user = await repo.findUserById(id);
  if (!user) {
    throw AppError.notFound("Member not found", "MEMBER_NOT_FOUND");
  }
  return toMemberView(user, canViewPrivate);
}

// Only the President reaches this (the route requires the President office).
export async function updateMemberRole(targetUserId: string, input: UpdateRoleInput, actingUserId: string) {
  const targetUser = await repo.findUserById(targetUserId);
  if (!targetUser) {
    throw AppError.notFound("Member not found", "MEMBER_NOT_FOUND");
  }

  const role = await repo.roleExists(input.roleId);
  if (!role) {
    throw AppError.badRequest("Role does not exist", "INVALID_ROLE");
  }

  if (targetUserId === actingUserId && PROTECTED_ROLES.includes(input.roleId)) {
    throw AppError.badRequest("You cannot change your own high-privilege role", "CANNOT_SELF_ESCALATE");
  }

  return db.transaction(async (tx) => {
    if (input.action === "assign") {
      await repo.assignRole(targetUserId, input.roleId, actingUserId, tx);
    } else {
      if (input.roleId === "Member") {
        throw AppError.badRequest("The base Member role cannot be removed", "CANNOT_REMOVE_BASE_ROLE");
      }
      await repo.removeRole(targetUserId, input.roleId, tx);
    }
    await recordAudit({
      actorId: actingUserId,
      action: `role.${input.action}`,
      targetType: "user",
      targetId: targetUserId,
      metadata: { roleId: input.roleId },
    }, tx);
    return withoutPasswordHash(await repo.findUserByIdTx(tx, targetUserId));
  });
}

export async function updateMemberStatus(targetUserId: string, input: UpdateStatusInput, actingUserId: string) {
  const targetUser = await repo.findUserById(targetUserId);
  if (!targetUser) {
    throw AppError.notFound("Member not found", "MEMBER_NOT_FOUND");
  }
  if (targetUserId === actingUserId) {
    throw AppError.badRequest("You cannot change your own account status", "CANNOT_SELF_MODIFY");
  }
  if ((await describeTarget(targetUserId)).isProtected) {
    throw protectedMemberError();
  }

  return db.transaction(async (tx) => {
    const updated = await repo.updateAccountStatus(targetUserId, input.accountStatus, tx);
    if (input.accountStatus !== "Active") {
      await repo.revokeAllUserSessions(targetUserId, tx);
    }
    await recordAudit({
      actorId: actingUserId,
      action: "member.status_changed",
      targetType: "user",
      targetId: targetUserId,
      metadata: { from: targetUser.accountStatus, to: input.accountStatus, reason: input.reason ?? null },
    }, tx);
    return withoutPasswordHash(updated);
  });
}

// The Publicity Coordinator resets ordinary members. The Technical Head resets a Publicity Coordinator.
// Nobody resets their own password this way, and executive offices and technical access are protected.
export async function adminResetPassword(targetUserId: string, newPassword: string, actingUserId: string) {
  const targetUser = await repo.findUserById(targetUserId);
  if (!targetUser) {
    throw AppError.notFound("Member not found", "MEMBER_NOT_FOUND");
  }
  if (targetUserId === actingUserId) {
    throw AppError.badRequest("You cannot reset your own password this way", "CANNOT_SELF_MODIFY");
  }

  const [actorIsPublicity, actorIsTechnicalHead, target] = await Promise.all([
    hasOffice(actingUserId, "publicity-coordinator"),
    hasCapability(actingUserId, "technical_head"),
    describeTarget(targetUserId),
  ]);

  if (target.isProtected) {
    const targetIsPublicityOnly =
      target.officeIds.length === 1 &&
      target.officeIds[0] === "publicity-coordinator" &&
      !target.isTechnicalHead &&
      !target.holdsProtectedRole;
    if (!(actorIsTechnicalHead && targetIsPublicityOnly)) {
      throw protectedMemberError();
    }
  } else if (!actorIsPublicity) {
    throw AppError.forbidden("You do not hold the office required for this action", "OFFICE_REQUIRED");
  }

  const passwordHash = await hashPassword(newPassword);
  await db.transaction(async (tx) => {
    await repo.setTemporaryPassword(targetUserId, passwordHash, tx);
    await repo.revokeAllUserSessions(targetUserId, tx);
    await recordAudit({
      actorId: actingUserId,
      action: "member.password_reset",
      targetType: "user",
      targetId: targetUserId,
      metadata: { mustChangePassword: true },
    }, tx);
  });
  return { id: targetUserId, mustChangePassword: true };
}

export async function changeSubgroup(userId: string, input: UpdateSubgroupInput, actingUserId: string) {
  const targetUser = await repo.findUserById(userId);
  if (!targetUser) {
    throw AppError.notFound("Member not found", "MEMBER_NOT_FOUND");
  }
  if (targetUser.subgroup === input.subgroup) {
    return withoutPasswordHash(targetUser);
  }
  if (targetUser.subgroup !== null && !input.replaceExisting) {
    throw AppError.conflict(
      "This member already has a subgroup. Send replaceExisting: true to change it.",
      "SUBGROUP_ALREADY_SET"
    );
  }

  return db.transaction(async (tx) => {
    const updated = await repo.updateSubgroup(userId, input.subgroup, tx);
    await recordAudit({
      actorId: actingUserId,
      action: "subgroup.updated",
      targetType: "user",
      targetId: userId,
      metadata: { subgroup: input.subgroup, previousSubgroup: targetUser.subgroup },
    }, tx);
    return withoutPasswordHash(updated);
  });
}