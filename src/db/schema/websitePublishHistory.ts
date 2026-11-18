import { jsonb, pgTable, timestamp, uuid, varchar, integer, index } from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const websitePublishHistory = pgTable(
  "website_publish_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    themeId: varchar("theme_id", { length: 60 }).notNull(),
    version: integer("version").notNull(),
    copy: jsonb("copy").notNull(),
    sections: jsonb("sections").notNull(),
    publishedBy: uuid("published_by").references(() => users.id, { onDelete: "restrict" }),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("idx_website_publish_history_theme").on(table.themeId, table.publishedAt)]
);
