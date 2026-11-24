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
  if (!theme) throw AppError.badRequest("Unknown website theme", "VALIDATION_ERROR", { themeId: ["Invalid theme"] });
  return theme;
}

function toResponseShape(config: any) {
  return {
    id: config.id,
    version: config.version,
    status: config.status,
    copy: config.copy,
    sections: config.sections,
    updatedBy: config.updatedBy,
    publishedAt: config.publishedAt,
  };
}

async function ensureConfig(tx: repo.Executor, status: "draft" | "published", userId?: string) {
  const existing = await repo.getConfigWithSections(tx, status);
  if (existing) return existing;

  const created = await repo.createDefaultConfig(tx, status, userId);
  if (!created) {
    throw AppError.internal(
      `Unable to create ${status} website configuration`,
      "CMS_CONFIG_CREATE_FAILED",
    );
  }
  return created;
}

export async function getPublished() {
  const config = await ensureConfig(db, "published");
  return toResponseShape(config);
}

export async function getDraft() {
  const config = await ensureConfig(db, "draft");
  return toResponseShape(config);
}

export async function getPublic() {
  const activeThemeId = await repo.getActiveThemeId(db);
  assertTheme(activeThemeId);
  const published = await getPublished();
  return { ...published, themeId: activeThemeId };
}

export async function listThemes() {
  const activeThemeId = await repo.getActiveThemeId(db);
  return {
    activeThemeId,
    themes: websiteThemes.map((theme) => ({
      id: theme.id,
      name: theme.name,
      description: theme.description,
      supportedSectionTypes: [...theme.supportedSectionTypes],
    })),
  };
}

export async function saveDraft(input: SaveDraftInput, userId: string) {
  const sectionErrors = input.sections.flatMap((section, index) => {
    const parsed = sectionSchema.safeParse(section);
    return parsed.success ? [] : [{ index, errors: parsed.error.flatten() }];
  });
  const orders = input.sections.map((section) => section.order);
  if (sectionErrors.length || new Set(orders).size !== orders.length) {
    throw AppError.badRequest("Invalid website data", "VALIDATION_ERROR", {
      sections: sectionErrors,
      order: new Set(orders).size !== orders.length ? ["Section order must be unique"] : undefined,
    });
  }
  return db.transaction(async (tx) => {
    const draft = await ensureConfig(tx, "draft", userId);
    await repo.updateDraft(tx, draft!.id, input.copy, userId);
    await repo.replaceSections(tx, draft!.id, input.sections, userId);
    return toResponseShape((await repo.getConfigWithSections(tx, "draft"))!);
  });
}

export async function publish(userId: string) {
  return db.transaction(async (tx) => {
    const draft = await repo.getConfigWithSections(tx, "draft");
    if (!draft) throw AppError.notFound("No draft exists yet", "DRAFT_NOT_FOUND");
    const published = await ensureConfig(tx, "published", userId);
    const activeThemeId = await repo.getActiveThemeId(tx);
    await repo.createHistorySnapshot(tx, {
      themeId: activeThemeId,
      version: published.version,
      copy: published.copy,
      sections: published.sections,
      publishedBy: published.publishedBy,
      publishedAt: published.publishedAt ?? new Date(),
    });
    await repo.updatePublished(tx, published.id, draft.copy, userId, published.version + 1);
    await repo.replaceSections(tx, published.id, draft.sections, userId);
    await repo.pruneHistory(tx);
    await recordAudit({ actorId: userId, action: "website.publish", targetType: "website", targetId: "shared" }, tx);
    return toResponseShape((await repo.getConfigWithSections(tx, "published"))!);
  });
}

export async function discardDraft(userId: string) {
  return db.transaction(async (tx) => {
    const published = await repo.getConfigWithSections(tx, "published");
    if (!published) throw AppError.notFound("No published version exists yet", "PUBLISHED_NOT_FOUND");
    const draft = await ensureConfig(tx, "draft", userId);
    await repo.updateDraft(tx, draft!.id, published.copy, userId);
    await repo.replaceSections(tx, draft!.id, published.sections, userId);
    return toResponseShape((await repo.getConfigWithSections(tx, "draft"))!);
  });
}

export async function factoryReset(userId: string) {
  return db.transaction(async (tx) => {
    const draft = await ensureConfig(tx, "draft", userId);
    await repo.updateDraft(tx, draft!.id, defaultCopy, userId);
    await repo.replaceSections(tx, draft!.id, defaultSections.map((section) => ({ ...section, items: [], configuration: {} })), userId);
    await recordAudit({ actorId: userId, action: "website.reset", targetType: "website", targetId: "shared" }, tx);
    return toResponseShape((await repo.getConfigWithSections(tx, "draft"))!);
  });
}

export async function getHistory() {
  const rows = await repo.listHistory(db);
  return rows.map((row) => ({
    id: row.id,
    version: row.version,
    publishedAt: row.publishedAt,
    publishedBy: row.publishedByName ? { name: row.publishedByName } : null,
  }));
}

export async function restore(historyId: string, userId: string) {
  return db.transaction(async (tx) => {
    const snapshot = await repo.findHistory(tx, historyId);
    if (!snapshot) throw AppError.notFound("Publish history entry not found", "HISTORY_NOT_FOUND");
    const draft = await ensureConfig(tx, "draft", userId);
    await repo.updateDraft(tx, draft!.id, snapshot.copy, userId);
    await repo.replaceSections(tx, draft!.id, snapshot.sections as any[], userId);
    await recordAudit({ actorId: userId, action: "website.restore", targetType: "website", targetId: "shared", metadata: { historyId } }, tx);
    return toResponseShape((await repo.getConfigWithSections(tx, "draft"))!);
  });
}

export async function activateTheme(themeId: string, userId: string) {
  assertTheme(themeId);
  return db.transaction(async (tx) => {
    const published = await repo.getConfigWithSections(tx, "published");
    if (!published) throw AppError.conflict("Shared content has not been published", "CONTENT_NOT_PUBLISHED");
    await repo.setActiveThemeId(tx, themeId);
    await recordAudit({ actorId: userId, action: "website.activate", targetType: "website", targetId: themeId }, tx);
    return { activeThemeId: themeId };
  });
}
