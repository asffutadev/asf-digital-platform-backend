import { afterAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { registerWithOffice, removeOfficesOf } from "./helpers/officeUser.js";

vi.setConfig({ testTimeout: 300_000 });

describe("CMS mission, vision and values", () => {
  let publicity: Awaited<ReturnType<typeof registerWithOffice>>;

  it("setup: register a publicity coordinator", async () => {
    publicity = await registerWithOffice("cms-mvv", "publicity-coordinator");
  });

  afterAll(async () => {
    if (publicity?.id) await removeOfficesOf([publicity.id]);
  });

  it("rejects mission, vision and values outside their limits", async () => {
    const res = await request(app)
      .post("/api/content/website/draft")
      .set("Cookie", publicity.cookie)
      .send({
        copy: {
          mission: "x".repeat(1001),
          vision: "y".repeat(1001),
          values: [{ title: "z".repeat(81), description: "d".repeat(301) }],
        },
        sections: [],
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("saves and publicly returns mission, vision and values", async () => {
    const copy = {
      mission: "A clear mission",
      vision: "A clear vision",
      values: [{ title: "Faith", description: "Growing in Christ" }],
    };
    const save = await request(app)
      .post("/api/content/website/draft")
      .set("Cookie", publicity.cookie)
      .send({ copy, sections: [] });
    expect(save.status).toBe(200);
    const publish = await request(app).post("/api/content/website/publish").set("Cookie", publicity.cookie);
    expect(publish.status).toBe(200);
    const publicRead = await request(app).get("/api/content/website");
    expect(publicRead.status).toBe(200);
    expect(publicRead.body.data.copy).toEqual(copy);
  });
});
