import { desc } from "drizzle-orm";
import { db } from "../../db/index.js";
import { academicSessions } from "../../db/schema/index.js";

// Read-only. Session ids look like "2027/2028", so newest-first by id is newest-first by year.
export async function listSessions() {
  return db.select().from(academicSessions).orderBy(desc(academicSessions.id));
}