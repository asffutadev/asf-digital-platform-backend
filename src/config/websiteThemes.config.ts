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
  id: `theme-${1 | 2 | 3 | 4}`;
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
    id: "theme-1",
    name: "Theme 1",
    description: "Predefined website theme 1.",
    supportedSectionTypes: allSectionTypes,
  },
  {
    id: "theme-2",
    name: "Theme 2",
    description: "Predefined website theme 2.",
    supportedSectionTypes: allSectionTypes,
  },
  {
    id: "theme-3",
    name: "Theme 3",
    description: "Predefined website theme 3.",
    supportedSectionTypes: allSectionTypes,
  },
  {
    id: "theme-4",
    name: "Theme 4",
    description: "Predefined website theme 4.",
    supportedSectionTypes: allSectionTypes,
  },
];

export const defaultThemeId = "theme-1" as const;

export function getWebsiteTheme(themeId: string) {
  return websiteThemes.find((theme) => theme.id === themeId);
}
