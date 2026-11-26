import { integer, pgTable, varchar } from "drizzle-orm/pg-core";

export const websiteSettings = pgTable("website_settings", {
  id: integer("id").primaryKey().default(1),
  activeThemeId: varchar("active_theme_id", { length: 60 }).notNull().default("classic-auditoria"),
});
