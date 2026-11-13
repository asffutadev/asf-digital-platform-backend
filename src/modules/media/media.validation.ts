import { z } from "zod";
import { appConfig } from "../../config/app.config.js";

export const placementKeySchema = z
  .string()
  .trim()
  .min(3)
  .max(160)
  .regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/, "Invalid media placement key");

const tagsSchema = z.array(z.string().trim().min(1).max(50)).max(30);

export const assignMediaSchema = z.object({
  assetId: z.string().uuid(),
  altText: z.string().trim().max(500).optional(),
});

export const updateMediaSchema = z
  .object({
    altText: z.string().trim().max(500).nullable().optional(),
    category: z.string().trim().min(1).max(50).optional(),
    tags: tagsSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

export const listMediaQuerySchema = z
  .object({
    keys: z.string().optional(),
    search: z.string().trim().min(1).optional(),
    category: z.string().trim().min(1).max(50).optional(),
    tag: z.string().trim().min(1).max(50).optional(),
    type: z.enum(["image", "video", "document"]).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(appConfig.pagination.maxPageSize).default(appConfig.pagination.defaultPageSize),
  })
  .strict();

export const uploadMediaMetadataSchema = z.object({
  altText: z.string().trim().max(500).optional(),
  category: z.string().trim().min(1).max(50).default("General"),
  tags: tagsSchema.default([]),
});

export const mediaAssetIdSchema = z.string().uuid("Media asset ID must be a UUID");
