import { afterAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { app } from "../src/app.js";
import { db } from "../src/db/index.js";
import { announcements, events } from "../src/db/schema/index.js";
import { registerWithOffice, removeOfficesOf } from "./helpers/officeUser.js";

vi.setConfig({ testTimeout: 300_000 });

describe("Public programs and announcements", () => {
  let publicity: Awaited<ReturnType<typeof registerWithOffice>>;
  const eventIds: string[] = [];
  const announcementIds: string[] = [];

  it("setup", async () => {
    publicity = await registerWithOffice("public-endpoints", "publicity-coordinator");
  });

  afterAll(async () => {
    for (const id of announcementIds) await db.delete(announcements).where(eq(announcements.id, id));
    for (const id of eventIds) await db.delete(events).where(eq(events.id, id));
    if (publicity?.id) await removeOfficesOf([publicity.id]);
  });

  it("returns only public programs and public unrestricted announcements", async () => {
    const [active] = await db.insert(events).values({
      title: "Public Program",
      category: "Worship",
      description: "Public description",
      location: "FUTA",
      startTime: new Date(Date.now() + 86400000),
      mode: "In-Person",
      status: "Active",
      createdBy: publicity.id,
    }).returning();
    eventIds.push(active.id);
    const [draft] = await db.insert(events).values({
      title: "Draft Program",
      startTime: new Date(Date.now() + 86400000),
      status: "Draft",
      createdBy: publicity.id,
    }).returning();
    eventIds.push(draft.id);

    const [publicAnnouncement] = await db.insert(announcements).values({
      title: "Public notice",
      message: "Visible",
      status: "Published",
      isPublic: true,
      audience: { gender: [], subgroups: [], levels: [] },
      attachmentAssetIds: ["00000000-0000-0000-0000-000000000001"],
      createdBy: publicity.id,
    }).returning();
    announcementIds.push(publicAnnouncement.id);
    const [targeted] = await db.insert(announcements).values({
      title: "Targeted notice",
      message: "Hidden",
      status: "Published",
      isPublic: true,
      audience: { gender: ["Female"], subgroups: [], levels: [] },
      createdBy: publicity.id,
    }).returning();
    announcementIds.push(targeted.id);
    const [notPublic] = await db.insert(announcements).values({
      title: "Internal notice",
      message: "Hidden",
      status: "Published",
      isPublic: false,
      audience: { gender: [], subgroups: [], levels: [] },
      createdBy: publicity.id,
    }).returning();
    announcementIds.push(notPublic.id);

    const programs = await request(app).get("/api/public/programs");
    expect(programs.status).toBe(200);
    expect(programs.headers["cache-control"]).toBe("public, max-age=60");
    expect(programs.body.data.some((row: any) => row.id === active.id)).toBe(true);
    expect(programs.body.data.some((row: any) => row.id === draft.id)).toBe(false);
    expect(programs.body.meta.limit).toBeGreaterThan(0);
    expect((await request(app).get(`/api/public/programs/${draft.id}`)).status).toBe(404);

    const announcementsRes = await request(app).get("/api/public/announcements");
    expect(announcementsRes.status).toBe(200);
    expect(announcementsRes.headers["cache-control"]).toBe("public, max-age=60");
    expect(announcementsRes.body.data.some((row: any) => row.id === publicAnnouncement.id)).toBe(true);
    expect(announcementsRes.body.data.some((row: any) => row.id === targeted.id)).toBe(false);
    expect(announcementsRes.body.data.some((row: any) => row.id === notPublic.id)).toBe(false);
    const publicRow = announcementsRes.body.data.find((row: any) => row.id === publicAnnouncement.id);
    expect(publicRow).not.toHaveProperty("attachmentAssetIds");
    expect(publicRow).not.toHaveProperty("createdBy");
    expect(publicRow).not.toHaveProperty("approvedBy");
    expect(publicRow).not.toHaveProperty("publishedBy");
  });

  it("caps list limit at 50", async () => {
    const res = await request(app).get("/api/public/programs?limit=51");
    expect(res.status).toBe(400);
  });
});
