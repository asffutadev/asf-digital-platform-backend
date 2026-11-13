import { z } from "zod";
import { appConfig } from "../../config/app.config.js";

const utcDateTime = z.string().datetime({ offset: false });

export const programTypeSchema = z.enum(["Physical", "Online"]);
export const eventStatusSchema = z.enum(["Draft", "Published", "Cancelled"]);
export const archiveFilterSchema = z.enum(["exclude", "include", "only"]);

export const createEventSchema = z
  .object({
    title: z.string().trim().min(2, "Title is too short").max(255),
    startTime: utcDateTime,
    location: z.string().trim().min(1, "Location is required").max(255),
    description: z.string().trim().min(1, "Description is required").max(2000),
    guestMinister: z.string().trim().max(255).optional(),
    programType: programTypeSchema,
    imageAssetId: z.string().uuid("Image asset ID must be a UUID").optional(),
  })
  .strict();

export type CreateEventInput = z.infer<typeof createEventSchema>;

export const updateEventSchema = createEventSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, "At least one field is required")
  .strict();
export type UpdateEventInput = z.infer<typeof updateEventSchema>;

export const eventIdSchema = z.string().uuid("Event ID must be a UUID");

const optionalQueryString = z.string().trim().min(1);
const pageSchema = z.coerce.number().int().min(1).default(1);
const limitSchema = z.coerce.number().int().min(1).max(appConfig.pagination.maxPageSize).default(appConfig.pagination.defaultPageSize);

export const listEventsSchema = z
  .object({
    filter: z.enum(["upcoming", "past"]).optional(),
    programType: programTypeSchema.optional(),
    status: eventStatusSchema.optional(),
    search: optionalQueryString.optional(),
    archived: archiveFilterSchema.default("exclude"),
    page: pageSchema,
    limit: limitSchema,
  })
  .strict();

export type ListEventsInput = z.infer<typeof listEventsSchema>;
