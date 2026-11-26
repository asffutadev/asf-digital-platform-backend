import { z } from "zod";
import { appConfig } from "../../config/app.config.js";
import { canonicalSubgroups } from "../../config/subgroups.config.js";
import type { AnnouncementAudience } from "../../db/schema/announcements.js";

const categories = ["General", "Prayer", "Event", "Academic", "Urgent", "Other"] as const;
const statuses = ["Draft", "Scheduled", "Pending Review", "Approved", "Revision Requested", "Published", "Archived"] as const;
const academicLevels = ["100 Level", "200 Level", "300 Level", "400 Level", "500 Level", "Postgraduate", "Alumni"] as const;
const utcDateTime = z.string().datetime({ offset: false });

export const audienceSchema: z.ZodType<AnnouncementAudience> = z
  .object({
    gender: z.array(z.enum(["Male", "Female"])).default([]),
    subgroups: z.array(z.enum(canonicalSubgroups)).default([]),
    levels: z.array(z.enum(academicLevels)).default([]),
  })
  .strict()
  .transform((value) => ({
    gender: [...new Set(value.gender)],
    subgroups: [...new Set(value.subgroups)],
    levels: [...new Set(value.levels)],
  }));

const announcementFields = {
  title: z.string().trim().min(2, "Title is too short").max(255),
  message: z.string().trim().min(2, "Message is too short").max(2000),
  category: z.enum(categories).default("General"),
  priority: z.enum(["Normal", "Urgent"]).default("Normal"),
  isUrgent: z.boolean().default(false),
  isPublic: z.boolean().default(false),
  expiresAt: utcDateTime.optional(),
  publishAt: utcDateTime.optional(),
  imageAssetId: z.string().uuid("Image asset ID must be a UUID").optional(),
  attachmentAssetIds: z.array(z.string().uuid("Attachment asset ID must be a UUID")).max(50).default([]),
  audience: audienceSchema.default({ gender: [], subgroups: [], levels: [] }),
};

export const createAnnouncementSchema = z.object(announcementFields).strict();
export type CreateAnnouncementInput = z.infer<typeof createAnnouncementSchema>;

export const editAnnouncementSchema = z
  .object(announcementFields)
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");
export type EditAnnouncementInput = z.infer<typeof editAnnouncementSchema>;

export const revisionRequestSchema = z
  .object({ notes: z.string().trim().min(2, "Revision notes are required").max(1000) })
  .strict();
export type RevisionRequestInput = z.infer<typeof revisionRequestSchema>;

export const scheduleAnnouncementSchema = z
  .object({ publishAt: utcDateTime })
  .strict();

export const announcementIdSchema = z.string().uuid("Announcement ID must be a UUID");

export const listAnnouncementsSchema = z
  .object({
    search: z.string().trim().min(1).optional(),
    category: z.enum(categories).optional(),
    status: z.enum(statuses).optional(),
    audience: z.enum(["all", "restricted", "unrestricted"]).default("all"),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(appConfig.pagination.maxPageSize).default(appConfig.pagination.defaultPageSize),
  })
  .strict();

export type ListAnnouncementsInput = z.infer<typeof listAnnouncementsSchema>;
