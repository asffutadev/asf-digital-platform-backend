import { db } from "../../db/index.js";
import { events, mediaAssets } from "../../db/schema/index.js";
import { and, asc, count, eq, gte, ilike, lte, lt, or, desc } from "drizzle-orm";
import type { ListEventsInput } from "./events.validation.js";

type EventInsert = typeof events.$inferInsert;

const API_TO_DB_STATUS = {
  Draft: "Draft",
  Published: "Active",
  Cancelled: "Cancelled",
} as const;

export async function createEvent(input: EventInsert) {
  const [row] = await db.insert(events).values(input).returning({ id: events.id });
  return row ? findById(row.id) : null;
}

export async function findById(id: string) {
  const [row] = await db
    .select({ event: events, imageAssetUrl: mediaAssets.secureUrl })
    .from(events)
    .leftJoin(mediaAssets, eq(events.imageAssetId, mediaAssets.id))
    .where(eq(events.id, id))
    .limit(1);
  return row ?? null;
}

export async function listEvents(filters: ListEventsInput, canViewDrafts: boolean) {
  const now = new Date();
  const archiveCutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const conditions = [];

  if (!canViewDrafts) {
    conditions.push(or(eq(events.status, "Active"), eq(events.status, "Cancelled"))!);
  } else if (filters.status) {
    conditions.push(eq(events.status, API_TO_DB_STATUS[filters.status]));
  }

  if (filters.programType) {
    conditions.push(eq(events.mode, filters.programType === "Physical" ? "In-Person" : "Online / Zoom"));
  }
  if (filters.search) conditions.push(ilike(events.title, `%${filters.search}%`));
  if (filters.filter === "upcoming") conditions.push(gte(events.startTime, now));
  if (filters.filter === "past") conditions.push(lt(events.startTime, now));
  if (filters.archived === "exclude") conditions.push(gte(events.startTime, archiveCutoff));
  if (filters.archived === "only") conditions.push(lte(events.startTime, archiveCutoff));

  const where = conditions.length ? and(...conditions) : undefined;
  const offset = (filters.page - 1) * filters.limit;
  const [rows, totalRows] = await Promise.all([
    db
      .select({ event: events, imageAssetUrl: mediaAssets.secureUrl })
      .from(events)
      .leftJoin(mediaAssets, eq(events.imageAssetId, mediaAssets.id))
      .where(where)
      .orderBy(asc(events.startTime))
      .limit(filters.limit)
      .offset(offset),
    db.select({ count: count() }).from(events).where(where),
  ]);

  return { rows, total: Number(totalRows[0]?.count ?? 0) };
}

export async function getFeatured() {
  const now = new Date();
  const [row] = await db
    .select({ event: events, imageAssetUrl: mediaAssets.secureUrl })
    .from(events)
    .leftJoin(mediaAssets, eq(events.imageAssetId, mediaAssets.id))
    .where(and(gte(events.startTime, now), eq(events.status, "Active")))
    .orderBy(asc(events.startTime))
    .limit(1);
  return row ?? null;
}

export async function updateEvent(id: string, input: Partial<EventInsert>) {
  const [updated] = await db
    .update(events)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(events.id, id))
    .returning({ id: events.id });
  return updated ? findById(updated.id) : null;
}

export async function publishEvent(id: string) {
  const [updated] = await db
    .update(events)
    .set({ status: "Active", updatedAt: new Date() })
    .where(and(eq(events.id, id), eq(events.status, "Draft")))
    .returning({ id: events.id });
  return updated ? findById(updated.id) : null;
}

export async function cancelEvent(id: string) {
  const [updated] = await db
    .update(events)
    .set({ status: "Cancelled", updatedAt: new Date() })
    .where(and(eq(events.id, id), eq(events.status, "Active")))
    .returning({ id: events.id });
  return updated ? findById(updated.id) : null;
}

export async function deleteEvent(id: string) {
  const [deleted] = await db
    .delete(events)
    .where(and(eq(events.id, id), eq(events.status, "Draft")))
    .returning({ id: events.id });
  return deleted ?? null;
}

export async function findMediaAsset(id: string) {
  const [asset] = await db.select({ id: mediaAssets.id }).from(mediaAssets).where(eq(mediaAssets.id, id)).limit(1);
  return asset ?? null;
}
