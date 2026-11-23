import { z } from "zod";

export const sectionSchema = z.object({
  sectionKey: z.string().optional(),
  id: z.string().optional(),
  type: z.enum([
    "hero","about","schedule","life","visit","cta","text_image","feature_grid","card_grid","quote","callout",
    "event_highlight","announcement_highlight","gallery_preview","scripture_highlight","custom_content"
  ]),
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
}).superRefine((section, ctx) => {
  if (section.type !== "gallery_preview" || section.items === undefined) return;
  const gallerySchema = z.object({
    imageAssetId: z.string().uuid("Image asset ID must be a UUID"),
    caption: z.string().max(200),
    altText: z.string().max(200),
  });
  section.items.forEach((item, index) => {
    const parsed = gallerySchema.safeParse(item);
    if (!parsed.success) {
      ctx.addIssue({
        code: "custom",
        path: ["items", index],
        message: "Invalid gallery preview item",
      });
    }
  });
});

export const saveDraftSchema = z.object({
  copy: z.object({
    mission: z.string().max(1000).optional(),
    vision: z.string().max(1000).optional(),
    values: z.array(z.object({
      title: z.string().max(80),
      description: z.string().max(300),
    })).max(12).optional(),
  }).catchall(z.any()).optional().default({}),
  sections: z.array(sectionSchema),
});
export type SaveDraftInput = z.infer<typeof saveDraftSchema>;

export const themeQuerySchema = z.enum(["classic-auditoria", "picture-dominant", "editorial"]).optional();
export const restoreSchema = z.object({
  historyId: z.string().uuid("History ID must be a UUID"),
});
export const activateSchema = z.object({
  themeId: z.enum(["classic-auditoria", "picture-dominant", "editorial"]),
  confirm: z.literal(true, { error: "Confirmation is required" }),
});