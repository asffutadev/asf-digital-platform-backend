import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { registerWithOffice, removeOfficesOf } from "./helpers/officeUser.js";

const userIds: string[] = [];

afterAll(async () => {
  await removeOfficesOf(userIds);
}, 120_000);

describe("Publicity summary", () => {
  it("allows only the Publicity office and returns database counts", async () => {
    const publicity = await registerWithOffice("summary-publicity", "publicity-coordinator");
    const member = await registerWithOffice("summary-member");
    userIds.push(publicity.id, member.id);

    const denied = await request(app)
      .get("/api/publicity/summary")
      .set("Cookie", member.cookie);
    expect(denied.status).toBe(403);

    const response = await request(app)
      .get("/api/publicity/summary")
      .set("Cookie", publicity.cookie);
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual(expect.objectContaining({
      announcements: expect.any(Object),
      programs: expect.any(Object),
      bibleStudies: expect.any(Object),
      mediaAssets: { total: expect.any(Number) },
    }));
    expect(Object.values(response.body.data.announcements).every((value) => typeof value === "number")).toBe(true);
    expect(Object.values(response.body.data.programs).every((value) => typeof value === "number")).toBe(true);
    expect(Object.values(response.body.data.bibleStudies).every((value) => typeof value === "number")).toBe(true);
  });
});
