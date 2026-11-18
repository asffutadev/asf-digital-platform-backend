import { describe, it, expect, afterAll, vi } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { logResponse } from "./helpers/logResponse.js";
import { registerWithOffice, removeOfficesOf } from "./helpers/officeUser.js";

vi.setConfig({ testTimeout: 300_000 });

const officeUserIds: string[] = [];

// The GET responses contain extra fields (id, configId, timestamps) and nulls that the
// save endpoint rejects or ignores, so reduce a snapshot to what saveDraft accepts.
function toSaveShape(snapshot: any) {
  return {
    copy: snapshot.copy,
    sections: snapshot.sections.map((s: any) => {
      const out: Record<string, any> = { type: s.type, title: s.title, order: s.order };
      for (const key of ["sectionKey", "subtitle", "description", "imageUrl", "items", "configuration", "isCore", "isVisible"]) {
        if (s[key] !== null && s[key] !== undefined) out[key] = s[key];
      }
      return out;
    }),
  };
}

describe("CMS (Website Content)", () => {
  let adminCookie: string; // the Publicity Coordinator
  let memberCookie: string;
  let publishedSnapshot: any;
  let draftSnapshot: any;
  let activeThemeBefore: string;

  it("setup: a Publicity Coordinator, snapshot the live site, register a plain member", async () => {
    const publicity = await registerWithOffice("cms-publicity", "publicity-coordinator");
    officeUserIds.push(publicity.id);
    adminCookie = publicity.cookie;

    // Snapshot BEFORE any test touches the site, so afterAll can put it back.
    const pub = await request(app).get("/api/content/website");
    expect(pub.status).toBe(200);
    publishedSnapshot = pub.body.data;
    const themes = await request(app).get("/api/content/website/themes");
    expect(themes.status).toBe(200);
    activeThemeBefore = themes.body.data.activeThemeId;
    const drf = await request(app).get("/api/content/website/draft").set("Cookie", adminCookie);
    logResponse("CMS", "setup: snapshot draft (as Publicity)", drf.status, drf.body);
    expect(drf.status).toBe(200);
    draftSnapshot = drf.body.data;

    const member = await registerWithOffice("cms-member");
    memberCookie = member.cookie;
  });

  // One hook: restore the site first, and always remove the office afterwards.
  afterAll(async () => {
    try {
      if (!publishedSnapshot || !draftSnapshot) return;

      const saveLive = await request(app)
        .post("/api/content/website/draft")
        .set("Cookie", adminCookie)
        .send(toSaveShape(publishedSnapshot));
      if (saveLive.status !== 200) throw new Error(`CMS restore failed: saving the live copy as draft returned ${saveLive.status}`);

      const republish = await request(app).post("/api/content/website/publish").set("Cookie", adminCookie);
      if (republish.status !== 200) throw new Error(`CMS restore failed: republishing returned ${republish.status}`);

      if (activeThemeBefore !== "theme-1") {
        const reactivate = await request(app)
          .post("/api/content/website/activate")
          .set("Cookie", adminCookie)
          .send({ theme: activeThemeBefore, confirm: true });
        if (reactivate.status !== 200) throw new Error(`CMS restore failed: reactivating ${activeThemeBefore} returned ${reactivate.status}`);
      }

      const saveDraft = await request(app)
        .post("/api/content/website/draft")
        .set("Cookie", adminCookie)
        .send(toSaveShape(draftSnapshot));
      if (saveDraft.status !== 200) throw new Error(`CMS restore failed: restoring the working draft returned ${saveDraft.status}`);

      const live = await request(app).get("/api/content/website");
      if (live.body.data.copy?.hero?.headline !== publishedSnapshot.copy?.hero?.headline) {
        throw new Error("CMS restore failed: the live headline does not match the original snapshot");
      }
    } finally {
      await removeOfficesOf(officeUserIds);
    }
  }, 120000);

  it("GET /api/content/website is public, no auth required", async () => {
    const res = await request(app).get("/api/content/website");
    logResponse("CMS", "Public -> GET /api/content/website", res.status, res.body);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("published");
    expect(Array.isArray(res.body.data.sections)).toBe(true);
  });

  it("Member is BLOCKED from viewing the draft (no edit_draft permission)", async () => {
    const res = await request(app).get("/api/content/website/draft").set("Cookie", memberCookie);
    logResponse("CMS", "Member -> GET draft (should be blocked)", res.status, res.body);
    expect(res.status).toBe(403);
  });

  it("Admin CAN view the draft", async () => {
    const res = await request(app).get("/api/content/website/draft").set("Cookie", adminCookie);
    logResponse("CMS", "Admin -> GET draft", res.status, res.body);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("draft");
  });

  it("Member is BLOCKED from saving a draft", async () => {
    const res = await request(app).post("/api/content/website/draft").set("Cookie", memberCookie).send({
      copy: { hero: { headline: "Should Not Save" } },
      sections: [{ sectionKey: "sec-hero", type: "hero", title: "Hero", order: 1 }],
    });
    logResponse("CMS", "Member -> save draft (should be blocked)", res.status, res.body);
    expect(res.status).toBe(403);
  });

  const headlineForSave = `Vitest Headline ${Date.now()}`;

  it("Admin saves a draft, and the saved content is returned back", async () => {
    const res = await request(app).post("/api/content/website/draft").set("Cookie", adminCookie).send({
      copy: { hero: { headline: headlineForSave, supportingText: "test", primaryCtaText: "Go", secondaryCtaText: "See" } },
      sections: [{ sectionKey: "sec-hero", type: "hero", title: "Hero Welcome", isCore: true, order: 1, isVisible: true }],
    });
    logResponse("CMS", "Admin -> save draft", res.status, res.body);
    expect(res.status).toBe(200);
    expect(res.body.data.copy.hero.headline).toBe(headlineForSave);
  });

  it("Saving a section with a non-integer order is rejected", async () => {
    const res = await request(app).post("/api/content/website/draft").set("Cookie", adminCookie).send({
      copy: { hero: { headline: "Bad Order Test" } },
      sections: [{ sectionKey: "sec-hero", type: "hero", title: "Hero", order: 1.5 }],
    });
    logResponse("CMS", "Admin -> save draft with non-integer order (should fail)", res.status, res.body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("Member is BLOCKED from publishing", async () => {
    const res = await request(app).post("/api/content/website/publish").set("Cookie", memberCookie);
    logResponse("CMS", "Member -> publish (should be blocked)", res.status, res.body);
    expect(res.status).toBe(403);
  });

  let versionBeforePublish: number;

  it("Admin publishes: version increments by 1, public site reflects the saved draft", async () => {
    const before = await request(app).get("/api/content/website");
    versionBeforePublish = before.body.data.version;

    const res = await request(app).post("/api/content/website/publish").set("Cookie", adminCookie);
    logResponse("CMS", "Admin -> publish", res.status, res.body);
    expect(res.status).toBe(200);
    expect(res.body.data.version).toBe(versionBeforePublish + 1);
    expect(res.body.data.copy.hero.headline).toBe(headlineForSave);

    const after = await request(app).get("/api/content/website");
    logResponse("CMS", "Public -> GET website (after publish)", after.status, after.body);
    expect(after.body.data.copy.hero.headline).toBe(headlineForSave);
  });

  const unsavedHeadline = `Vitest Unsaved Draft ${Date.now()}`;

  it("Admin edits the draft again without publishing, then discards: draft reverts to the last published content", async () => {
    const save = await request(app).post("/api/content/website/draft").set("Cookie", adminCookie).send({
      copy: { hero: { headline: unsavedHeadline, supportingText: "test", primaryCtaText: "Go", secondaryCtaText: "See" } },
      sections: [{ sectionKey: "sec-hero", type: "hero", title: "Hero Welcome", isCore: true, order: 1, isVisible: true }],
    });
    expect(save.status).toBe(200);
    expect(save.body.data.copy.hero.headline).toBe(unsavedHeadline);

    const res = await request(app).post("/api/content/website/draft/discard").set("Cookie", adminCookie);
    logResponse("CMS", "Admin -> discard draft", res.status, res.body);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("draft");
    expect(res.body.data.copy.hero.headline).toBe(headlineForSave);
    expect(res.body.data.copy.hero.headline).not.toBe(unsavedHeadline);
  });

  it("Member is BLOCKED from discarding the draft", async () => {
    const res = await request(app).post("/api/content/website/draft/discard").set("Cookie", memberCookie);
    logResponse("CMS", "Member -> discard (should be blocked)", res.status, res.body);
    expect(res.status).toBe(403);
  });

  it("Member is BLOCKED from factory-resetting", async () => {
    const res = await request(app).post("/api/content/website/reset").set("Cookie", memberCookie);
    logResponse("CMS", "Member -> reset (should be blocked)", res.status, res.body);
    expect(res.status).toBe(403);
  });

  it("Admin factory-resets: draft returns to hardcoded defaults, not the last published content", async () => {
    const res = await request(app).post("/api/content/website/reset").set("Cookie", adminCookie);
    logResponse("CMS", "Admin -> factory reset", res.status, res.body);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("draft");
    expect(res.body.data.copy.hero?.headline).not.toBe(headlineForSave);
  });

  it("Factory reset does not touch the live published site", async () => {
    const res = await request(app).get("/api/content/website");
    logResponse("CMS", "Public -> GET website (after factory reset, should be unaffected)", res.status, res.body);
    expect(res.status).toBe(200);
    expect(res.body.data.copy.hero.headline).toBe(headlineForSave);
  });

  it("Unauthenticated request to draft is blocked", async () => {
    const res = await request(app).get("/api/content/website/draft");
    logResponse("CMS", "No cookie -> GET draft", res.status, res.body);
    expect(res.status).toBe(401);
  });

  it("Theme isolation: theme-2 can be edited and published without changing theme-1", async () => {
    const before = await request(app).get("/api/content/website");
    const save = await request(app)
      .post("/api/content/website/draft?theme=theme-2")
      .set("Cookie", adminCookie)
      .send({
        copy: { hero: { headline: "Theme 2 Isolation" } },
        sections: [{ sectionKey: "theme-2-hero", type: "hero", title: "Theme 2 Hero", order: 1 }],
      });
    expect(save.status).toBe(200);
    const publish = await request(app).post("/api/content/website/publish?theme=theme-2").set("Cookie", adminCookie);
    expect(publish.status).toBe(200);
    const after = await request(app).get("/api/content/website");
    expect(after.body.data.themeId).toBe("theme-1");
    expect(after.body.data.copy.hero.headline).toBe(before.body.data.copy.hero.headline);
    const theme2 = await request(app).get("/api/content/website/draft?theme=theme-2").set("Cookie", adminCookie);
    expect(theme2.body.data.copy.hero.headline).toBe("Theme 2 Isolation");
  });

  it("Publish history is written, restore changes only the draft, and activation requires confirmation", async () => {
    const history = await request(app).get("/api/content/website/history?theme=theme-2").set("Cookie", adminCookie);
    expect(history.status).toBe(200);
    expect(history.body.data.length).toBeGreaterThan(0);
    expect(history.body.data[0]).not.toHaveProperty("copy");

    const restore = await request(app)
      .post("/api/content/website/restore")
      .set("Cookie", adminCookie)
      .send({ theme: "theme-2", historyId: history.body.data[0].id });
    expect(restore.status).toBe(200);
    expect((await request(app).get("/api/content/website/draft?theme=theme-2").set("Cookie", adminCookie)).body.data.copy.hero.headline)
      .not.toBe("Theme 2 Isolation");
    expect((await request(app).get("/api/content/website")).body.data.themeId).toBe("theme-1");

    const missingConfirmation = await request(app)
      .post("/api/content/website/activate")
      .set("Cookie", adminCookie)
      .send({ theme: "theme-2" });
    expect(missingConfirmation.status).toBe(400);
    expect(missingConfirmation.body.error.code).toBe("CONFIRMATION_REQUIRED");

    const activate = await request(app)
      .post("/api/content/website/activate")
      .set("Cookie", adminCookie)
      .send({ theme: "theme-2", confirm: true });
    expect(activate.status).toBe(200);
    expect((await request(app).get("/api/content/website")).body.data.themeId).toBe("theme-2");
    const deactivate = await request(app)
      .post("/api/content/website/activate")
      .set("Cookie", adminCookie)
      .send({ theme: "theme-1", confirm: true });
    expect(deactivate.status).toBe(200);
  });

  it("Rejects bad themes and section types with VALIDATION_ERROR", async () => {
    const badTheme = await request(app).get("/api/content/website/draft?theme=not-a-theme").set("Cookie", adminCookie);
    expect(badTheme.status).toBe(400);
    expect(badTheme.body.error.code).toBe("VALIDATION_ERROR");
    const badType = await request(app)
      .post("/api/content/website/draft?theme=theme-2")
      .set("Cookie", adminCookie)
      .send({ copy: {}, sections: [{ type: "not-allowed", title: "Bad", order: 1 }] });
    expect(badType.status).toBe(400);
    expect(badType.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("A failure during section replacement rolls the draft back unchanged", async () => {
    const before = await request(app).get("/api/content/website/draft?theme=theme-2").set("Cookie", adminCookie);
    const failed = await request(app)
      .post("/api/content/website/draft?theme=theme-2")
      .set("Cookie", adminCookie)
      .send({
        copy: { hero: { headline: "Must Roll Back" } },
        sections: [{ type: "hero", title: "Broken Asset", order: 1, imageAssetId: "00000000-0000-0000-0000-000000000000" }],
      });
    expect(failed.status).toBe(500);
    const after = await request(app).get("/api/content/website/draft?theme=theme-2").set("Cookie", adminCookie);
    expect(after.body.data.copy).toEqual(before.body.data.copy);
    expect(after.body.data.sections).toEqual(before.body.data.sections);
  });

  it("Keeps only the latest 20 history snapshots per theme", async () => {
    for (let index = 0; index < 21; index += 1) {
      const save = await request(app)
        .post("/api/content/website/draft?theme=theme-2")
        .set("Cookie", adminCookie)
        .send({ copy: { hero: { headline: `History ${index}` } }, sections: [{ type: "hero", title: "Hero", order: 1 }] });
      expect(save.status).toBe(200);
      const publish = await request(app).post("/api/content/website/publish?theme=theme-2").set("Cookie", adminCookie);
      expect(publish.status).toBe(200);
    }
    const history = await request(app).get("/api/content/website/history?theme=theme-2").set("Cookie", adminCookie);
    expect(history.status).toBe(200);
    expect(history.body.data).toHaveLength(20);
  });

  it("Every CMS write remains protected by the publicity office", async () => {
    const endpoints = [
      ["/api/content/website/restore", { theme: "theme-2", historyId: "00000000-0000-0000-0000-000000000000" }],
      ["/api/content/website/activate", { theme: "theme-2", confirm: true }],
    ] as const;
    for (const [endpoint, body] of endpoints) {
      const response = await request(app).post(endpoint).set("Cookie", memberCookie).send(body);
      expect(response.status).toBe(403);
    }
  });
});