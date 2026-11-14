import { describe, it, expect, afterAll, vi } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { db } from "../src/db/index.js";
import { mediaAssets, userRoles } from "../src/db/schema/index.js";
import { registerWithOffice, removeOfficesOf } from "./helpers/officeUser.js";

vi.setConfig({ testTimeout: 300_000 });

const officeUserIds: string[] = [];
afterAll(async () => {
  await removeOfficesOf(officeUserIds);
}, 120_000);

describe("Programs / events", () => {
  let publicityCookie: string;
  let memberCookie: string;
  let presidentCookie: string;
  let technicalCookie: string;
  let imageAssetId: string;
  let draftId: string;
  let publishedId: string;

  it("sets up Publicity, member, President, Technical Administrator and an image asset", async () => {
    const publicity = await registerWithOffice("programs-publicity", "publicity-coordinator");
    const member = await registerWithOffice("programs-member");
    const president = await registerWithOffice("programs-president", "president");
    const technical = await registerWithOffice("programs-technical");
    await db.insert(userRoles).values({ userId: technical.id, roleId: "Technical Administrator" });
    officeUserIds.push(publicity.id, president.id);

    const [asset] = await db
      .insert(mediaAssets)
      .values({
        provider: "test",
        publicId: `program-test-${Date.now()}`,
        secureUrl: "https://cdn.example.com/program-test.jpg",
        resourceType: "image",
        format: "jpg",
        originalFilename: "program-test.jpg",
        mimeType: "image/jpeg",
        bytes: 10,
        createdBy: publicity.id,
      })
      .returning({ id: mediaAssets.id });

    publicityCookie = publicity.cookie;
    memberCookie = member.cookie;
    presidentCookie = president.cookie;
    technicalCookie = technical.cookie;
    imageAssetId = asset.id;
  });

  it("blocks member, President, Technical Administrator and outsider writes", async () => {
    const payload = {
      title: "Blocked Program",
      startTime: "2027-01-10T08:00:00.000Z",
      location: "ASF Hall",
      description: "This should not be created.",
      programType: "Physical",
    };

    for (const cookie of [memberCookie, presidentCookie, technicalCookie]) {
      const response = await request(app).post("/api/events").set("Cookie", cookie).send(payload);
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("OFFICE_REQUIRED");
    }

    const outsider = await request(app).post("/api/events").send(payload);
    expect(outsider.status).toBe(401);
  });

  it("creates a Draft program and resolves imageAssetId to imageUrl", async () => {
    const response = await request(app).post("/api/events").set("Cookie", publicityCookie).send({
      title: "Vitest Youth Retreat",
      startTime: "2027-03-15T08:00:00.000Z",
      location: "ASF Fellowship Hall",
      description: "A test program with a resolved media asset.",
      guestMinister: "Rev. Chika Nwosu",
      programType: "Physical",
      imageAssetId,
    });

    expect(response.status).toBe(201);
    expect(response.body.data.status).toBe("Draft");
    expect(response.body.data.programType).toBe("Physical");
    expect(response.body.data.imageUrl).toBe("https://cdn.example.com/program-test.jpg");
    expect(response.body.data.startTime).toBe("2027-03-15T08:00:00.000Z");
    draftId = response.body.data.id;
  });

  it("rejects removed fields, invalid values and malformed IDs", async () => {
    const removedField = await request(app).post("/api/events").set("Cookie", publicityCookie).send({
      title: "Removed Fields",
      startTime: "2027-03-15T08:00:00.000Z",
      location: "ASF Hall",
      description: "Invalid contract payload.",
      programType: "Physical",
      category: "Prayer",
    });
    expect(removedField.status).toBe(400);
    expect(removedField.body.error.code).toBe("VALIDATION_ERROR");

    const invalidQuery = await request(app).get("/api/events?status=NotAStatus").set("Cookie", memberCookie);
    expect(invalidQuery.status).toBe(400);
    expect(invalidQuery.body.error.code).toBe("VALIDATION_ERROR");
    expect(invalidQuery.body.error.details).toHaveProperty("status");

    const invalidId = await request(app).get("/api/events/not-a-uuid").set("Cookie", memberCookie);
    expect(invalidId.status).toBe(400);
    expect(invalidId.body.error.code).toBe("INVALID_ID_FORMAT");
  });

  it("hides drafts from members but lists them for Publicity with pagination metadata", async () => {
    const memberList = await request(app).get("/api/events?page=1&limit=1").set("Cookie", memberCookie);
    expect(memberList.status).toBe(200);
    expect(memberList.body.meta).toMatchObject({ page: 1, limit: 1 });
    expect(memberList.body.data.some((program: { id: string }) => program.id === draftId)).toBe(false);

    const publicityList = await request(app).get("/api/events?status=Draft").set("Cookie", publicityCookie);
    expect(publicityList.status).toBe(200);
    expect(publicityList.body.data.some((program: { id: string }) => program.id === draftId)).toBe(true);

    const memberDetail = await request(app).get(`/api/events/${draftId}`).set("Cookie", memberCookie);
    expect(memberDetail.status).toBe(404);
    expect(memberDetail.body.error.code).toBe("EVENT_NOT_FOUND");
  });

  it("updates a Draft with the Program contract", async () => {
    const response = await request(app).put(`/api/events/${draftId}`).set("Cookie", publicityCookie).send({
      description: "Updated program description.",
      programType: "Online",
      location: "Zoom",
    });
    expect(response.status).toBe(200);
    expect(response.body.data.description).toBe("Updated program description.");
    expect(response.body.data.programType).toBe("Online");
  });

  it("supports upcoming, past, program type, search and archive filters", async () => {
    const past = await request(app).post("/api/events").set("Cookie", publicityCookie).send({
      title: "Archived Past Program",
      startTime: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString(),
      location: "ASF Hall",
      description: "An old program for archive filtering.",
      programType: "Physical",
    });
    expect(past.status).toBe(201);

    const upcoming = await request(app).get("/api/events?filter=upcoming&programType=Online&search=Youth").set("Cookie", publicityCookie);
    expect(upcoming.status).toBe(200);
    expect(upcoming.body.data.some((program: { id: string }) => program.id === draftId)).toBe(true);

    const archived = await request(app).get("/api/events?archived=only").set("Cookie", publicityCookie);
    expect(archived.status).toBe(200);
    expect(archived.body.data.some((program: { title: string }) => program.title === "Archived Past Program")).toBe(true);
    expect(archived.body.data.every((program: { archived: boolean }) => program.archived)).toBe(true);
  });

  it("publishes the Draft and exposes it to members as Published", async () => {
    const response = await request(app).patch(`/api/events/${draftId}/publish`).set("Cookie", publicityCookie);
    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("Published");
    publishedId = draftId;

    const memberDetail = await request(app).get(`/api/events/${publishedId}`).set("Cookie", memberCookie);
    expect(memberDetail.status).toBe(200);
    expect(memberDetail.body.data.status).toBe("Published");
  });

  it("allows edits to a published program but still rejects deletion", async () => {
    const edit = await request(app).put(`/api/events/${publishedId}`).set("Cookie", publicityCookie).send({
      description: "Updated after publishing.",
    });
    expect(edit.status).toBe(200);
    expect(edit.body.data.description).toBe("Updated after publishing.");

    const remove = await request(app).delete(`/api/events/${publishedId}`).set("Cookie", publicityCookie);
    expect(remove.status).toBe(409);
    expect(remove.body.error.code).toBe("ONLY_DRAFT_DELETABLE");
  });

  it("cancels the published program and rejects a second cancellation", async () => {
    const cancel = await request(app).patch(`/api/events/${publishedId}/cancel`).set("Cookie", publicityCookie);
    expect(cancel.status).toBe(200);
    expect(cancel.body.data.status).toBe("Cancelled");

    const again = await request(app).patch(`/api/events/${publishedId}/cancel`).set("Cookie", publicityCookie);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("ALREADY_CANCELLED");

    const edit = await request(app).put(`/api/events/${publishedId}`).set("Cookie", publicityCookie).send({
      description: "Cancelled programs remain locked.",
    });
    expect(edit.status).toBe(409);
    expect(edit.body.error.code).toBe("CANCELLED_NOT_EDITABLE");

    const memberList = await request(app).get("/api/events?status=Cancelled").set("Cookie", memberCookie);
    expect(memberList.status).toBe(200);
    expect(memberList.body.data.some((program: { id: string }) => program.id === publishedId)).toBe(true);
  });

  it("deletes a Draft program only", async () => {
    const draft = await request(app).post("/api/events").set("Cookie", publicityCookie).send({
      title: "Draft To Delete",
      startTime: "2027-06-01T08:00:00.000Z",
      location: "ASF Hall",
      description: "This draft should be deletable.",
      programType: "Physical",
    });
    expect(draft.status).toBe(201);

    const remove = await request(app).delete(`/api/events/${draft.body.data.id}`).set("Cookie", publicityCookie);
    expect(remove.status).toBe(200);
    expect(remove.body.data).toBeNull();
  });

  it("keeps featured output published and never cancelled", async () => {
    const featured = await request(app).get("/api/events/featured").set("Cookie", memberCookie);
    expect(featured.status).toBe(200);
    expect(featured.body.data.status).toBe("Published");
  });
});
