import { describe, it, expect, afterAll, vi } from "vitest";
import request from "supertest";
import path from "path";
import { app } from "../src/app.js";
import { logResponse } from "./helpers/logResponse.js";
import { registerWithOffice, removeOfficesOf } from "./helpers/officeUser.js";

vi.setConfig({ testTimeout: 300_000 });

const SAMPLE_PDF = path.resolve("tests/fixtures/sample-bible-study.pdf");
const officeUserIds: string[] = [];
afterAll(async () => { await removeOfficesOf(officeUserIds); }, 120_000);

describe("Bible Study", () => {
  let adminCookie: string; // the Publicity Coordinator
  let memberCookie: string;

  it("setup: a Publicity Coordinator + a plain member", async () => {
    const publicity = await registerWithOffice("bs-publicity", "publicity-coordinator");
    const member = await registerWithOffice("bs-member");
    officeUserIds.push(publicity.id);
    adminCookie = publicity.cookie;
    memberCookie = member.cookie;
  });

  it("GET /api/bible-study (member view, published only)", async () => {
    const res = await request(app).get("/api/bible-study").set("Cookie", memberCookie);
    logResponse("Bible Study", "Member -> GET /api/bible-study", res.status, res.body);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it("GET /api/bible-study/current returns 200 or 404, never a crash", async () => {
    const res = await request(app).get("/api/bible-study/current").set("Cookie", memberCookie);
    logResponse("Bible Study", "GET /api/bible-study/current", res.status, res.body);
    expect([200, 404]).toContain(res.status);
  });

  it("Member is BLOCKED from uploading an outline PDF (no permission)", async () => {
    const res = await request(app)
      .post("/api/bible-study/upload-outline")
      .set("Cookie", memberCookie)
      .attach("file", SAMPLE_PDF);
    logResponse("Bible Study", "Member -> upload outline (should be blocked)", res.status, res.body);
    expect(res.status).toBe(403);
  });

  it("Admin CAN upload a real PDF outline and gets extracted studies back", async () => {
    const res = await request(app)
      .post("/api/bible-study/upload-outline")
      .set("Cookie", adminCookie)
      .attach("file", SAMPLE_PDF);
    logResponse("Bible Study", "Admin -> upload real PDF outline", res.status, res.body);
    expect(res.status).toBe(200);
    const studies = res.body.data.studies;
    expect(res.body.data.studiesFound).toBe(5);
    expect(studies).toHaveLength(5);
    expect(studies.map(({ extracted }) => extracted.studyGuide.length)).toEqual([4, 3, 3, 3, 3]);
    expect(studies.map(({ extracted }) => extracted.aims.length)).toEqual([3, 3, 2, 3, 3]);
    expect(studies.map(({ extracted }) => extracted.studyHeading)).toEqual([
      "1ST SUNDAY AFTER TRINITY, JUNE 7 2026",
      "2ND SUNDAY AFTER TRINITY, JUNE 14 2026",
      "3RD SUNDAY AFTER TRINITY, JUNE 21 2026",
      "4TH SUNDAY AFTER TRINITY, JUNE 28 2026",
      "5TH SUNDAY AFTER TRINITY, JULY 5 2026",
    ]);
    expect(studies.map(({ extracted }) => extracted.foodForThought !== null)).toEqual([true, true, false, false, true]);
    expect(studies.map(({ extracted }) => extracted.memoryVerseRef)).toEqual([
      "Matthew 13:8",
      "James 5:8",
      "John 15:2",
      "Jeremiah 17:8",
      "John 15:16",
    ]);
    expect(studies.map(({ extracted }) => extracted.memoryVerseText)).toEqual([
      "But the seed that fell on good soil produced a harvest, some yielding a hundred, some sixty, some thirty times what was sown.",
      "You too, be patient and strengthen your hearts, for the coming of the Lord draws near.",
      "Every branch that bears no fruit He removes, and every branch that bears fruit He trims clean so it may bear even more.",
      "He shall be like a tree planted by the waters, spreading out its roots, unafraid when the heat comes, for its leaves stay green.",
      "You did not choose Me, but I chose you and appointed you to go and bear fruit, fruit that will remain.",
    ]);
    for (const { extracted } of studies) {
      expect(extracted.memoryVerseText).not.toMatch(/---|TO LEARN:/i);
    }
    expect(studies[2].extracted.scriptureReferences).toEqual(
      expect.arrayContaining([expect.objectContaining({ raw: "Xzq 9:3", recognized: false })]),
    );
  });

  it("Uploading a non-PDF file is rejected", async () => {
    const fakeFile = Buffer.from("not a real pdf");
    const res = await request(app)
      .post("/api/bible-study/upload-outline")
      .set("Cookie", adminCookie)
      .attach("file", fakeFile, "fake.pdf");
    logResponse("Bible Study", "Admin -> upload fake PDF", res.status, res.body);
    expect(res.status).toBe(400);
  });

  it("Uploading with no file at all is rejected cleanly", async () => {
    const res = await request(app).post("/api/bible-study/upload-outline").set("Cookie", adminCookie);
    logResponse("Bible Study", "Admin -> upload with no file", res.status, res.body);
    expect(res.status).toBe(400);
  });

  it("Requesting a study by a fake/nonexistent ID returns 404, not a crash", async () => {
    const res = await request(app).get("/api/bible-study/00000000-0000-0000-0000-000000000000").set("Cookie", memberCookie);
    logResponse("Bible Study", "GET fake study ID", res.status, res.body);
    expect([404, 400]).toContain(res.status);
  });
});