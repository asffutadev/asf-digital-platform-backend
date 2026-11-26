import { afterAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { app } from "../src/app.js";
import { db } from "../src/db/index.js";
import { announcements, events } from "../src/db/schema/index.js";
import { registerWithOffice, removeOfficesOf } from "./helpers/officeUser.js";

vi.setConfig({ testTimeout: 300_000 });

const exactKeys = (value: object, keys: string[]) =>
  expect(Object.keys(value).sort()).toEqual([...keys].sort());

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

  it("returns exact public shapes and includes due scheduled announcements", async () => {
    const [active] = await db.insert(events).values({
      title: "Public Program",
      category: "Prayer",
      description: "Public description",
      location: "FUTA",
      startTime: new Date(Date.now() + 86400000),
      speaker: "Guest Minister",
      mode: "In-Person",
      status: "Active",
      createdBy: publicity.id,
    }).returning();
    eventIds.push(active.id);
    const [online] = await db.insert(events).values({
      title: "Online Public Program",
      category: "Outreach",
      startTime: new Date(Date.now() + 172800000),
      mode: "Online / Zoom",
      status: "Active",
      createdBy: publicity.id,
    }).returning();
    eventIds.push(online.id);
    const [hybrid] = await db.insert(events).values({
      title: "Hybrid Public Program",
      category: "Special Program",
      startTime: new Date(Date.now() + 259200000),
      mode: "Hybrid",
      status: "Active",
      createdBy: publicity.id,
    }).returning();
    eventIds.push(hybrid.id);
    const qualifyingRows = await db.insert(events).values(
      Array.from({ length: 25 }, (_, index) => ({
        title: `Pagination qualifying program ${index + 1}`,
        category: "Worship",
        startTime: new Date(Date.now() + (4 + index) * 86400000),
        mode: "In-Person" as const,
        status: "Active" as const,
        createdBy: publicity.id,
      })),
    ).returning({ id: events.id });
    eventIds.push(...qualifyingRows.map((row) => row.id));
    const [draft] = await db.insert(events).values({
      title: "Draft Program",
      startTime: new Date(Date.now() + 86400000),
      status: "Draft",
      createdBy: publicity.id,
    }).returning();
    eventIds.push(draft.id);
    const [cancelled] = await db.insert(events).values({
      title: "Cancelled Past Program",
      startTime: new Date(Date.now() - 86400000),
      status: "Cancelled",
      createdBy: publicity.id,
    }).returning();
    eventIds.push(cancelled.id);
    const [pastActive] = await db.insert(events).values({
      title: "Past Published Program",
      startTime: new Date(Date.now() - 172800000),
      status: "Active",
      createdBy: publicity.id,
    }).returning();
    eventIds.push(pastActive.id);

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
    const [dueScheduled] = await db.insert(announcements).values({
      title: "Due scheduled notice",
      message: "Now visible",
      status: "Scheduled",
      isPublic: true,
      publishAt: new Date(Date.now() - 60000),
      audience: { gender: [], subgroups: [], levels: [] },
      createdBy: publicity.id,
    }).returning();
    announcementIds.push(dueScheduled.id);
    const [futureScheduled] = await db.insert(announcements).values({
      title: "Future scheduled notice",
      message: "Hidden",
      status: "Scheduled",
      isPublic: true,
      publishAt: new Date(Date.now() + 86400000),
      audience: { gender: [], subgroups: [], levels: [] },
      createdBy: publicity.id,
    }).returning();
    announcementIds.push(futureScheduled.id);
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
    const [expired] = await db.insert(announcements).values({
      title: "Expired notice",
      message: "Hidden",
      status: "Published",
      isPublic: true,
      expiresAt: new Date(Date.now() - 86400000),
      audience: { gender: [], subgroups: [], levels: [] },
      createdBy: publicity.id,
    }).returning();
    announcementIds.push(expired.id);

    const upcoming = await request(app).get("/api/public/programs?when=upcoming&limit=50");
    const upcomingLimit20 = await request(app).get("/api/public/programs?when=upcoming&limit=20");
    const past = await request(app).get("/api/public/programs?when=past&limit=50");
    const announcementRows = await request(app).get("/api/public/announcements?limit=50");

    console.log("PUBLIC_UPCOMING_RAW=" + JSON.stringify(upcoming.body));
    console.log("PUBLIC_UPCOMING_DATA_LENGTH=" + upcoming.body.data.length);
    console.log("PUBLIC_UPCOMING_META_TOTAL=" + upcoming.body.meta.total);
    console.log("PUBLIC_LIMIT20_RAW=" + JSON.stringify(upcomingLimit20.body));
    console.log("PUBLIC_LIMIT20_DATA_LENGTH=" + upcomingLimit20.body.data.length);
    console.log("PUBLIC_LIMIT20_META_TOTAL=" + upcomingLimit20.body.meta.total);
    console.log("PUBLIC_PAST_RAW=" + JSON.stringify(past.body));
    console.log("PUBLIC_PAST_DATA_LENGTH=" + past.body.data.length);
    console.log("PUBLIC_PAST_META_TOTAL=" + past.body.meta.total);
    console.log("PUBLIC_ANNOUNCEMENTS_RAW=" + JSON.stringify(announcementRows.body));
    console.log("PUBLIC_ANNOUNCEMENTS_DATA_LENGTH=" + announcementRows.body.data.length);
    console.log("PUBLIC_ANNOUNCEMENTS_META_TOTAL=" + announcementRows.body.meta.total);

    expect(upcoming.status).toBe(200);
    expect(past.status).toBe(200);
    expect(announcementRows.status).toBe(200);
    expect(upcoming.body.data.length).toBeLessThanOrEqual(50);
    expect(past.body.data.length).toBeLessThanOrEqual(50);
    expect(announcementRows.body.data.length).toBeLessThanOrEqual(50);

    const activeRow = upcoming.body.data.find((row: any) => row.id === active.id);
    expect(activeRow).toBeDefined();
    exactKeys(activeRow, ["id", "title", "startTime", "location", "description", "guestMinister", "programType", "imageUrl", "status"]);
    expect(activeRow.status).toBe("Published");
    expect(activeRow.programType).toBe("Physical");
    const onlineRow = upcoming.body.data.find((row: any) => row.id === online.id);
    const hybridRow = upcoming.body.data.find((row: any) => row.id === hybrid.id);
    expect(onlineRow.programType).toBe("Online");
    expect(hybridRow.programType).toBe("Physical");
    console.log("PUBLIC_PROGRAM_TYPE_MODE_JSON=" + JSON.stringify({
      inPerson: activeRow,
      online: onlineRow,
      hybrid: hybridRow,
    }));
    expect(upcomingLimit20.status).toBe(200);
    expect(upcomingLimit20.body.data.length).toBe(20);
    expect(upcomingLimit20.body.meta.total).toBeGreaterThanOrEqual(25);
    expect(upcoming.body.data.some((row: any) => row.id === draft.id)).toBe(false);
    expect(upcoming.body.data.some((row: any) => row.id === cancelled.id)).toBe(false);
    expect(past.body.data.find((row: any) => row.id === pastActive.id)).toBeDefined();
    expect(past.body.data.find((row: any) => row.id === cancelled.id)).toBeDefined();

    for (const row of [...upcoming.body.data, ...past.body.data]) {
      exactKeys(row, ["id", "title", "startTime", "location", "description", "guestMinister", "programType", "imageUrl", "status"]);
    }

    const cancelledDetail = await request(app).get(`/api/public/programs/${cancelled.id}`);
    expect(cancelledDetail.status).toBe(200);
    exactKeys(cancelledDetail.body.data, ["id", "title", "startTime", "location", "description", "guestMinister", "programType", "imageUrl", "status"]);
    expect(cancelledDetail.body.data.status).toBe("Cancelled");

    const publicRow = announcementRows.body.data.find((row: any) => row.id === publicAnnouncement.id);
    const dueRow = announcementRows.body.data.find((row: any) => row.id === dueScheduled.id);
    expect(publicRow).toBeDefined();
    expect(dueRow).toBeDefined();
    for (const row of announcementRows.body.data) {
      exactKeys(row, ["id", "title", "message", "category", "priority", "expiresAt", "publishedAt", "imageUrl"]);
    }
    expect(announcementRows.body.data.some((row: any) => row.id === futureScheduled.id)).toBe(false);
    expect(announcementRows.body.data.some((row: any) => row.id === targeted.id)).toBe(false);
    expect(announcementRows.body.data.some((row: any) => row.id === notPublic.id)).toBe(false);
    expect(announcementRows.body.data.some((row: any) => row.id === expired.id)).toBe(false);

    expect((await request(app).get(`/api/public/announcements/${futureScheduled.id}`)).status).toBe(404);
    expect((await request(app).get(`/api/public/announcements/${expired.id}`)).status).toBe(404);
    expect((await request(app).get(`/api/public/announcements/${dueScheduled.id}`)).status).toBe(200);
  });

  it("caps list limit at 50", async () => {
    const res = await request(app).get("/api/public/programs?limit=51");
    expect(res.status).toBe(400);
  });
});
