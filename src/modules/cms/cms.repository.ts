import { db } from "../../db/index.js";
import type { Transaction } from "../../db/index.js";
import {
  mediaAssets,
  websiteConfigurations,
  websitePublishHistory,
  websiteSections,
  websiteSettings,
} from "../../db/schema/index.js";
import { and, asc, desc, eq } from "drizzle-orm";
import { defaultCopy, defaultSections } from "../../config/websiteDefaults.config.js";

export type Executor = typeof db | Transaction;

export async function getConfigWithSections(
  executor: Executor,
  status: "draft" | "published",
  themeId: string,
) {
  const rows = await executor
    .select({
      config: websiteConfigurations,
      section: websiteSections,
      imageAssetUrl: mediaAssets.secureUrl,
    })
    .from(websiteConfigurations)
    .leftJoin(websiteSections, eq(websiteSections.configId, websiteConfigurations.id))
    .leftJoin(mediaAssets, eq(mediaAssets.id, websiteSections.imageAssetId))
    .where(and(eq(websiteConfigurations.status, status), eq(websiteConfigurations.themeId, themeId)))
    .orderBy(asc(websiteSections.order));

  const first = rows[0]?.config;
  if (!first) return null;

  return {
    ...first,
    sections: rows
      .filter((row) => row.section)
      .map((row) => ({ ...row.section!, imageAssetUrl: row.imageAssetUrl })),
  };
}

export async function createDefaultConfig(
  executor: Executor,
  status: "draft" | "published",
  themeId: string,
  updatedBy?: string,
) {
  const [config] = await executor
    .insert(websiteConfigurations)
    .values({ status, themeId, copy: defaultCopy, updatedBy })
    .returning();

  await executor.insert(websiteSections).values(
    defaultSections.map((section) => ({
      configId: config.id,
      sectionKey: section.sectionKey,
      type: section.type,
      title: section.title,
      isCore: section.isCore,
      order: section.order,
      configuration: {},
      items: [],
    })),
  );

  return getConfigWithSections(executor, status, themeId);
}

export async function updateDraft(executor: Executor, configId: string, copy: unknown, updatedBy: string) {
  const [row] = await executor
    .update(websiteConfigurations)
    .set({ copy, updatedBy, updatedAt: new Date() })
    .where(eq(websiteConfigurations.id, configId))
    .returning();
  return row;
}

export async function replaceSections(executor: Executor, configId: string, sections: any[], updatedBy: string) {
  await executor.delete(websiteSections).where(eq(websiteSections.configId, configId));
  if (sections.length === 0) return;

  await executor.insert(websiteSections).values(
    sections.map((section) => ({
      configId,
      sectionKey: section.sectionKey ?? section.id,
      type: section.type,
      title: section.title,
      subtitle: section.subtitle ?? null,
      description: section.description ?? null,
      imageUrl: section.imageUrl ?? null,
      imageAssetId: section.imageAssetId ?? null,
      items: section.items ?? [],
      configuration: section.configuration ?? {},
      isCore: section.isCore ?? false,
      order: section.order,
      isVisible: section.isVisible ?? true,
      updatedBy,
    })),
  );
}

export async function updatePublished(
  executor: Executor,
  publishedConfigId: string,
  draftCopy: unknown,
  publishedBy: string,
  newVersion: number,
) {
  const [published] = await executor
    .update(websiteConfigurations)
    .set({ copy: draftCopy, version: newVersion, publishedBy, publishedAt: new Date(), updatedAt: new Date() })
    .where(eq(websiteConfigurations.id, publishedConfigId))
    .returning();
  return published;
}

export async function createHistorySnapshot(
  executor: Executor,
  snapshot: {
    themeId: string;
    version: number;
    copy: unknown;
    sections: unknown;
    publishedBy: string | null;
    publishedAt: Date;
  },
) {
  return executor.insert(websitePublishHistory).values(snapshot).returning();
}

export async function pruneHistory(executor: Executor, themeId: string) {
  const keep = await executor
    .select({ id: websitePublishHistory.id })
    .from(websitePublishHistory)
    .where(eq(websitePublishHistory.themeId, themeId))
    .orderBy(desc(websitePublishHistory.publishedAt))
    .offset(20);

  for (const row of keep) {
    await executor.delete(websitePublishHistory).where(eq(websitePublishHistory.id, row.id));
  }
}

export async function listHistory(executor: Executor, themeId: string) {
  return executor
    .select({
      id: websitePublishHistory.id,
      version: websitePublishHistory.version,
      publishedAt: websitePublishHistory.publishedAt,
      publishedBy: websitePublishHistory.publishedBy,
    })
    .from(websitePublishHistory)
    .where(eq(websitePublishHistory.themeId, themeId))
    .orderBy(desc(websitePublishHistory.publishedAt));
}

export async function findHistory(executor: Executor, themeId: string, historyId: string) {
  const [row] = await executor
    .select()
    .from(websitePublishHistory)
    .where(and(eq(websitePublishHistory.id, historyId), eq(websitePublishHistory.themeId, themeId)))
    .limit(1);
  return row ?? null;
}

export async function getActiveThemeId(executor: Executor) {
  const [settings] = await executor.select().from(websiteSettings).where(eq(websiteSettings.id, 1));
  return settings?.activeThemeId ?? "theme-1";
}

export async function setActiveThemeId(executor: Executor, themeId: string) {
  await executor
    .insert(websiteSettings)
    .values({ id: 1, activeThemeId: themeId })
    .onConflictDoUpdate({ target: websiteSettings.id, set: { activeThemeId: themeId } });
}

export async function listThemeVersions(executor: Executor, themeIds: string[]) {
  const rows = await executor
    .select({
      themeId: websiteConfigurations.themeId,
      status: websiteConfigurations.status,
      version: websiteConfigurations.version,
    })
    .from(websiteConfigurations);

  return themeIds.map((themeId) => ({
    themeId,
    draftVersion: rows.find((row) => row.themeId === themeId && row.status === "draft")?.version ?? null,
    publishedVersion: rows.find((row) => row.themeId === themeId && row.status === "published")?.version ?? null,
  }));
}
