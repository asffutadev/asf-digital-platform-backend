import { db } from "../../db/index.js";
import { AppError } from "../../errors/appError.js";
import { getProgressionRule } from "../../config/progressionRules.config.js";
import * as repo from "./academicSession.repository.js";
import type { CreateSessionInput } from "./academicSession.validation.js";

export async function createNewSession(input: CreateSessionInput) {
  const existing = await repo.findSessionById(input.id);
  if (existing) {
    throw AppError.conflict("An academic session with this ID already exists", "SESSION_ALREADY_EXISTS");
  }
  return repo.createSession(input);
}

export async function activateAndProgress(sessionId: string) {
  const targetSession = await repo.findSessionById(sessionId);
  if (!targetSession) {
    throw AppError.notFound("Academic session not found", "SESSION_NOT_FOUND");
  }
  if (targetSession.isActive) {
    throw AppError.conflict("This session is already active", "SESSION_ALREADY_ACTIVE");
  }

  return db.transaction(async (tx) => {
    const students = await repo.getActiveStudents(tx);
    const existingIds = await repo.findExistingHistoryUserIds(
      tx,
      students.map((student) => student.id),
      sessionId
    );
    const eligible = students.filter((student) => !existingIds.has(student.id));
    const skippedCount = students.length - eligible.length;
    const skippedUserIds = students
      .filter((student) => existingIds.has(student.id))
      .map((student) => student.id);

    const batches = new Map<string, {
      userIds: string[];
      targetLevel: string;
      targetMembershipStatus: "Active Student" | "Alumni";
    }>();

    for (const student of eligible) {
      const rule = getProgressionRule(student.academicLevel, student.programDurationYears);
      const key = `${rule.targetLevel}:${rule.targetMembershipStatus}`;
      const batch = batches.get(key) ?? {
        userIds: [],
        targetLevel: rule.targetLevel,
        targetMembershipStatus: rule.targetMembershipStatus,
      };
      batch.userIds.push(student.id);
      batches.set(key, batch);
    }

    const historyEntries: Array<{
      userId: string;
      sessionId: string;
      level: string;
      status: "Promoted" | "Graduated";
    }> = [];
    let promotedCount = 0;
    let graduatedCount = 0;

    for (const batch of batches.values()) {
      await repo.bulkProgressUsers(
        tx,
        batch.userIds,
        batch.targetLevel,
        batch.targetMembershipStatus
      );
      const status = batch.targetMembershipStatus === "Alumni" ? "Graduated" : "Promoted";
      if (status === "Graduated") graduatedCount += batch.userIds.length;
      else promotedCount += batch.userIds.length;
      historyEntries.push(...batch.userIds.map((userId): {
        userId: string;
        sessionId: string;
        level: string;
        status: "Promoted" | "Graduated";
      } => ({
        userId,
        sessionId,
        level: batch.targetLevel,
        status,
      })));
    }

    await repo.recordHistoryBatch(tx, historyEntries);

    await repo.deactivateCurrentSession(tx);
    await repo.activateSession(tx, sessionId);

    return { sessionId, totalStudents: students.length, promotedCount, graduatedCount, skippedCount, skippedUserIds };
  });
}

