import { and, asc, count, desc, eq, gte, inArray } from "drizzle-orm";
import { db } from "../../db/index.js";
import { announcements, auditLogs, bibleStudies, events, mediaAssets, users } from "../../db/schema/index.js";

function toStatusCounts(rows: { status: string; count: number }[]) {
  return Object.fromEntries(rows.map((row) => [row.status, Number(row.count)]));
}

export async function getSummary() {
  const publicityTargetTypes = ["event", "announcement", "media_asset", "bible_study", "website"];
  const now = new Date();
  const [announcementRows, programRows, bibleStudyRows, mediaRows, upcomingPrograms, auditRows, awaitingRows, mediaTypeRows] = await Promise.all([
    db.select({ status: announcements.status, count: count() })
      .from(announcements).groupBy(announcements.status).orderBy(desc(announcements.status)),
    db.select({ status: events.status, count: count() })
      .from(events).groupBy(events.status).orderBy(desc(events.status)),
    db.select({ status: bibleStudies.publicationStatus, count: count() })
      .from(bibleStudies).groupBy(bibleStudies.publicationStatus).orderBy(desc(bibleStudies.publicationStatus)),
    db.select({ count: count() }).from(mediaAssets),
    db.select({ id: events.id, title: events.title, startTime: events.startTime })
      .from(events)
      .where(and(eqPublishedProgram(), gte(events.startTime, now)))
      .orderBy(asc(events.startTime))
      .limit(5),
    db.select({
      action: auditLogs.action,
      targetType: auditLogs.targetType,
      targetId: auditLogs.targetId,
      createdAt: auditLogs.createdAt,
      actorName: users.name,
    })
      .from(auditLogs)
      .innerJoin(users, eq(auditLogs.actorId, users.id))
      .where(inArray(auditLogs.targetType, publicityTargetTypes))
      .orderBy(desc(auditLogs.createdAt))
      .limit(10),
    db.select({ status: announcements.status, count: count() })
      .from(announcements)
      .where(inArray(announcements.status, ["Pending Review", "Revision Requested"]))
      .groupBy(announcements.status),
    db.select({ resourceType: mediaAssets.resourceType, count: count() })
      .from(mediaAssets)
      .groupBy(mediaAssets.resourceType),
  ]);
  const announcementStatuses = toStatusCounts(announcementRows);
  const programStatuses = toStatusCounts(programRows);
  const bibleStudyStatuses = toStatusCounts(bibleStudyRows);
  const awaitingAction = toStatusCounts(awaitingRows);
  const mediaByResourceType = Object.fromEntries(
    ["image", "video", "raw"].map((resourceType) => [
      resourceType,
      Number(mediaTypeRows.find((row) => row.resourceType === resourceType)?.count ?? 0),
    ]),
  );

  return {
    announcements: announcementStatuses,
    programs: {
      ...programStatuses,
      Published: programStatuses.Active ?? 0,
    },
    bibleStudies: bibleStudyStatuses,
    mediaAssets: { total: Number(mediaRows[0]?.count ?? 0) },
    upcomingPrograms,
    recentAuditLogs: auditRows,
    announcementsAwaitingAction: {
      "Pending Review": awaitingAction["Pending Review"] ?? 0,
      "Revision Requested": awaitingAction["Revision Requested"] ?? 0,
    },
    mediaByResourceType,
  };
}

function eqPublishedProgram() {
  return eq(events.status, "Active");
}
