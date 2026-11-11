import { afterAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { app } from "../src/app.js";
import { db } from "../src/db/index.js";
import { userExecutiveOffices } from "../src/db/schema/index.js";

vi.setConfig({ testTimeout: 300_000 });

const stamp = Date.now();
const createdUserIds: string[] = [];
const someId = randomUUID();

async function registerMember(label: string) {
  const res = await request(app).post("/api/auth/register").send({
    email: `vitest-pubacc-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`,
    password: "vitestpass123", name: `PubAccess ${label} ${stamp}`, departmentId: "computer-science", gender: "Male", academicLevel: "500 Level",
  });
  expect(res.status).toBe(201);
  const id = res.body.data.id as string;
  createdUserIds.push(id);
  return { id, cookie: res.headers["set-cookie"]![0].split(";")[0] };
}

type Method = "get" | "post" | "put" | "patch" | "delete";
const call = (method: Method, path: string, cookie?: string, body: object = {}) => {
  const req = (request(app) as any)[method](path);
  if (cookie) req.set("Cookie", cookie);
  return req.send(body);
};

const protectedRoutes: [Method, string][] = [
  ["post", "/api/events"],
  ["put", `/api/events/${someId}`],
  ["patch", `/api/events/${someId}/cancel`],
  ["post", "/api/announcements"],
  ["patch", `/api/announcements/${someId}/submit-review`],
  ["patch", `/api/announcements/${someId}/approve`],
  ["patch", `/api/announcements/${someId}/request-revision`],
  ["put", `/api/announcements/${someId}`],
  ["patch", `/api/announcements/${someId}/publish`],
  ["patch", `/api/announcements/${someId}/archive`],
  ["get", "/api/content/website/draft"],
  ["post", "/api/content/website/draft"],
  ["post", "/api/content/website/publish"],
  ["post", "/api/content/website/draft/discard"],
  ["post", "/api/content/website/reset"],
  ["get", "/api/media/assets"],
  ["post", "/api/media/assets"],
  ["delete", `/api/media/assets/${someId}`],
  ["put", "/api/media/placements/public.bible-study.theme"],
  ["get", "/api/bible-study/aliases"],
  ["post", "/api/bible-study/aliases"],
  ["post", "/api/bible-study/book-aliases"],
  ["post", "/api/bible-study/upload-outline"],
  ["post", "/api/bible-study/series"],
  ["post", "/api/bible-study"],
  ["put", `/api/bible-study/${someId}`],
  ["patch", `/api/bible-study/${someId}/publish`],
];

describe("Publicity office access", () => {
  let publicity: { id: string; cookie: string };
  let president: { id: string; cookie: string };
  let outsider: { id: string; cookie: string };
  let adminCookie: string;

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      await db.delete(userExecutiveOffices).where(inArray(userExecutiveOffices.userId, createdUserIds));
    }
  }, 120_000);

  it("setup: Publicity, President and ordinary members, plus the Technical Administrator login", async () => {
    publicity = await registerMember("publicity");
    president = await registerMember("president");
    outsider = await registerMember("outsider");
    await db.insert(userExecutiveOffices).values([
      { userId: publicity.id, officeId: "publicity-coordinator" },
      { userId: president.id, officeId: "president" },
    ]);
    const login = await request(app).post("/api/auth/login").send({
      email: process.env.SMOKE_ADMIN_EMAIL || "test2@example.com",
      password: process.env.SMOKE_ADMIN_PASSWORD || "AdminTest2026x",
    });
    expect(login.status).toBe(200);
    adminCookie = login.headers["set-cookie"]![0].split(";")[0];
  });

  it("the Publicity office unlocks the publicity dashboard", async () => {
    const me = await request(app).get("/api/auth/me").set("Cookie", publicity.cookie);
    expect(me.status).toBe(200);
    expect(me.body.data.dashboards).toContain("publicity");
    expect(me.body.data.executiveOffices.map((o: { id: string }) => o.id)).toContain("publicity-coordinator");
  });

  it("Publicity passes every guard (reads succeed, writes reach validation without creating anything)", async () => {
    for (const path of ["/api/content/website/draft", "/api/media/assets", "/api/bible-study/aliases"]) {
      const res = await call("get", path, publicity.cookie);
      expect(res.status).toBe(200);
    }
    for (const path of ["/api/events", "/api/announcements", "/api/bible-study", "/api/bible-study/series", "/api/content/website/draft"]) {
      const res = await call("post", path, publicity.cookie, {});
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    }
    const upload = await call("post", "/api/media/assets", publicity.cookie);
    expect(upload.status).toBe(400);
    expect(upload.body.error.code).toBe("NO_FILE");
  });

  for (const actor of ["president", "admin", "outsider"] as const) {
    it(`the ${actor === "admin" ? "Technical Administrator" : actor} is blocked from every Publicity route`, async () => {
      const cookie = actor === "president" ? president.cookie : actor === "admin" ? adminCookie : outsider.cookie;
      for (const [method, path] of protectedRoutes) {
        const res = await call(method, path, cookie);
        expect(res.status, `${method} ${path}`).toBe(403);
        expect(res.body.error.code, `${method} ${path}`).toBe("OFFICE_REQUIRED");
      }
    });
  }

  it("public and member-level reads still work", async () => {
    expect((await call("get", "/api/content/website")).status).toBe(200);
    expect((await call("get", "/api/media/placements")).status).toBe(200);
    expect((await call("get", "/api/events", outsider.cookie)).status).toBe(200);
    expect((await call("get", "/api/announcements", outsider.cookie)).status).toBe(200);
  });

  it("system logs need the technical_head capability: the admin passes, the President and Publicity do not", async () => {
    for (const path of ["/api/system/health", "/api/system/pulse"]) {
      const ok = await call("get", path, adminCookie);
      expect(ok.status, path).toBe(200);
      for (const cookie of [president.cookie, publicity.cookie, outsider.cookie]) {
        const denied = await call("get", path, cookie);
        expect(denied.status, path).toBe(403);
        expect(denied.body.error.code, path).toBe("CAPABILITY_REQUIRED");
      }
    }
  });
});