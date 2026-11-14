import { randomUUID } from "node:crypto";
import path from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { db } from "../src/db/index.js";
import { mediaPlacements } from "../src/db/schema/index.js";
import { registerWithOffice, removeOfficesOf } from "./helpers/officeUser.js";

vi.setConfig({ testTimeout: 300_000 });

const SAMPLE_PDF = path.resolve("tests/fixtures/sample-bible-study.pdf");
const userIds: string[] = [];

afterAll(async () => {
  await removeOfficesOf(userIds);
}, 120_000);

describe("Task C coverage", () => {
  let publicityCookie: string;
  let memberCookie: string;
  let assetId: string;

  it("sets up a Publicity user and member", async () => {
    const publicity = await registerWithOffice("task-c-publicity", "publicity-coordinator");
    const member = await registerWithOffice("task-c-member");
    userIds.push(publicity.id, member.id);
    publicityCookie = publicity.cookie;
    memberCookie = member.cookie;
  });

  it("covers raw PDF media, PATCH, GET, filters, and pagination", async () => {
    const upload = await request(app)
      .post("/api/media/assets")
      .set("Cookie", publicityCookie)
      .attach("file", SAMPLE_PDF)
      .field("category", "Task C")
      .field("tags", JSON.stringify(["task-c", "pdf"]));
    expect(upload.status).toBe(201);
    assetId = upload.body.data.id;
    expect(upload.body.data.resourceType).toBe("raw");
    expect(upload.body.data.mimeType).toBe("application/pdf");

    const fetched = await request(app)
      .get(`/api/media/assets/${assetId}`)
      .set("Cookie", publicityCookie);
    expect(fetched.status).toBe(200);
    expect(fetched.body.data.id).toBe(assetId);

    const patched = await request(app)
      .patch(`/api/media/assets/${assetId}`)
      .set("Cookie", publicityCookie)
      .send({ altText: "Updated PDF", tags: ["task-c", "updated"] });
    expect(patched.status).toBe(200);
    expect(patched.body.data.altText).toBe("Updated PDF");
    expect(patched.body.data.tags).toEqual(["task-c", "updated"]);

    const listed = await request(app)
      .get("/api/media/assets?type=document&category=Task%20C&tag=updated&page=1&limit=1")
      .set("Cookie", publicityCookie);
    expect(listed.status).toBe(200);
    expect(listed.body.data.some((asset: { id: string }) => asset.id === assetId)).toBe(true);
    expect(listed.body.meta).toMatchObject({ page: 1, limit: 1 });
    expect(typeof listed.body.meta.total).toBe("number");
  });

  it("reports MEDIA_ASSET_IN_USE for every referencing table", async () => {
    const placementKey = `task-c-${randomUUID()}`;
    await db.insert(mediaPlacements).values({
      key: placementKey,
      label: "Task C placement",
      currentAssetId: assetId,
    });

    const event = await request(app)
      .post("/api/events")
      .set("Cookie", publicityCookie)
      .send({
        title: "Task C Event",
        startTime: "2030-01-01T10:00:00.000Z",
        location: "Task C Hall",
        description: "Task C event reference",
        programType: "Physical",
        imageAssetId: assetId,
      });
    expect(event.status).toBe(201);

    const announcement = await request(app)
      .post("/api/announcements")
      .set("Cookie", publicityCookie)
      .send({
        title: "Task C Announcement",
        message: "Task C announcement reference",
        imageAssetId: assetId,
        attachmentAssetIds: [assetId],
      });
    expect(announcement.status).toBe(201);

    const cms = await request(app)
      .post("/api/content/website/draft")
      .set("Cookie", publicityCookie)
      .send({
        copy: { taskCAsset: assetId },
        sections: [{
          sectionKey: "task-c",
          type: "custom_content",
          title: "Task C",
          imageUrl: assetId,
          items: [{ assetId }],
          configuration: { assetId },
          order: 1,
        }],
      });
    expect(cms.status).toBe(200);

    const study = await request(app)
      .post("/api/bible-study")
      .set("Cookie", publicityCookie)
      .send({
        lessonNumber: 9001,
        title: "Task C Bible Study",
        studyHeading: "TASK C",
        topic: "Task C topic",
        theme: "Task C theme",
        studyDate: "2030-01-02",
        textRef: "John 3:16",
        scriptureReferences: [],
        memoryVerseRef: "John 3:16",
        memoryVerseText: "For God so loved the world.",
        aim: "To verify media references.",
        aims: ["To verify media references."],
        introduction: "Task C introduction.",
        studyGuide: [],
        discussionQuestions: [],
        conclusion: "Task C conclusion.",
        prayerPoints: [],
        foodForThought: "Task C thought.",
        outlineAssetId: assetId,
      });
    expect(study.status).toBe(201);

    const removed = await request(app)
      .delete(`/api/media/assets/${assetId}`)
      .set("Cookie", publicityCookie);
    expect(removed.status).toBe(409);
    expect(removed.body.error.code).toBe("MEDIA_ASSET_IN_USE");
    expect(removed.body.error.details.references).toEqual(expect.arrayContaining([
      "media_placements",
      "events",
      "announcements.image_asset_id",
      "announcements.attachment_asset_ids",
      "website_configurations.copy",
      "website_sections.image_url",
      "website_sections.json",
      "bible_studies",
    ]));
  });

  it("covers Bible Study lifecycle, pagination, status access, scripture references, and outlineAssetId", async () => {
    const createLesson = async (lessonNumber: number) => request(app)
      .post("/api/bible-study")
      .set("Cookie", publicityCookie)
      .send({
        lessonNumber,
        title: `Task C lifecycle ${lessonNumber}`,
        topic: "Task C topic",
        theme: "Task C theme",
        studyDate: "2030-02-01",
        textRef: "John 3:16",
        scriptureReferences: [{
          raw: "John 3:16",
          bookId: null,
          bookName: "John",
          chapter: 3,
          verseStart: 16,
          verseEnd: null,
          recognized: false,
        }],
        memoryVerseRef: "John 3:16",
        memoryVerseText: "For God so loved the world.",
        aim: "To verify lifecycle behavior.",
        aims: ["To verify lifecycle behavior."],
        introduction: "Task C introduction.",
        studyGuide: [],
        discussionQuestions: [],
        conclusion: "Task C conclusion.",
        prayerPoints: [],
        outlineAssetId: assetId,
      });

    const draft = await createLesson(9101);
    const published = await createLesson(9102);
    const archived = await createLesson(9103);
    expect(draft.status).toBe(201);
    expect(published.status).toBe(201);
    expect(archived.status).toBe(201);

    const publishedId = published.body.data.id;
    const archivedId = archived.body.data.id;
    expect((await request(app).patch(`/api/bible-study/${publishedId}/publish`).set("Cookie", publicityCookie)).status).toBe(200);
    expect((await request(app).patch(`/api/bible-study/${publishedId}/unpublish`).set("Cookie", publicityCookie)).status).toBe(200);
    expect((await request(app).patch(`/api/bible-study/${archivedId}/archive`).set("Cookie", publicityCookie)).status).toBe(200);

    const memberDraftFilter = await request(app)
      .get("/api/bible-study?status=draft")
      .set("Cookie", memberCookie);
    expect(memberDraftFilter.status).toBe(403);

    const adminDrafts = await request(app)
      .get("/api/bible-study?status=draft&page=1&limit=1")
      .set("Cookie", publicityCookie);
    expect(adminDrafts.status).toBe(200);
    expect(adminDrafts.body.meta).toMatchObject({ page: 1, limit: 1 });
    expect(typeof adminDrafts.body.meta.total).toBe("number");
    expect(adminDrafts.body.data).toHaveLength(1);

    const saved = await request(app)
      .get(`/api/bible-study/${draft.body.data.id}`)
      .set("Cookie", publicityCookie);
    expect(saved.status).toBe(200);
    expect(saved.body.data.outlineAssetId).toBe(assetId);
    expect(saved.body.data.scriptureReferences[0].raw).toBe("John 3:16");
  });
});
