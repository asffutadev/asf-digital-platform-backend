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
      upcomingPrograms: expect.any(Array),
      recentAuditLogs: expect.any(Array),
      announcementsAwaitingAction: {
        "Pending Review": expect.any(Number),
        "Revision Requested": expect.any(Number),
      },
      mediaByResourceType: {
        image: expect.any(Number),
        video: expect.any(Number),
        raw: expect.any(Number),
      },
    }));
    expect(Object.values(response.body.data.announcements).every((value) => typeof value === "number")).toBe(true);
    expect(Object.values(response.body.data.programs).every((value) => typeof value === "number")).toBe(true);
    expect(Object.values(response.body.data.bibleStudies).every((value) => typeof value === "number")).toBe(true);
    expect(response.body.data.upcomingPrograms.length).toBeLessThanOrEqual(5);
    expect(response.body.data.upcomingPrograms.every((program: { id: string; title: string; startTime: string }) =>
      Boolean(program.id && program.title && program.startTime)
    )).toBe(true);
    expect(response.body.data.upcomingPrograms.map((program: { startTime: string }) => Date.parse(program.startTime)))
      .toEqual([...response.body.data.upcomingPrograms]
        .map((program: { startTime: string }) => Date.parse(program.startTime))
        .sort((a: number, b: number) => a - b));
    expect(response.body.data.recentAuditLogs.length).toBeLessThanOrEqual(10);
    expect(response.body.data.recentAuditLogs.every((entry: {
      action: string;
      targetType: string;
      targetId: string;
      createdAt: string;
      actorName: string;
    }) => Boolean(entry.action && entry.targetType && entry.targetId && entry.createdAt && entry.actorName))).toBe(true);
    expect(response.body.data.announcementsAwaitingAction).toEqual({
      "Pending Review": response.body.data.announcements["Pending Review"] ?? 0,
      "Revision Requested": response.body.data.announcements["Revision Requested"] ?? 0,
    });
    const mediaCounts = response.body.data.mediaByResourceType;
    expect(mediaCounts.image + mediaCounts.video + mediaCounts.raw).toBeLessThanOrEqual(response.body.data.mediaAssets.total);
  });
});
