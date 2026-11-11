import { describe, it, expect, afterAll, vi } from "vitest";
import request from "supertest";
import path from "path";
import { app } from "../src/app.js";
import { logResponse } from "./helpers/logResponse.js";
import { registerWithOffice, removeOfficesOf } from "./helpers/officeUser.js";

vi.setConfig({ testTimeout: 300_000 });

const SAMPLE_IMAGE = path.resolve("tests/fixtures/sample-image.jpg");
const officeUserIds: string[] = [];
afterAll(async () => { await removeOfficesOf(officeUserIds); }, 120_000);

describe("Media", () => {
  let adminCookie: string; // the Publicity Coordinator
  let memberCookie: string;
  let uploadedAssetId: string;

  it("setup: a Publicity Coordinator + a plain member", async () => {
    const publicity = await registerWithOffice("media-publicity", "publicity-coordinator");
    const member = await registerWithOffice("media-member");
    officeUserIds.push(publicity.id);
    adminCookie = publicity.cookie;
    memberCookie = member.cookie;
  });

  it("GET /api/media/placements (public, no auth)", async () => {
    const res = await request(app).get("/api/media/placements");
    logResponse("Media", "GET /api/media/placements (public)", res.status, res.body);
    expect(res.status).toBe(200);
  });

  it("Member is BLOCKED from uploading media (no permission)", async () => {
    const res = await request(app)
      .post("/api/media/assets")
      .set("Cookie", memberCookie)
      .attach("file", SAMPLE_IMAGE);
    logResponse("Media", "Member -> upload asset (should be blocked)", res.status, res.body);
    expect(res.status).toBe(403);
  });

  it("Admin CAN upload a real image asset", async () => {
    const res = await request(app)
      .post("/api/media/assets")
      .set("Cookie", adminCookie)
      .attach("file", SAMPLE_IMAGE)
      .field("altText", "Vitest test upload");
    logResponse("Media", "Admin -> upload real image", res.status, res.body);
    expect(res.status).toBe(201);
    uploadedAssetId = res.body.data.id;
  });

  it("Uploading a fake image (text file renamed to .jpg) is rejected by the real magic-byte check", async () => {
    const fakeImageBuffer = Buffer.from("this is not really an image, just plain text");
    const res = await request(app)
      .post("/api/media/assets")
      .set("Cookie", adminCookie)
      .attach("file", fakeImageBuffer, "fake.jpg");
    logResponse("Media", "Admin -> upload fake image (should be rejected)", res.status, res.body);
    expect(res.status).toBe(400);
  });

  it("GET /api/media/assets lists the uploaded asset", async () => {
    const res = await request(app).get("/api/media/assets").set("Cookie", adminCookie);
    logResponse("Media", "GET /api/media/assets", res.status, res.body);
    expect(res.status).toBe(200);
    const found = res.body.data.some((a: any) => a.id === uploadedAssetId);
    expect(found).toBe(true);
  });

  it("Uploading with no file at all is rejected cleanly", async () => {
    const res = await request(app).post("/api/media/assets").set("Cookie", adminCookie);
    logResponse("Media", "Admin -> upload with no file", res.status, res.body);
    expect(res.status).toBe(400);
  });
});