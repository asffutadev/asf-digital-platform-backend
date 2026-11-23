import { AppError } from "../../errors/appError.js";
import * as repo from "./announcements.repository.js";
import type {
  CreateAnnouncementInput,
  EditAnnouncementInput,
  ListAnnouncementsInput,
  RevisionRequestInput,
} from "./announcements.validation.js";

type AnnouncementRow = NonNullable<Awaited<ReturnType<typeof repo.findById>>>;
type Viewer = Parameters<typeof repo.listAnnouncements>[2];

function toAnnouncement(row: AnnouncementRow) {
  const announcement = row.announcement;
  const status =
    announcement.status === "Scheduled" &&
    announcement.publishAt !== null &&
    announcement.publishAt.getTime() <= Date.now()
      ? "Published"
      : announcement.status;
  return {
    id: announcement.id,
    title: announcement.title,
    message: announcement.message,
    category: announcement.category,
    priority: announcement.priority,
    isUrgent: announcement.isUrgent,
    isPublic: announcement.isPublic,
    expiresAt: announcement.expiresAt,
    imageAssetId: announcement.imageAssetId,
    imageUrl: row.imageAssetUrl,
    attachmentAssetIds: announcement.attachmentAssetIds,
    publishAt: announcement.publishAt,
    audience: announcement.audience,
    status,
    revisionNotes: announcement.revisionNotes,
    createdBy: announcement.createdBy,
    approvedBy: announcement.approvedBy,
    approvedAt: announcement.approvedAt,
    publishedBy: announcement.publishedBy,
    publishedAt: announcement.publishedAt,
    archivedAt: announcement.archivedAt,
    createdAt: announcement.createdAt,
    updatedAt: announcement.updatedAt,
  };
}

async function assertAssets(imageAssetId: string | undefined, attachmentAssetIds: string[]) {
  const ids = [imageAssetId, ...attachmentAssetIds].filter((id): id is string => Boolean(id));
  const found = await repo.findAssetIds(ids);
  const missing = ids.find((id) => !found.includes(id));
  if (missing) {
    throw AppError.badRequest("Media asset was not found", "MEDIA_ASSET_NOT_FOUND", {
      mediaAssetIds: ["One or more media assets were not found"],
    });
  }
}

function viewerFromUser(user: NonNullable<Express.Request["user"]>): Viewer {
  return { id: user.id };
}

export async function createAnnouncement(input: CreateAnnouncementInput, createdBy: string) {
  await assertAssets(input.imageAssetId, input.attachmentAssetIds);
  const announcement = await repo.createAnnouncement({
    title: input.title,
    message: input.message,
    category: input.category,
    priority: input.priority,
    isUrgent: input.isUrgent,
    isPublic: input.isPublic,
    expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    publishAt: input.publishAt ? new Date(input.publishAt) : null,
    imageAssetId: input.imageAssetId,
    attachmentAssetIds: input.attachmentAssetIds,
    audience: input.audience,
    status: input.isUrgent ? "Published" : "Draft",
    publishedBy: input.isUrgent ? createdBy : null,
    publishedAt: input.isUrgent ? new Date() : null,
    createdBy,
  });
  return announcement ? toAnnouncement(announcement) : null;
}

export async function getAnnouncements(filters: ListAnnouncementsInput, includeAll: boolean, user: NonNullable<Express.Request["user"]>) {
  const result = await repo.listAnnouncements(filters, includeAll, includeAll ? undefined : viewerFromUser(user));
  return { data: result.rows.map(toAnnouncement), total: result.total };
}

export async function getAnnouncement(id: string, includeAll: boolean, user: NonNullable<Express.Request["user"]>) {
  const row = await repo.findById(id, includeAll ? undefined : viewerFromUser(user), includeAll);
  if (!row) throw AppError.notFound("Announcement not found", "ANNOUNCEMENT_NOT_FOUND");
  const result = toAnnouncement(row);
  if (!includeAll && !["Published"].includes(result.status)) {
    throw AppError.notFound("Announcement not found", "ANNOUNCEMENT_NOT_FOUND");
  }
  return result;
}

export async function submitForReview(id: string) {
  const existing = await repo.findById(id);
  if (!existing) throw AppError.notFound("Announcement not found", "ANNOUNCEMENT_NOT_FOUND");
  if (!["Draft", "Revision Requested"].includes(existing.announcement.status)) {
    throw AppError.conflict("Only editable announcements can be submitted for review", "INVALID_STATUS");
  }
  return toAnnouncement((await repo.updateStatus(id, { status: "Pending Review", revisionNotes: null }))!);
}

export async function approve(id: string, approvedBy: string) {
  const existing = await repo.findById(id);
  if (!existing) throw AppError.notFound("Announcement not found", "ANNOUNCEMENT_NOT_FOUND");
  if (existing.announcement.status !== "Pending Review") {
    throw AppError.conflict("Only announcements pending review can be approved", "INVALID_STATUS");
  }
  return toAnnouncement((await repo.updateStatus(id, { status: "Approved", approvedBy, approvedAt: new Date() }))!);
}

export async function requestRevision(id: string, input: RevisionRequestInput) {
  const existing = await repo.findById(id);
  if (!existing) throw AppError.notFound("Announcement not found", "ANNOUNCEMENT_NOT_FOUND");
  if (existing.announcement.status !== "Pending Review") {
    throw AppError.conflict("Only announcements pending review can be sent for revision", "INVALID_STATUS");
  }
  return toAnnouncement((await repo.updateStatus(id, { status: "Revision Requested", revisionNotes: input.notes }))!);
}

export async function updateAnnouncement(id: string, input: EditAnnouncementInput) {
  const existing = await repo.findById(id);
  if (!existing) throw AppError.notFound("Announcement not found", "ANNOUNCEMENT_NOT_FOUND");
  if (!["Draft", "Revision Requested"].includes(existing.announcement.status)) {
    throw AppError.conflict("Only Draft or Revision Requested announcements can be edited", "INVALID_STATUS");
  }
  await assertAssets(input.imageAssetId, input.attachmentAssetIds ?? []);
  const row = await repo.updateContent(id, {
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.message !== undefined ? { message: input.message } : {}),
    ...(input.category !== undefined ? { category: input.category } : {}),
    ...(input.priority !== undefined ? { priority: input.priority } : {}),
    ...(input.isUrgent !== undefined ? { isUrgent: input.isUrgent } : {}),
    ...(input.isPublic !== undefined ? { isPublic: input.isPublic } : {}),
    ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt ? new Date(input.expiresAt) : null } : {}),
    ...(input.publishAt !== undefined ? { publishAt: input.publishAt ? new Date(input.publishAt) : null } : {}),
    ...(input.imageAssetId !== undefined ? { imageAssetId: input.imageAssetId } : {}),
    ...(input.attachmentAssetIds !== undefined ? { attachmentAssetIds: input.attachmentAssetIds } : {}),
    ...(input.audience !== undefined ? { audience: input.audience } : {}),
  });
  return row ? toAnnouncement(row) : null;
}

export async function publish(id: string, publishedBy: string) {
  const existing = await repo.findById(id);
  if (!existing) throw AppError.notFound("Announcement not found", "ANNOUNCEMENT_NOT_FOUND");
  if (!["Draft", "Approved"].includes(existing.announcement.status)) {
    throw AppError.conflict("Only Draft or Approved announcements can be published", "INVALID_STATUS");
  }
  return toAnnouncement((await repo.updateStatus(id, {
    status: "Published",
    publishedBy,
    publishedAt: new Date(),
    publishAt: null,
  }))!);
}

export async function schedule(id: string, publishAt: string) {
  const existing = await repo.findById(id);
  if (!existing) throw AppError.notFound("Announcement not found", "ANNOUNCEMENT_NOT_FOUND");
  if (existing.announcement.status !== "Draft") {
    throw AppError.conflict("Only Draft announcements can be scheduled", "INVALID_STATUS");
  }
  return toAnnouncement((await repo.updateStatus(id, { status: "Scheduled", publishAt: new Date(publishAt) }))!);
}

export async function archive(id: string) {
  const existing = await repo.findById(id);
  if (!existing) throw AppError.notFound("Announcement not found", "ANNOUNCEMENT_NOT_FOUND");
  if (!["Published", "Scheduled"].includes(existing.announcement.status)) {
    throw AppError.conflict("Only published announcements can be archived", "INVALID_STATUS");
  }
  return toAnnouncement((await repo.updateStatus(id, { status: "Archived", archivedAt: new Date() }))!);
}

export async function deleteAnnouncement(id: string) {
  const existing = await repo.findById(id);
  if (!existing) throw AppError.notFound("Announcement not found", "ANNOUNCEMENT_NOT_FOUND");
  if (existing.announcement.status !== "Draft") {
    throw AppError.conflict("Only Draft announcements can be deleted", "ONLY_DRAFT_DELETABLE");
  }
  await repo.deleteAnnouncement(id);
}
