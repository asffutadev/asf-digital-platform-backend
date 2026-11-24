import { and, asc, count, desc, eq, or, isNull, gt, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { announcements, events, mediaAssets } from "../../db/schema/index.js";

const publicProgramFields = {
  id: events.id,
  title: events.title,
  startTime: events.startTime,
  location: events.location,
  description: events.description,
  guestMinister: events.speaker,
  programType: sql<string>`CASE
    WHEN ${events.mode} = 'Online / Zoom' THEN 'Online'
    WHEN ${events.mode} IN ('In-Person', 'Hybrid') THEN 'Physical'
  END`,
  imageUrl: sql<string | null>`COALESCE(${mediaAssets.secureUrl}, ${events.imageUrl})`,
  status: events.status,
};

export async function listPrograms(page: number, limit: number, when: "upcoming" | "past") {
  const offset = (page - 1) * limit;
  const now = new Date();
  const where = when === "upcoming"
    ? and(eq(events.status, "Active"), sql`${events.startTime} >= ${now}`)!
    : and(
        or(eq(events.status, "Active"), eq(events.status, "Cancelled"))!,
        sql`${events.startTime} < ${now}`,
      )!;
  const [rows, totals] = await Promise.all([
    db.select(publicProgramFields).from(events).leftJoin(mediaAssets, eq(events.imageAssetId, mediaAssets.id))
      .where(where).orderBy(asc(events.startTime)).limit(limit).offset(offset),
    db.select({ count: count() }).from(events).where(where),
  ]);
  return {
    data: rows.map((row) => ({
      ...row,
      status: row.status === "Active" ? "Published" : row.status,
    })),
    total: Number(totals[0]?.count ?? 0),
  };
}

export async function findProgram(id: string) {
  const [row] = await db.select(publicProgramFields).from(events).leftJoin(mediaAssets, eq(events.imageAssetId, mediaAssets.id))
    .where(and(eq(events.id, id), or(eq(events.status, "Active"), eq(events.status, "Cancelled"))))
    .limit(1);
  return row ? { ...row, status: row.status === "Active" ? "Published" : row.status } : null;
}

const publicAnnouncementFields = {
  id: announcements.id,
  title: announcements.title,
  message: announcements.message,
  category: announcements.category,
  priority: announcements.priority,
  expiresAt: announcements.expiresAt,
  publishedAt: announcements.publishedAt,
  imageUrl: mediaAssets.secureUrl,
};

function publicAnnouncementWhere() {
  return and(
    or(
      and(
        eq(announcements.status, "Published"),
        or(isNull(announcements.publishAt), sql`${announcements.publishAt} <= ${new Date()}`)!,
      ),
      and(
        eq(announcements.status, "Scheduled"),
        sql`${announcements.publishAt} <= ${new Date()}`,
      ),
    )!,
    eq(announcements.isPublic, true),
    or(isNull(announcements.expiresAt), gt(announcements.expiresAt, new Date()))!,
    or(isNull(announcements.publishAt), sql`${announcements.publishAt} <= ${new Date()}`)!,
    sql`COALESCE(jsonb_array_length(${announcements.audience}->'gender'), 0) = 0`,
    sql`COALESCE(jsonb_array_length(${announcements.audience}->'subgroups'), 0) = 0`,
    sql`COALESCE(jsonb_array_length(${announcements.audience}->'levels'), 0) = 0`,
  );
}

export async function listAnnouncements(page: number, limit: number) {
  const offset = (page - 1) * limit;
  const where = publicAnnouncementWhere();
  const [rows, totals] = await Promise.all([
    db.select(publicAnnouncementFields).from(announcements).leftJoin(mediaAssets, eq(announcements.imageAssetId, mediaAssets.id))
      .where(where).orderBy(desc(announcements.publishedAt)).limit(limit).offset(offset),
    db.select({ count: count() }).from(announcements).where(where),
  ]);
  return { data: rows, total: Number(totals[0]?.count ?? 0) };
}

export async function findAnnouncement(id: string) {
  const [row] = await db.select(publicAnnouncementFields).from(announcements).leftJoin(mediaAssets, eq(announcements.imageAssetId, mediaAssets.id))
    .where(and(eq(announcements.id, id), publicAnnouncementWhere()))
    .limit(1);
  return row ?? null;
}
