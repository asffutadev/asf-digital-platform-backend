import { afterAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { app } from "../src/app.js";
import { db } from "../src/db/index.js";
import { mediaAssets } from "../src/db/schema/index.js";
import { registerWithOffice, removeOfficesOf } from "./helpers/officeUser.js";

vi.setConfig({ testTimeout: 300_000 });

describe("CMS gallery preview", () => {
  let publicity: Awaited<ReturnType<typeof registerWithOffice>>;
  let assetId: string | undefined;

  it("setup", async () => {
    publicity = await registerWithOffice("cms-gallery", "publicity-coordinator");
  });

  afterAll(async () => {
    if (assetId) await db.delete(mediaAssets).where(eq(mediaAssets.id, assetId));
    if (publicity?.id) await removeOfficesOf([publicity.id]);
  });

  it("validates and resolves gallery asset URLs", async () => {
    const [asset] = await db.insert(mediaAssets).values({
      provider: "cloudinary",
      publicId: `cms-gallery-${Date.now()}`,
      secureUrl: "https://res.cloudinary.com/test/image/upload/cms-gallery.jpg",
      resourceType: "image",
      format: "jpg",
      mimeType: "image/jpeg",
      bytes: 123,
      createdBy: publicity.id,
    }).returning();
    assetId = asset.id;

    const bad = await request(app).post("/api/content/website/draft").set("Cookie", publicity.cookie).send({
      copy: {},
      sections: [{
        type: "gallery_preview",
        title: "Gallery",
        order: 1,
        items: [{ imageAssetId: asset.id, caption: "x".repeat(201), altText: "alt" }],
      }],
    });
    expect(bad.status).toBe(400);

    const save = await request(app).post("/api/content/website/draft").set("Cookie", publicity.cookie).send({
      copy: {},
      sections: [{
        type: "gallery_preview",
        title: "Gallery",
        order: 1,
        items: [{ imageAssetId: asset.id, caption: "Our fellowship", altText: "Students gathered" }],
      }],
    });
    expect(save.status).toBe(200);
    expect((await request(app).post("/api/content/website/publish").set("Cookie", publicity.cookie)).status).toBe(200);

    const publicRead = await request(app).get("/api/content/website");
    expect(publicRead.status).toBe(200);
    expect(publicRead.body.data.sections[0].items[0].imageUrl).toBe(asset.secureUrl);

    const remove = await request(app).delete(`/api/media/assets/${asset.id}`).set("Cookie", publicity.cookie);
    expect(remove.status).toBe(409);
    expect(remove.body.error.code).toBe("MEDIA_ASSET_IN_USE");
  });
});
