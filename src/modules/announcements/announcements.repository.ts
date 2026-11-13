import { and, count, desc, eq, gte, ilike, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { announcements, mediaAssets, users } from "../../db/schema/index.js";
import type { ListAnnouncementsInput } from "./announcements.validation.js";

type Viewer = { id: string };

const unrestrictedAudience = sql`coalesce(jsonb_array_length(${announcements.audience} -> 'gender'), 0) = 0
  AND coalesce(jsonb_array_length(${announcements.audience} -> 'subgroups'), 0) = 0
  AND coalesce(jsonb_array_length(${announcements.audience} -> 'levels'), 0) = 0`;

function audienceForViewer() {
  const gender = and(
    or(
      sql`coalesce(jsonb_array_length(${announcements.audience} -> 'gender'), 0) = 0`,
      and(isNotNull(users.gender), sql`(${announcements.audience} -> 'gender') ? ${users.gender}`)
    )!
  )!;
  const subgroup = or(
    sql`coalesce(jsonb_array_length(${announcements.audience} -> 'subgroups'), 0) = 0`,
    and(isNotNull(users.subgroup), sql`(${announcements.audience} -> 'subgroups') ? ${users.subgroup}`)
  )!;
  const level = sql`coalesce(jsonb_array_length(${announcements.audience} -> 'levels'), 0) = 0
    OR (${announcements.audience} -> 'levels') ? ${users.academicLevel}`;
  return and(gender, subgroup, level);
}

function statusCondition(filters: ListAnnouncementsInput, includeAll: boolean, now: Date) {
  if (!includeAll) {
    if (filters.status && filters.status !== "Published") return sql`false`;
    return or(
      eq(announcements.status, "Published"),
      and(eq(announcements.status, "Scheduled"), ltePublishAt(now))
    )!;
  }
  if (!filters.status) return undefined;
  if (filters.status === "Published") {
    return or(eq(announcements.status, "Published"), and(eq(announcements.status, "Scheduled"), ltePublishAt(now)))!;
  }
  if (filters.status === "Scheduled") {
    return and(eq(announcements.status, "Scheduled"), sql`${announcements.publishAt} > ${now}`);
  }
  return eq(announcements.status, filters.status);
}

function ltePublishAt(now: Date) {
  return or(isNull(announcements.publishAt), lte(announcements.publishAt, now))!;
}

export async function createAnnouncement(input: typeof announcements.$inferInsert) {
  const [row] = await db.insert(announcements).values(input).returning({ id: announcements.id });
  return row ? findById(row.id) : null;
}

export async function findById(id: string, viewer?: Viewer, includeAll = false) {
  const conditions = [eq(announcements.id, id)];
  if (!includeAll && viewer) conditions.push(audienceForViewer()!);
  const [row] = await db
    .select({ announcement: announcements, imageAssetUrl: mediaAssets.secureUrl })
    .from(announcements)
    .leftJoin(mediaAssets, eq(announcements.imageAssetId, mediaAssets.id))
    .leftJoin(users, viewer && !includeAll ? eq(users.id, viewer.id) : sql`false`)
    .where(and(...conditions))
    .limit(1);
  return row ?? null;
}

export async function listAnnouncements(filters: ListAnnouncementsInput, includeAll: boolean, viewer?: Viewer) {
  const now = new Date();
  const conditions = [];
  const status = statusCondition(filters, includeAll, now);
  if (status) conditions.push(status);
  if (!includeAll && viewer) conditions.push(audienceForViewer()!);
  if (filters.search) conditions.push(ilike(announcements.title, `%${filters.search}%`));
  if (filters.category) conditions.push(eq(announcements.category, filters.category));
  if (filters.audience === "restricted") conditions.push(sql`NOT (${unrestrictedAudience})`);
  if (filters.audience === "unrestricted") conditions.push(unrestrictedAudience);
  if (!includeAll) conditions.push(or(isNull(announcements.expiresAt), gte(announcements.expiresAt, now))!);

  const where = conditions.length ? and(...conditions) : undefined;
  const offset = (filters.page - 1) * filters.limit;
  const query = db
    .select({ announcement: announcements, imageAssetUrl: mediaAssets.secureUrl })
    .from(announcements)
    .leftJoin(mediaAssets, eq(announcements.imageAssetId, mediaAssets.id))
    .leftJoin(users, viewer && !includeAll ? eq(users.id, viewer.id) : sql`false`)
    .where(where)
    .orderBy(desc(announcements.createdAt))
    .limit(filters.limit)
    .offset(offset);
  const [rows, totalRows] = await Promise.all([
    query,
    db
      .select({ count: count() })
      .from(announcements)
      .leftJoin(users, viewer && !includeAll ? eq(users.id, viewer.id) : sql`false`)
      .where(where),
  ]);
  return { rows, total: Number(totalRows[0]?.count ?? 0) };
}

export async function updateStatus(
  id: string,
  fields: Partial<{
    status: string;
    revisionNotes: string | null;
    approvedBy: string | null;
    approvedAt: Date | null;
    publishedBy: string | null;
    publishedAt: Date | null;
    publishAt: Date | null;
    archivedAt: Date | null;
  }>
) {
  const [row] = await db
    .update(announcements)
    .set({ ...fields, updatedAt: new Date() })
    .where(eq(announcements.id, id))
    .returning({ id: announcements.id });
  return row ? findById(row.id) : null;
}

export async function updateContent(id: string, fields: Partial<typeof announcements.$inferInsert>) {
  const [row] = await db
    .update(announcements)
    .set({ ...fields, status: "Draft", revisionNotes: null, updatedAt: new Date() })
    .where(eq(announcements.id, id))
    .returning({ id: announcements.id });
  return row ? findById(row.id) : null;
}

export async function findAssetIds(ids: string[]) {
  if (ids.length === 0) return [];
  const rows = await db.select({ id: mediaAssets.id }).from(mediaAssets).where(inArray(mediaAssets.id, ids));
  return rows.map((row) => row.id);
}

export async function deleteAnnouncement(id: string) {
  await db.delete(announcements).where(eq(announcements.id, id));
}
