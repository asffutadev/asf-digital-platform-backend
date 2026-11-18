import { z } from "zod";

export const sectionSchema = z.object({
  sectionKey: z.string().optional(),
  id: z.string().optional(),
  type: z.string(),
  title: z.string(),
  subtitle: z.string().optional(),
  description: z.string().optional(),
  imageUrl: z.string().optional(),
  imageAssetId: z.string().uuid("Image asset ID must be a UUID").optional(),
  items: z.array(z.any()).optional(),
  configuration: z.record(z.string(), z.any()).optional(),
  isCore: z.boolean().optional(),
  order: z.number().int(),
  isVisible: z.boolean().optional(),
});

export const saveDraftSchema = z.object({
  copy: z.record(z.string(), z.any()),
  sections: z.array(sectionSchema),
});
export type SaveDraftInput = z.infer<typeof saveDraftSchema>;

export const themeQuerySchema = z.string().regex(/^theme-[1-4]$/);
export const restoreSchema = z.object({
  theme: themeQuerySchema,
  historyId: z.string().uuid("History ID must be a UUID"),
});
export const activateSchema = z.object({
  theme: themeQuerySchema,
  confirm: z.literal(true, { error: "Confirmation is required" }),
});