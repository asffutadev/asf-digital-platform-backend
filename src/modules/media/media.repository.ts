import { and, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import {
  announcements,
  bibleStudies,
  events,
  mediaAssets,
  mediaPlacements,
  websiteConfigurations,
  websiteSections,
} from "../../db/schema/index.js";
import type { ListMediaQuery, UpdateMediaInput } from "./media.types.js";

export async function createAsset(input: typeof mediaAssets.$inferInsert) {
  const [asset] = await db.insert(mediaAssets).values(input).returning();
  return asset;
}

export async function listAssets(filters: ListMediaQuery) {
  const conditions = [];
  if (filters.search) {
    const pattern = `%${filters.search}%`;
    conditions.push(or(ilike(mediaAssets.originalFilename, pattern), ilike(mediaAssets.publicId, pattern))!);
  }
  if (filters.category) conditions.push(eq(mediaAssets.category, filters.category));
  if (filters.tag) conditions.push(sql`${mediaAssets.tags} ? ${filters.tag}`);
  if (filters.type) conditions.push(eq(mediaAssets.resourceType, filters.type === "document" ? "raw" : filters.type));

  const where = conditions.length ? and(...conditions) : undefined;
  const offset = (filters.page - 1) * filters.limit;
  const [rows, totalRows] = await Promise.all([
    db.select().from(mediaAssets).where(where).orderBy(desc(mediaAssets.createdAt)).limit(filters.limit).offset(offset),
    db.select({ count: count() }).from(mediaAssets).where(where),
  ]);
  return { rows, total: Number(totalRows[0]?.count ?? 0) };
}

export async function findAssetById(id: string) {
  const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, id)).limit(1);
  return asset ?? null;
}

export async function findPlacementByKey(key: string) {
  const [row] = await db
    .select({ placement: mediaPlacements, asset: mediaAssets })
    .from(mediaPlacements)
    .leftJoin(mediaAssets, eq(mediaPlacements.currentAssetId, mediaAssets.id))
    .where(eq(mediaPlacements.key, key))
    .limit(1);
  return row ?? null;
}

export async function listPlacements(keys?: string[]) {
  const condition = keys?.length ? inArray(mediaPlacements.key, keys) : undefined;
  return db
    .select({ placement: mediaPlacements, asset: mediaAssets })
    .from(mediaPlacements)
    .leftJoin(mediaAssets, eq(mediaPlacements.currentAssetId, mediaAssets.id))
    .where(condition)
    .orderBy(mediaPlacements.key);
}

export async function assignAsset(key: string, assetId: string, assignedBy: string) {
  const [placement] = await db
    .update(mediaPlacements)
    .set({ currentAssetId: assetId, assignedBy, updatedAt: new Date() })
    .where(eq(mediaPlacements.key, key))
    .returning();
  return placement ?? null;
}

export async function updateAsset(id: string, input: UpdateMediaInput) {
  const [asset] = await db
    .update(mediaAssets)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(mediaAssets.id, id))
    .returning();
  return asset ?? null;
}

export async function findAssetReferences(id: string) {
  const [
    placements,
    eventImages,
    announcementImages,
    announcementAttachments,
    websiteCopies,
    websiteImageUrls,
    websiteJson,
    bibleStudyJson,
  ] = await Promise.all([
    db.select({ id: mediaPlacements.id }).from(mediaPlacements).where(eq(mediaPlacements.currentAssetId, id)).limit(1),
    db.select({ id: events.id }).from(events).where(eq(events.imageAssetId, id)).limit(1),
    db.select({ id: announcements.id }).from(announcements).where(eq(announcements.imageAssetId, id)).limit(1),
    db
      .select({ id: announcements.id })
      .from(announcements)
      .where(sql`${announcements.attachmentAssetIds} ? ${id}`)
      .limit(1),
    db
      .select({ id: websiteConfigurations.id })
      .from(websiteConfigurations)
      .where(sql`${websiteConfigurations.copy}::text ILIKE '%' || ${id} || '%'`)
      .limit(1),
    db.select({ id: websiteSections.id }).from(websiteSections).where(eq(websiteSections.imageUrl, id)).limit(1),
    db
      .select({ id: websiteSections.id })
      .from(websiteSections)
      .where(
        sql`${websiteSections.items}::text ILIKE '%' || ${id} || '%' OR ${websiteSections.configuration}::text ILIKE '%' || ${id} || '%'`
      )
      .limit(1),
    db
      .select({ id: bibleStudies.id })
      .from(bibleStudies)
      .where(
        sql`${bibleStudies.outlineAssetId} = ${id}::uuid
          OR ${bibleStudies.aims}::text ILIKE '%' || ${id} || '%'
          OR ${bibleStudies.foodForThought} ILIKE '%' || ${id} || '%'
          OR ${bibleStudies.studyGuide}::text ILIKE '%' || ${id} || '%'
          OR ${bibleStudies.discussionQuestions}::text ILIKE '%' || ${id} || '%'
          OR ${bibleStudies.prayerPoints}::text ILIKE '%' || ${id} || '%'`
      )
      .limit(1),
  ]);

  return [
    placements.length ? "media_placements" : null,
    eventImages.length ? "events" : null,
    announcementImages.length ? "announcements.image_asset_id" : null,
    announcementAttachments.length ? "announcements.attachment_asset_ids" : null,
    websiteCopies.length ? "website_configurations.copy" : null,
    websiteImageUrls.length ? "website_sections.image_url" : null,
    websiteJson.length ? "website_sections.json" : null,
    bibleStudyJson.length ? "bible_studies" : null,
  ].filter((reference): reference is string => reference !== null);
}

export async function deleteAsset(id: string) {
  await db.delete(mediaAssets).where(eq(mediaAssets.id, id));
}
