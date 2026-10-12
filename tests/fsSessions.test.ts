import { afterAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { app } from "../src/app.js";
import { db } from "../src/db/index.js";
import { userExecutiveOffices } from "../src/db/schema/index.js";

vi.setConfig({ testTimeout: 300_000 });

const stamp = Date.now();

async function registerMember(name: string) {
  const res = await request(app).post("/api/auth/register").send({
    email: `vitest-fsses-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`,
    password: "vitestpass123", name, departmentId: "computer-science", gender: "Male", academicLevel: "500 Level",
  });
  expect(res.status).toBe(201);
  return { cookie: res.headers["set-cookie"]![0].split(";")[0], id: res.body.data.id as string };
}

describe("FS academic sessions (VP)", () => {
  let vpId: string;
  let vpCookie: string;
  let outsiderCookie: string;

  afterAll(async () => {
    if (vpId) await db.delete(userExecutiveOffices).where(eq(userExecutiveOffices.userId, vpId));
  }, 120_000);

  it("setup: a temporary VP and an outsider", async () => {
    const vp = await registerMember(`Sessions VP ${stamp}`);
    vpId = vp.id;
    vpCookie = vp.cookie;
    await db.insert(userExecutiveOffices).values({ userId: vpId, officeId: "vice-president" });
    outsiderCookie = (await registerMember(`Sessions Outsider ${stamp}`)).cookie;
  });

  it("the VP can list sessions, including the one classes are created in", async () => {
    const res = await request(app).get("/api/fs/academic-sessions").set("Cookie", vpCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    for (const row of res.body.data) {
      expect(typeof row.id).toBe("string");
      expect(typeof row.isActive).toBe("boolean");
    }
    expect(res.body.data.some((row: any) => row.id === "2027/2028")).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");
  });

  it("a listed session id is accepted when creating a class", async () => {
    const list = await request(app).get("/api/fs/academic-sessions").set("Cookie", vpCookie);
    const sessionId = list.body.data[0].id as string;
    const res = await request(app).post("/api/fs/classes").set("Cookie", vpCookie)
      .send({ name: `Sessions Class ${stamp}`, academicSessionId: sessionId, semester: "First" });
    expect(res.status).toBe(201);
    expect(res.body.data.academicSessionId).toBe(sessionId);
  });

  it("people without the VP office are blocked, and the old rollover endpoint stays locked for the VP", async () => {
    const outsider = await request(app).get("/api/fs/academic-sessions").set("Cookie", outsiderCookie);
    expect(outsider.status).toBe(403);
    expect(outsider.body.error.code).toBe("OFFICE_REQUIRED");

    const anonymous = await request(app).get("/api/fs/academic-sessions");
    expect(anonymous.status).toBe(401);

    const rollover = await request(app).get("/api/academic-sessions").set("Cookie", vpCookie);
    expect(rollover.status).toBe(403);
  });
});