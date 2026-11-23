export type WebsiteSectionType =
  | "hero"
  | "about"
  | "schedule"
  | "life"
  | "visit"
  | "cta"
  | "text_image"
  | "feature_grid"
  | "card_grid"
  | "quote"
  | "callout"
  | "event_highlight"
  | "announcement_highlight"
  | "gallery_preview"
  | "scripture_highlight"
  | "custom_content";

export type WebsiteTheme = {
  id: "classic-auditoria" | "picture-dominant" | "editorial";
  name: string;
  description: string;
  supportedSectionTypes: readonly WebsiteSectionType[];
};

const allSectionTypes: readonly WebsiteSectionType[] = [
  "hero",
  "about",
  "schedule",
  "life",
  "visit",
  "cta",
  "text_image",
  "feature_grid",
  "card_grid",
  "quote",
  "callout",
  "event_highlight",
  "announcement_highlight",
  "gallery_preview",
  "scripture_highlight",
  "custom_content",
];

export const websiteThemes: readonly WebsiteTheme[] = [
  {
    id: "classic-auditoria",
    name: "Classic Auditoria",
    description: "Classic, balanced fellowship website.",
    supportedSectionTypes: allSectionTypes,
  },
  {
    id: "picture-dominant",
    name: "Picture-Dominant",
    description: "Image-led fellowship website.",
    supportedSectionTypes: allSectionTypes,
  },
  {
    id: "editorial",
    name: "Editorial",
    description: "Story-led editorial fellowship website.",
    supportedSectionTypes: allSectionTypes,
  },
];

export const defaultThemeId = "classic-auditoria" as const;

export function getWebsiteTheme(themeId: string) {
  return websiteThemes.find((theme) => theme.id === themeId);
}
