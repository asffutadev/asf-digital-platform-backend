import { and, asc, count, desc, eq, or, isNull, gt, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { announcements, events, mediaAssets } from "../../db/schema/index.js";

const publicProgramFields = {
  id: events.id,
  title: events.title,
  category: events.category,
  description: events.description,
  location: events.location,
  startTime: events.startTime,
  endTime: events.endTime,
  speaker: events.speaker,
  speakerRole: events.speakerRole,
  mode: events.mode,
  theme: events.theme,
  imageUrl: mediaAssets.secureUrl,
};

export async function listPrograms(page: number, limit: number) {
  const offset = (page - 1) * limit;
  const where = eq(events.status, "Active");
  const [rows, totals] = await Promise.all([
    db.select(publicProgramFields).from(events).leftJoin(mediaAssets, eq(events.imageAssetId, mediaAssets.id))
      .where(where).orderBy(asc(events.startTime)).limit(limit).offset(offset),
    db.select({ count: count() }).from(events).where(where),
  ]);
  return { data: rows, total: Number(totals[0]?.count ?? 0) };
}

export async function findProgram(id: string) {
  const [row] = await db.select(publicProgramFields).from(events).leftJoin(mediaAssets, eq(events.imageAssetId, mediaAssets.id))
    .where(and(eq(events.id, id), eq(events.status, "Active")))
    .limit(1);
  return row ?? null;
}

const publicAnnouncementFields = {
  id: announcements.id,
  title: announcements.title,
  message: announcements.message,
  category: announcements.category,
  priority: announcements.priority,
  isUrgent: announcements.isUrgent,
  expiresAt: announcements.expiresAt,
  publishedAt: announcements.publishedAt,
  imageUrl: mediaAssets.secureUrl,
};

function publicAnnouncementWhere() {
  return and(
    eq(announcements.status, "Published"),
    eq(announcements.isPublic, true),
    or(isNull(announcements.expiresAt), gt(announcements.expiresAt, new Date()))!,
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
