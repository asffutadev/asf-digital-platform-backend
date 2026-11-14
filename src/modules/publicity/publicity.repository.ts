import { count, desc } from "drizzle-orm";
import { db } from "../../db/index.js";
import { announcements, bibleStudies, events, mediaAssets } from "../../db/schema/index.js";

function toStatusCounts(rows: { status: string; count: number }[]) {
  return Object.fromEntries(rows.map((row) => [row.status, Number(row.count)]));
}

export async function getSummary() {
  const [announcementRows, programRows, bibleStudyRows, mediaRows] = await Promise.all([
    db.select({ status: announcements.status, count: count() })
      .from(announcements).groupBy(announcements.status).orderBy(desc(announcements.status)),
    db.select({ status: events.status, count: count() })
      .from(events).groupBy(events.status).orderBy(desc(events.status)),
    db.select({ status: bibleStudies.publicationStatus, count: count() })
      .from(bibleStudies).groupBy(bibleStudies.publicationStatus).orderBy(desc(bibleStudies.publicationStatus)),
    db.select({ count: count() }).from(mediaAssets),
  ]);
  const announcementStatuses = toStatusCounts(announcementRows);
  const programStatuses = toStatusCounts(programRows);
  const bibleStudyStatuses = toStatusCounts(bibleStudyRows);

  return {
    announcements: announcementStatuses,
    programs: {
      ...programStatuses,
      Published: programStatuses.Active ?? 0,
    },
    bibleStudies: bibleStudyStatuses,
    mediaAssets: { total: Number(mediaRows[0]?.count ?? 0) },
  };
}
