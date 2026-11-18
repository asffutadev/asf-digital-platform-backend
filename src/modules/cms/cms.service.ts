import { db } from "../../db/index.js";
import { AppError } from "../../errors/appError.js";
import { recordAudit } from "../../utils/auditLog.js";
import { defaultCopy, defaultSections } from "../../config/websiteDefaults.config.js";
import { defaultThemeId, getWebsiteTheme, websiteThemes } from "../../config/websiteThemes.config.js";
import * as repo from "./cms.repository.js";
import { sectionSchema } from "./cms.validation.js";
import type { SaveDraftInput } from "./cms.validation.js";

function assertTheme(themeId: string) {
  const theme = getWebsiteTheme(themeId);
  if (!theme) throw AppError.badRequest("Unknown website theme", "VALIDATION_ERROR", { theme: ["Invalid theme"] });
  return theme;
}

function toResponseShape(config: any) {
  return {
    id: config.id,
    themeId: config.themeId,
    version: config.version,
    status: config.status,
    copy: config.copy,
    sections: config.sections,
    updatedBy: config.updatedBy,
    publishedAt: config.publishedAt,
  };
}

async function ensureConfig(tx: repo.Executor, status: "draft" | "published", themeId: string, userId?: string) {
  return (await repo.getConfigWithSections(tx, status, themeId))
    ?? repo.createDefaultConfig(tx, status, themeId, userId);
}

export async function getPublished(themeId: string = defaultThemeId) {
  assertTheme(themeId);
  const config = await ensureConfig(db, "published", themeId);
  return toResponseShape(config);
}

export async function getDraft(themeId: string = defaultThemeId) {
  assertTheme(themeId);
  const config = await ensureConfig(db, "draft", themeId);
  return toResponseShape(config);
}

export async function getPublic() {
  const activeThemeId = await repo.getActiveThemeId(db);
  const published = await getPublished(activeThemeId);
  return { ...published, themeId: activeThemeId };
}

export async function listThemes() {
  const activeThemeId = await repo.getActiveThemeId(db);
  const versions = await repo.listThemeVersions(db, websiteThemes.map((theme) => theme.id));
  return {
    activeThemeId,
    themes: websiteThemes.map((theme) => ({
      ...theme,
      supportedSectionTypes: [...theme.supportedSectionTypes],
      ...versions.find((version) => version.themeId === theme.id),
    })),
  };
}

export async function saveDraft(input: SaveDraftInput, userId: string, themeId: string = defaultThemeId) {
  const theme = assertTheme(themeId);
  const sectionErrors = input.sections.flatMap((section, index) => {
    const parsed = sectionSchema.safeParse(section);
    return parsed.success ? [] : [{ index, errors: parsed.error.flatten() }];
  });
  const unsupportedTypes = input.sections
    .map((section, index) => ({ index, type: section.type }))
    .filter(({ type }) => !theme.supportedSectionTypes.includes(type as never));
  const orders = input.sections.map((section) => section.order);
  if (sectionErrors.length || unsupportedTypes.length || new Set(orders).size !== orders.length) {
    throw AppError.badRequest("Invalid website data", "VALIDATION_ERROR", {
      sections: sectionErrors,
      unsupportedTypes,
      order: new Set(orders).size !== orders.length ? ["Section order must be unique"] : undefined,
    });
  }
  return db.transaction(async (tx) => {
    const draft = await ensureConfig(tx, "draft", themeId, userId);
    await repo.updateDraft(tx, draft!.id, input.copy, userId);
    await repo.replaceSections(tx, draft!.id, input.sections, userId);
    return toResponseShape((await repo.getConfigWithSections(tx, "draft", themeId))!);
  });
}

export async function publish(userId: string, themeId: string = defaultThemeId) {
  assertTheme(themeId);
  return db.transaction(async (tx) => {
    const draft = await repo.getConfigWithSections(tx, "draft", themeId);
    if (!draft) throw AppError.notFound("No draft exists yet", "DRAFT_NOT_FOUND");
    const published = await ensureConfig(tx, "published", themeId, userId);
    if (!published) throw AppError.internal("Published configuration could not be initialized", "CMS_INITIALIZATION_FAILED");
    await repo.createHistorySnapshot(tx, {
      themeId,
      version: published.version,
      copy: published.copy,
      sections: published.sections,
      publishedBy: published.publishedBy,
      publishedAt: published.publishedAt ?? new Date(),
    });
    await repo.updatePublished(tx, published.id, draft.copy, userId, published.version + 1);
    await repo.replaceSections(tx, published.id, draft.sections, userId);
    await repo.pruneHistory(tx, themeId);
    await recordAudit({ actorId: userId, action: "website.publish", targetType: "website", targetId: themeId }, tx);
    return toResponseShape((await repo.getConfigWithSections(tx, "published", themeId))!);
  });
}

export async function discardDraft(userId: string, themeId: string = defaultThemeId) {
  assertTheme(themeId);
  return db.transaction(async (tx) => {
    const published = await repo.getConfigWithSections(tx, "published", themeId);
    if (!published) throw AppError.notFound("No published version exists yet", "PUBLISHED_NOT_FOUND");
    const draft = await ensureConfig(tx, "draft", themeId, userId);
    await repo.updateDraft(tx, draft!.id, published.copy, userId);
    await repo.replaceSections(tx, draft!.id, published.sections, userId);
    return toResponseShape((await repo.getConfigWithSections(tx, "draft", themeId))!);
  });
}

export async function factoryReset(userId: string, themeId: string = defaultThemeId) {
  assertTheme(themeId);
  return db.transaction(async (tx) => {
    const draft = await ensureConfig(tx, "draft", themeId, userId);
    await repo.updateDraft(tx, draft!.id, defaultCopy, userId);
    await repo.replaceSections(tx, draft!.id, defaultSections.map((section) => ({ ...section, items: [], configuration: {} })), userId);
    await recordAudit({ actorId: userId, action: "website.reset", targetType: "website", targetId: themeId }, tx);
    return toResponseShape((await repo.getConfigWithSections(tx, "draft", themeId))!);
  });
}

export async function getHistory(themeId: string = defaultThemeId) {
  assertTheme(themeId);
  const rows = await repo.listHistory(db, themeId);
  return rows.map((row) => ({
    id: row.id,
    version: row.version,
    publishedAt: row.publishedAt,
    publishedBy: row.publishedByName ? { name: row.publishedByName } : null,
  }));
}

export async function restore(themeId: string, historyId: string, userId: string) {
  assertTheme(themeId);
  return db.transaction(async (tx) => {
    const snapshot = await repo.findHistory(tx, themeId, historyId);
    if (!snapshot) throw AppError.notFound("Publish history entry not found", "HISTORY_NOT_FOUND");
    const draft = await ensureConfig(tx, "draft", themeId, userId);
    await repo.updateDraft(tx, draft!.id, snapshot.copy, userId);
    await repo.replaceSections(tx, draft!.id, snapshot.sections as any[], userId);
    await recordAudit({ actorId: userId, action: "website.restore", targetType: "website", targetId: themeId, metadata: { historyId } }, tx);
    return toResponseShape((await repo.getConfigWithSections(tx, "draft", themeId))!);
  });
}

export async function activateTheme(themeId: string, userId: string) {
  assertTheme(themeId);
  return db.transaction(async (tx) => {
    const published = await repo.getConfigWithSections(tx, "published", themeId);
    if (!published) throw AppError.conflict("Theme has not been published", "THEME_NOT_PUBLISHED");
    await repo.setActiveThemeId(tx, themeId);
    await recordAudit({ actorId: userId, action: "website.activate", targetType: "website", targetId: themeId }, tx);
    return { activeThemeId: themeId };
  });
}
