import { afterAll, describe, it, expect, vi } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { logResponse } from "./helpers/logResponse.js";
import { db } from "../src/db/index.js";
import { userDashboardAccess, userRoles } from "../src/db/schema/index.js";
import { registerWithOffice, removeOfficesOf } from "./helpers/officeUser.js";

vi.setConfig({ testTimeout: 300_000 });

const ADMIN_EMAIL = process.env.SMOKE_ADMIN_EMAIL || "test2@example.com";
const ADMIN_PASSWORD = process.env.SMOKE_ADMIN_PASSWORD || "AdminTest2026x";

const officeUserIds: string[] = [];
afterAll(async () => { await removeOfficesOf(officeUserIds); }, 120_000);

async function registerAndLogin(emailPrefix: string, name: string) {
  const email = `vitest-${emailPrefix}-${Date.now()}@example.com`;
  const password = "vitestpass123";
  const res = await request(app).post("/api/auth/register").send({
    email, password, name, departmentId: "computer-science", gender: "Male", academicLevel: "100 Level",
  });
  const cookie = res.headers["set-cookie"]![0].split(";")[0];
  const userId = res.body.data.id;
  return { email, cookie, userId };
}

async function assignRole(adminCookie: string, userId: string, roleId: string) {
  return request(app)
    .patch(`/api/members/${userId}/role`)
    .set("Cookie", adminCookie)
    .send({ action: "assign", roleId });
}

describe("RBAC", () => {
  let memberCookie: string;
  let adminCookie: string;
  let adminId: string;
  let presidentCookie: string;
  let publicityRoleCookie: string;
  let publicityOfficeCookie: string;

  it("setup: register plain member", async () => {
    const { cookie } = await registerAndLogin("member", "Vitest Member");
    memberCookie = cookie;
    expect(memberCookie).toBeDefined();
  });

  it("setup: login as Technical Administrator", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    logResponse("RBAC", "setup login (admin)", res.status, res.body);
    expect(res.status).toBe(200);
    adminCookie = res.headers["set-cookie"]![0].split(";")[0];
    adminId = res.body.data.id;
  });

  it("setup: register + promote a President", async () => {
    const { cookie, userId } = await registerAndLogin("president", "Vitest President");
    const res = await assignRole(adminCookie, userId, "President / Executive");
    logResponse("RBAC", "assign role -> President / Executive", res.status, res.body);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("OFFICE_REQUIRED");
    await db.insert(userRoles).values({ userId, roleId: "President / Executive" });
    await db.insert(userDashboardAccess).values({ userId, dashboardId: "president", grantedBy: adminId }).onConflictDoNothing();
    presidentCookie = cookie;
  });

  it("setup: a member with ONLY the old Publicity Coordinator role", async () => {
    const { cookie, userId } = await registerAndLogin("publicity-role", "Vitest Publicity Role");
    const res = await assignRole(adminCookie, userId, "Publicity Coordinator");
    logResponse("RBAC", "Technical Administrator -> assign role (should be blocked now)", res.status, res.body);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("OFFICE_REQUIRED");
    await db.insert(userRoles).values({ userId, roleId: "Publicity Coordinator" });
    publicityRoleCookie = cookie;
  });

  it("setup: a member holding the Publicity Coordinator OFFICE", async () => {
    const publicity = await registerWithOffice("rbac-publicity", "publicity-coordinator");
    officeUserIds.push(publicity.id);
    publicityOfficeCookie = publicity.cookie;
  });

  it("Member is blocked from GET /api/fs/admissions/admin", async () => {
    const res = await request(app).get("/api/fs/admissions/admin").set("Cookie", memberCookie);
    logResponse("RBAC", "Member -> GET /api/fs/admissions/admin", res.status, res.body);
    expect(res.status).toBe(403);
  });

  it("The Technical Administrator has NO access to FS (only the Vice President office does)", async () => {
    const res = await request(app).get("/api/fs/admissions/admin").set("Cookie", adminCookie);
    logResponse("RBAC", "Admin -> GET /api/fs/admissions/admin (should be blocked)", res.status, res.body);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("OFFICE_REQUIRED");
  });

  it("President can VIEW events but is BLOCKED from creating one", async () => {
    const listRes = await request(app).get("/api/events").set("Cookie", presidentCookie);
    logResponse("RBAC", "President -> GET /api/events", listRes.status, listRes.body);
    expect(listRes.status).toBe(200);

    const createRes = await request(app).post("/api/events").set("Cookie", presidentCookie).send({
      title: "Should Fail",
      location: "Nowhere",
      startTime: "2026-12-25T08:00:00.000Z",
      description: "This request should be blocked before creation.",
      programType: "Physical",
    });
    logResponse("RBAC", "President -> POST /api/events (should be blocked)", createRes.status, createRes.body);
    expect(createRes.status).toBe(403);
  });

  it("The old Publicity Coordinator ROLE alone no longer grants access to anything", async () => {
    const create = await request(app).post("/api/announcements").set("Cookie", publicityRoleCookie).send({
      title: "Role Only Attempt", message: "Should be blocked", priority: "Normal",
    });
    logResponse("RBAC", "Publicity ROLE only -> POST /api/announcements (should be blocked)", create.status, create.body);
    expect(create.status).toBe(403);
    expect(create.body.error.code).toBe("OFFICE_REQUIRED");

    const draft = await request(app).get("/api/content/website/draft").set("Cookie", publicityRoleCookie);
    expect(draft.status).toBe(403);
    expect(draft.body.error.code).toBe("OFFICE_REQUIRED");
  });

  it("The Publicity Coordinator OFFICE holder CAN create an announcement and open the website draft", async () => {
    const createRes = await request(app).post("/api/announcements").set("Cookie", publicityOfficeCookie).send({
      title: "Vitest Publicity Test", message: "Testing the publicity office", priority: "Normal",
    });
    logResponse("RBAC", "Publicity OFFICE -> POST /api/announcements", createRes.status, createRes.body);
    expect(createRes.status).toBe(201);

    const res = await request(app).get("/api/content/website/draft").set("Cookie", publicityOfficeCookie);
    logResponse("RBAC", "Publicity OFFICE -> GET /api/content/website/draft", res.status, res.body);
    expect(res.status).toBe(200);
  });

  it("Member is blocked from website draft", async () => {
    const res = await request(app).get("/api/content/website/draft").set("Cookie", memberCookie);
    logResponse("RBAC", "Member -> GET /api/content/website/draft", res.status, res.body);
    expect(res.status).toBe(403);
  });

  it("Unauthenticated request is blocked entirely", async () => {
    const res = await request(app).get("/api/fs/admissions/admin");
    logResponse("RBAC", "No cookie -> GET /api/fs/admissions/admin", res.status, res.body);
    expect(res.status).toBe(401);
  });
});