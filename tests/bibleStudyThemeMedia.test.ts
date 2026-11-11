import { describe, it, expect, afterAll, vi } from "vitest";
import request from "supertest";
import path from "path";
import { app } from "../src/app.js";
import { logResponse } from "./helpers/logResponse.js";
import { db } from "../src/db/index.js";
import { mediaPlacements } from "../src/db/schema/index.js";
import { eq } from "drizzle-orm";

import { registerWithOffice, removeOfficesOf } from "./helpers/officeUser.js";

vi.setConfig({ testTimeout: 300_000 });

const officeUserIds: string[] = [];
afterAll(async () => { await removeOfficesOf(officeUserIds); }, 120_000);

const SAMPLE_IMAGE = path.resolve("tests/fixtures/sample-image.jpg");
const PLACEMENT_KEY = "public.bible-study.theme";

describe("Bible Study theme media placement", () => {
  let adminCookie: string;
  let memberCookie: string;
  let uploadedAssetId: string;

    it("setup: a Publicity Coordinator + a plain member", async () => {
    await db.update(mediaPlacements).set({ currentAssetId: null }).where(eq(mediaPlacements.key, PLACEMENT_KEY));
    const publicity = await registerWithOffice("theme-publicity", "publicity-coordinator");
    const member = await registerWithOffice("theme-member");
    officeUserIds.push(publicity.id);
    adminCookie = publicity.cookie;
    memberCookie = member.cookie;
  });

  it("GET the placement before any image is assigned: 200, asset is null", async () => {
    const res = await request(app).get(`/api/media/placements/${PLACEMENT_KEY}`);
    logResponse("Bible Study Theme Media", "GET placement (before upload)", res.status, res.body);
    expect(res.status).toBe(200);
    expect(res.body.data.key).toBe(PLACEMENT_KEY);
    expect(res.body.data.asset).toBeNull();
  });

  it("Admin uploads a real image asset", async () => {
    const res = await request(app)
      .post("/api/media/assets")
      .set("Cookie", adminCookie)
      .attach("file", SAMPLE_IMAGE)
      .field("altText", "Vitest Bible Study theme test image");
    logResponse("Bible Study Theme Media", "Admin -> upload image", res.status, res.body);
    expect(res.status).toBe(201);
    uploadedAssetId = res.body.data.id;
  });

  it("Member is BLOCKED from assigning an asset to the placement (no permission)", async () => {
    const res = await request(app)
      .put(`/api/media/placements/${PLACEMENT_KEY}`)
      .set("Cookie", memberCookie)
      .send({ assetId: uploadedAssetId });
    logResponse("Bible Study Theme Media", "Member -> assign asset (should be blocked)", res.status, res.body);
    expect(res.status).toBe(403);
  });

  it("Admin assigns the uploaded asset to the Bible Study theme placement", async () => {
    const res = await request(app)
      .put(`/api/media/placements/${PLACEMENT_KEY}`)
      .set("Cookie", adminCookie)
      .send({ assetId: uploadedAssetId });
    logResponse("Bible Study Theme Media", "Admin -> assign asset to placement", res.status, res.body);
    expect(res.status).toBe(200);
    expect(res.body.data.key).toBe(PLACEMENT_KEY);
    expect(res.body.data.asset.id).toBe(uploadedAssetId);
  });

  it("GET the placement after assignment: the real asset is now returned", async () => {
    const res = await request(app).get(`/api/media/placements/${PLACEMENT_KEY}`);
    logResponse("Bible Study Theme Media", "GET placement (after upload)", res.status, res.body);
    expect(res.status).toBe(200);
    expect(res.body.data.asset).not.toBeNull();
    expect(res.body.data.asset.id).toBe(uploadedAssetId);
  });

  it("The new placement now appears in the full placements list", async () => {
    const res = await request(app).get("/api/media/placements");
    logResponse("Bible Study Theme Media", "GET all placements (should include new key)", res.status, res.body);
    expect(res.status).toBe(200);
    const found = res.body.data.find((p: any) => p.key === PLACEMENT_KEY);
    expect(found).toBeDefined();
    expect(found.asset.id).toBe(uploadedAssetId);
  });
});