import { db } from "../../db/index.js";
import { academicSessions, users, userAcademicHistory } from "../../db/schema/index.js";
import { eq, and, ne, inArray } from "drizzle-orm";
import type { Transaction } from "../../db/index.js";
import type { CreateSessionInput } from "./academicSession.validation.js";


export async function listSessions() {
  return db.query.academicSessions.findMany({
    orderBy: (table, { desc }) => [desc(table.startDate)],
  });
}

export async function findSessionById(id: string) {
  return db.query.academicSessions.findFirst({ where: eq(academicSessions.id, id) });
}

export async function createSession(input: CreateSessionInput) {
  const [session] = await db
    .insert(academicSessions)
    .values({ id: input.id, name: input.name, startDate: input.startDate, endDate: input.endDate, isActive: false })
    .returning();
  return session;
}

export async function getActiveStudents(tx: Transaction) {
  // Only students still progressing — Alumni/Visiting are excluded, matching
  // spec intent that progression only applies to active academic tracks
  return tx
    .select()
    .from(users)
    .where(and(eq(users.accountStatus, "Active"), ne(users.membershipStatus, "Alumni")));
}

export async function deactivateCurrentSession(tx: Transaction) {
  await tx.update(academicSessions).set({ isActive: false }).where(eq(academicSessions.isActive, true));
}

export async function activateSession(tx: Transaction, sessionId: string) {
  await tx.update(academicSessions).set({ isActive: true }).where(eq(academicSessions.id, sessionId));
}

export async function progressUser(
  tx: Transaction,
  userId: string,
  newLevel: string,
  newMembershipStatus: string
) {
  await tx.update(users).set({ academicLevel: newLevel, membershipStatus: newMembershipStatus }).where(eq(users.id, userId));
}

export async function recordHistory(
  tx: Transaction,
  userId: string,
  sessionId: string,
  level: string,
  status: "Promoted" | "Graduated"
) {
  await tx.insert(userAcademicHistory).values({
    userId,
    academicSessionId: sessionId,
    academicLevel: level,
    progressionStatus: status,
  });
}

export async function findActiveSession() {
  return db.query.academicSessions.findFirst({ where: eq(academicSessions.isActive, true) });
}

export async function findExistingHistory(tx: any, userId: string, sessionId: string) {
  const rows = await tx
    .select()
    .from(userAcademicHistory)
    .where(and(eq(userAcademicHistory.userId, userId), eq(userAcademicHistory.academicSessionId, sessionId)));
  return rows[0] ?? null;
}

export async function findExistingHistoryUserIds(
  tx: Transaction,
  userIds: string[],
  sessionId: string
) {
  if (userIds.length === 0) return new Set<string>();
  const rows = await tx
    .select({ userId: userAcademicHistory.userId })
    .from(userAcademicHistory)
    .where(and(
      inArray(userAcademicHistory.userId, userIds),
      eq(userAcademicHistory.academicSessionId, sessionId)
    ));
  return new Set(rows.map((row) => row.userId));
}

export async function bulkProgressUsers(
  tx: Transaction,
  userIds: string[],
  newLevel: string,
  newMembershipStatus: string
) {
  if (userIds.length === 0) return;
  await tx
    .update(users)
    .set({ academicLevel: newLevel, membershipStatus: newMembershipStatus, updatedAt: new Date() })
    .where(inArray(users.id, userIds));
}

export async function recordHistoryBatch(
  tx: Transaction,
  entries: Array<{
    userId: string;
    sessionId: string;
    level: string;
    status: "Promoted" | "Graduated";
  }>
) {
  if (entries.length === 0) return;
  await tx.insert(userAcademicHistory).values(
    entries.map((entry) => ({
      userId: entry.userId,
      academicSessionId: entry.sessionId,
      academicLevel: entry.level,
      progressionStatus: entry.status,
    }))
  );
}