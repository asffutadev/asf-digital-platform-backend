import { pgTable, uuid, varchar, text, boolean, timestamp, index, check, jsonb } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users.js";
import { mediaAssets } from "./mediaAssets.js";

export interface AnnouncementAudience {
  gender: ("Male" | "Female")[];
  subgroups: string[];
  levels: string[];
}

export const announcements = pgTable(
  "announcements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: varchar("title", { length: 255 }).notNull(),
    message: text("message").notNull(),
    priority: varchar("priority", { length: 20 }).notNull().default("Normal"),
    isUrgent: boolean("is_urgent").notNull().default(false),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    category: varchar("category", { length: 30 }).notNull().default("General"),
    imageAssetId: uuid("image_asset_id").references(() => mediaAssets.id, { onDelete: "set null" }),
    attachmentAssetIds: jsonb("attachment_asset_ids").$type<string[]>().notNull().default([]),
    publishAt: timestamp("publish_at", { withTimezone: true }),
    audience: jsonb("audience").$type<AnnouncementAudience>().notNull().default({ gender: [], subgroups: [], levels: [] }),
    status: varchar("status", { length: 30 }).notNull().default("Draft"),
    revisionNotes: text("revision_notes"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "restrict" }),
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "restrict" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    publishedBy: uuid("published_by").references(() => users.id, { onDelete: "restrict" }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_announcements_created_at").on(table.createdAt),
    index("idx_announcements_status").on(table.status),
    index("idx_announcements_category").on(table.category),
    index("idx_announcements_publish_at").on(table.publishAt),
    index("idx_announcements_audience").using("gin", table.audience),
    check(
      "chk_announcements_status",
      sql`${table.status} IN ('Draft', 'Scheduled', 'Pending Review', 'Revision Requested', 'Approved', 'Published', 'Archived')`
    ),
    check("chk_announcements_priority", sql`${table.priority} IN ('Normal', 'Urgent')`),
    check(
      "chk_announcements_category",
      sql`${table.category} IN ('General', 'Prayer', 'Event', 'Academic', 'Urgent', 'Other')`
    ),
  ]
);