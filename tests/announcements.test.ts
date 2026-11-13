import { describe, it, expect, afterAll, vi } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { db } from "../src/db/index.js";
import { mediaAssets } from "../src/db/schema/index.js";
import { logResponse } from "./helpers/logResponse.js";
import { registerWithOffice, removeOfficesOf } from "./helpers/officeUser.js";

vi.setConfig({ testTimeout: 300_000 });

const officeUserIds: string[] = [];
afterAll(async () => { await removeOfficesOf(officeUserIds); }, 120_000);

describe("Announcements", () => {
  let adminCookie: string; // the Publicity Coordinator
  let memberCookie: string;
  let normalAnnouncementId: string;
  let revisionAnnouncementId: string;
  let imageAssetId: string;

  it("setup: a Publicity Coordinator + a plain member", async () => {
    const publicity = await registerWithOffice("ann-publicity", "publicity-coordinator");
    const member = await registerWithOffice("ann-member");
    officeUserIds.push(publicity.id);
    adminCookie = publicity.cookie;
    memberCookie = member.cookie;
    const [asset] = await db
      .insert(mediaAssets)
      .values({
        provider: "test",
        publicId: `announcement-test-${Date.now()}`,
        secureUrl: "https://cdn.example.com/announcement-test.jpg",
        resourceType: "image",
        format: "jpg",
        originalFilename: "announcement-test.jpg",
        mimeType: "image/jpeg",
        bytes: 10,
        createdBy: publicity.id,
      })
      .returning({ id: mediaAssets.id });
    imageAssetId = asset.id;
    logResponse("Announcements", "setup (office holder created)", 201, { publicity: publicity.id });
  });
  
  it("Member is BLOCKED from creating an announcement (no permission)", async () => {
    const res = await request(app).post("/api/announcements").set("Cookie", memberCookie).send({
      title: "Should Fail", message: "Should not be created", priority: "Normal",
    });
    logResponse("Announcements", "Member -> POST /api/announcements (should be blocked)", res.status, res.body);
    expect(res.status).toBe(403);
  });

  it("Member CAN view the announcements list", async () => {
    const res = await request(app).get("/api/announcements").set("Cookie", memberCookie);
    logResponse("Announcements", "Member -> GET /api/announcements", res.status, res.body);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toMatchObject({ page: 1, limit: 20 });
  });

  it("Admin creates a normal announcement (starts as Draft)", async () => {
    const res = await request(app).post("/api/announcements").set("Cookie", adminCookie).send({
      title: "Vitest Prayer Meeting",
      message: "Join us Thursday",
      category: "Prayer",
      priority: "Normal",
      imageAssetId,
      attachmentAssetIds: [imageAssetId],
      audience: { gender: [], subgroups: [], levels: [] },
    });
    logResponse("Announcements", "Admin -> POST /api/announcements (normal)", res.status, res.body);
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe("Draft");
    expect(res.body.data.category).toBe("Prayer");
    expect(res.body.data.imageUrl).toBe("https://cdn.example.com/announcement-test.jpg");
    expect(res.body.data.attachmentAssetIds).toEqual([imageAssetId]);
    normalAnnouncementId = res.body.data.id;
  });

  it("Admin submits it for review", async () => {
    const res = await request(app).patch(`/api/announcements/${normalAnnouncementId}/submit-review`).set("Cookie", adminCookie);
    logResponse("Announcements", "Admin -> submit-review", res.status, res.body);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("Pending Review");
  });

  it("Admin approves it", async () => {
    const res = await request(app).patch(`/api/announcements/${normalAnnouncementId}/approve`).set("Cookie", adminCookie);
    logResponse("Announcements", "Admin -> approve", res.status, res.body);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("Approved");
  });

  it("Admin publishes it", async () => {
    const res = await request(app).patch(`/api/announcements/${normalAnnouncementId}/publish`).set("Cookie", adminCookie);
    logResponse("Announcements", "Admin -> publish", res.status, res.body);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("Published");
  });

  it("Admin archives it", async () => {
    const res = await request(app).patch(`/api/announcements/${normalAnnouncementId}/archive`).set("Cookie", adminCookie);
    logResponse("Announcements", "Admin -> archive", res.status, res.body);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("Archived");
  });

  it("Archiving a second time is rejected", async () => {
    const res = await request(app).patch(`/api/announcements/${normalAnnouncementId}/archive`).set("Cookie", adminCookie);
    logResponse("Announcements", "Admin -> double archive (should fail)", res.status, res.body);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("INVALID_STATUS");
  });

  it("Revision branch: create, submit, request revision", async () => {
    const create = await request(app).post("/api/announcements").set("Cookie", adminCookie).send({
      title: "Vitest Prayer Meeting 2", message: "Join us Thursday", priority: "Normal",
    });
    logResponse("Announcements", "Admin -> create (revision branch)", create.status, create.body);
    expect(create.status).toBe(201);
    revisionAnnouncementId = create.body.data.id;

    const submit = await request(app).patch(`/api/announcements/${revisionAnnouncementId}/submit-review`).set("Cookie", adminCookie);
    logResponse("Announcements", "Admin -> submit-review (revision branch)", submit.status, submit.body);
    expect(submit.status).toBe(200);

    const revise = await request(app).patch(`/api/announcements/${revisionAnnouncementId}/request-revision`).set("Cookie", adminCookie).send({
      notes: "Please add the venue",
    });
    logResponse("Announcements", "Admin -> request-revision", revise.status, revise.body);
    expect(revise.status).toBe(200);
    expect(revise.body.data.status).toBe("Revision Requested");
  });

  it("Requesting revision with no notes is rejected", async () => {
    const create = await request(app).post("/api/announcements").set("Cookie", adminCookie).send({
      title: "Vitest No Notes Test", message: "Should get revision-blocked", priority: "Normal",
    });
    expect(create.status).toBe(201);
    const id = create.body.data.id;
    await request(app).patch(`/api/announcements/${id}/submit-review`).set("Cookie", adminCookie);

    const res = await request(app).patch(`/api/announcements/${id}/request-revision`).set("Cookie", adminCookie).send({});
    logResponse("Announcements", "Admin -> request-revision with no notes (should fail)", res.status, res.body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("Editing after revision request moves it back to Draft", async () => {
    const res = await request(app).put(`/api/announcements/${revisionAnnouncementId}`).set("Cookie", adminCookie).send({
      message: "Join us Thursday at the main hall",
    });
    logResponse("Announcements", "Admin -> edit after revision", res.status, res.body);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("Draft");
    expect(res.body.data.message).toBe("Join us Thursday at the main hall");
  });

  it("isUrgent fast-track skips straight to Published", async () => {
    const res = await request(app).post("/api/announcements").set("Cookie", adminCookie).send({
      title: "Vitest Service starting now", message: "Come quickly!", priority: "Urgent", isUrgent: true,
    });
    logResponse("Announcements", "Admin -> create with isUrgent (fast-track)", res.status, res.body);
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe("Published");
  });

  it("supports direct publish, audience targeting and effective scheduled publication", async () => {
    const direct = await request(app).post("/api/announcements").set("Cookie", adminCookie).send({
      title: "Vitest Direct Publish",
      message: "Visible to members immediately.",
      category: "General",
    });
    expect(direct.status).toBe(201);
    const directPublish = await request(app).patch(`/api/announcements/${direct.body.data.id}/publish`).set("Cookie", adminCookie);
    expect(directPublish.status).toBe(200);
    expect(directPublish.body.data.status).toBe("Published");

    const targeted = await request(app).post("/api/announcements").set("Cookie", adminCookie).send({
      title: "Vitest Female Only",
      message: "This should not match the male test member.",
      category: "Urgent",
      isUrgent: true,
      audience: { gender: ["Female"], subgroups: [], levels: [] },
    });
    expect(targeted.status).toBe(201);
    const memberTarget = await request(app).get(`/api/announcements/${targeted.body.data.id}`).set("Cookie", memberCookie);
    expect(memberTarget.status).toBe(404);
    const publicityTarget = await request(app).get(`/api/announcements/${targeted.body.data.id}`).set("Cookie", adminCookie);
    expect(publicityTarget.status).toBe(200);

    const scheduled = await request(app).post("/api/announcements").set("Cookie", adminCookie).send({
      title: "Vitest Effective Schedule",
      message: "This scheduled item is already due.",
    });
    expect(scheduled.status).toBe(201);
    const schedule = await request(app)
      .patch(`/api/announcements/${scheduled.body.data.id}/schedule`)
      .set("Cookie", adminCookie)
      .send({ publishAt: new Date(Date.now() - 60_000).toISOString() });
    expect(schedule.status).toBe(200);
    expect(schedule.body.data.status).toBe("Published");

    const memberList = await request(app).get("/api/announcements?search=Effective%20Schedule").set("Cookie", memberCookie);
    expect(memberList.status).toBe(200);
    expect(memberList.body.data[0].status).toBe("Published");
  });

  it("allows deleting only Draft announcements", async () => {
    const draft = await request(app).post("/api/announcements").set("Cookie", adminCookie).send({
      title: "Vitest Draft Delete",
      message: "This draft can be deleted.",
    });
    expect(draft.status).toBe(201);
    const deleted = await request(app).delete(`/api/announcements/${draft.body.data.id}`).set("Cookie", adminCookie);
    expect(deleted.status).toBe(200);

    const published = await request(app).post("/api/announcements").set("Cookie", adminCookie).send({
      title: "Vitest Published Delete",
      message: "This published item cannot be deleted.",
      isUrgent: true,
    });
    expect(published.status).toBe(201);
    const refused = await request(app).delete(`/api/announcements/${published.body.data.id}`).set("Cookie", adminCookie);
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe("ONLY_DRAFT_DELETABLE");
  });

  it("Creating with a title that's too short is rejected", async () => {
    const res = await request(app).post("/api/announcements").set("Cookie", adminCookie).send({
      title: "A", message: "Valid enough message", priority: "Normal",
    });
    logResponse("Announcements", "Admin -> create with short title (should fail)", res.status, res.body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("Unauthenticated request to list is blocked", async () => {
    const res = await request(app).get("/api/announcements");
    logResponse("Announcements", "No cookie -> GET /api/announcements", res.status, res.body);
    expect(res.status).toBe(401);
  });
});