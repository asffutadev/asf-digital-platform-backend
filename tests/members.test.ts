import { afterAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { app } from "../src/app.js";
import { db } from "../src/db/index.js";
import { auditLogs } from "../src/db/schema/index.js";
import { logResponse } from "./helpers/logResponse.js";
import { registerWithOffice, removeOfficesOf } from "./helpers/officeUser.js";

vi.setConfig({ testTimeout: 300_000 });

const ADMIN_EMAIL = process.env.SMOKE_ADMIN_EMAIL || "test2@example.com";
const ADMIN_PASSWORD = process.env.SMOKE_ADMIN_PASSWORD || "AdminTest2026x";
const stamp = Date.now();
const TEMP_PASSWORD = "TempPass2026x";

const officeUserIds: string[] = [];
afterAll(async () => { await removeOfficesOf(officeUserIds); }, 120_000);

type Actor = { id: string; email: string; cookie: string };

const get = (path: string, cookie?: string) => {
  const req = request(app).get(path);
  return cookie ? req.set("Cookie", cookie) : req;
};
const patch = (path: string, cookie: string, body: object = {}) =>
  request(app).patch(path).set("Cookie", cookie).send(body);

async function auditRows(action: string, targetId: string) {
  return db.select().from(auditLogs).where(and(eq(auditLogs.action, action), eq(auditLogs.targetId, targetId)));
}

describe("Members", () => {
  let publicity: Actor;
  let publicityTwo: Actor;
  let president: Actor;
  let outsider: Actor;
  let target: Actor;
  let admin: { id: string; cookie: string };

  it("setup: Publicity (two), a President, an ordinary member, a target, and the Technical Administrator", async () => {
    publicity = await registerWithOffice(`mem-pub-${stamp}`, "publicity-coordinator");
    publicityTwo = await registerWithOffice(`mem-pub2-${stamp}`, "publicity-coordinator");
    president = await registerWithOffice(`mem-pres-${stamp}`, "president");
    outsider = await registerWithOffice(`mem-out-${stamp}`);
    target = await registerWithOffice(`mem-target-${stamp}`);
    officeUserIds.push(publicity.id, publicityTwo.id, president.id);
    const login = await request(app).post("/api/auth/login").send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    expect(login.status).toBe(200);
    admin = { id: login.body.data.id, cookie: login.headers["set-cookie"]![0].split(";")[0] };
  });

  it("directory: contact details only for Publicity and the President", async () => {
    const path = `/api/members?search=${stamp}&limit=100`;

    const asOutsider = await get(path, outsider.cookie);
    logResponse("Members", "Member -> directory", asOutsider.status, asOutsider.body);
    expect(asOutsider.status).toBe(200);
    expect(asOutsider.body.data).toHaveLength(5);
    for (const key of ["email", "phoneNumber", "gender", "accountStatus"]) {
      expect(asOutsider.body.data.some((row: any) => key in row), key).toBe(false);
    }

    for (const actor of [publicity, president]) {
      const res = await get(path, actor.cookie);
      expect(res.status).toBe(200);
      expect(res.body.data.every((row: any) => "email" in row && "gender" in row && "accountStatus" in row)).toBe(true);
    }

    const asAdmin = await get(path, admin.cookie);
    expect(asAdmin.status).toBe(200);
    expect(asAdmin.body.data.some((row: any) => "email" in row)).toBe(false);
  });

  it("subgroup: only Publicity; unknown ids 404; no silent overwrite; replaceExisting works", async () => {
    const url = `/api/members/${target.id}/subgroup`;
    for (const actor of [outsider, president]) {
      const res = await patch(url, actor.cookie, { subgroup: "Choir" });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("OFFICE_REQUIRED");
    }

    const admin403 = await patch(url, admin.cookie, { subgroup: "Choir" });
    expect(admin403.status).toBe(403);

    const unknown = await patch(`/api/members/${randomUUID()}/subgroup`, publicity.cookie, { subgroup: "Choir" });
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe("MEMBER_NOT_FOUND");

    const invalid = await patch(url, publicity.cookie, { subgroup: "Legacy Group" });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe("VALIDATION_ERROR");

    const first = await patch(url, publicity.cookie, { subgroup: "Choir" });
    expect(first.status).toBe(200);
    expect(first.body.data.subgroup).toBe("Choir");
    expect(JSON.stringify(first.body)).not.toContain("passwordHash");
    expect(JSON.stringify(first.body)).not.toContain("$2b$");

    const blocked = await patch(url, publicity.cookie, { subgroup: "Drama" });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe("SUBGROUP_ALREADY_SET");

    const replaced = await patch(url, publicity.cookie, { subgroup: "Drama", replaceExisting: true });
    expect(replaced.status).toBe(200);
    expect(replaced.body.data.subgroup).toBe("Drama");

    const same = await patch(url, publicity.cookie, { subgroup: "Drama" });
    expect(same.status).toBe(200);
    expect(same.body.data.subgroup).toBe("Drama");
  });

  it("directory filters: subgroup, department, membership status, academic level", async () => {
    const q = (extra: string) => get(`/api/members?search=${stamp}&limit=100&${extra}`, outsider.cookie);

    const drama = await q("subgroup=Drama");
    expect(drama.status).toBe(200);
    expect(drama.body.data.map((row: any) => row.id)).toEqual([target.id]);
    expect(drama.body.meta.total).toBe(1);

    expect((await q("subgroup=Choir")).body.data).toHaveLength(0);
    const badSubgroup = await q("subgroup=Legacy");
    expect(badSubgroup.status).toBe(400);
    expect(badSubgroup.body.error.code).toBe("VALIDATION_ERROR");

    expect((await q("departmentId=other")).body.data).toHaveLength(5);
    expect((await q("departmentId=physics")).body.data).toHaveLength(0);

    expect((await q(`membershipStatus=${encodeURIComponent("Active Student")}`)).body.data).toHaveLength(5);
    expect((await q("membershipStatus=Alumni")).body.data).toHaveLength(0);
    const badMembership = await q("membershipStatus=Nope");
    expect(badMembership.status).toBe(400);
    expect(badMembership.body.error.code).toBe("VALIDATION_ERROR");

    expect((await q(`academicLevel=${encodeURIComponent("300 Level")}`)).body.data).toHaveLength(5);
  });

  it("academic level: only Publicity, validated, audited", async () => {
    const url = `/api/members/${target.id}/academic-level`;
    for (const actor of [outsider, president]) {
      const res = await patch(url, actor.cookie, { newLevel: "400 Level", overrideReason: "Promoted after review" });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("OFFICE_REQUIRED");
    }

    const shortReason = await patch(url, publicity.cookie, { newLevel: "400 Level", overrideReason: "no" });
    expect(shortReason.status).toBe(400);
    expect(shortReason.body.error.code).toBe("VALIDATION_ERROR");

    const unknown = await patch(`/api/members/${randomUUID()}/academic-level`, publicity.cookie, {
      newLevel: "400 Level", overrideReason: "Promoted after review",
    });
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe("MEMBER_NOT_FOUND");

    const ok = await patch(url, publicity.cookie, { newLevel: "400 Level", overrideReason: "Promoted after review" });
    expect(ok.status).toBe(200);
    expect(ok.body.data.academicLevel).toBe("400 Level");

    const rows = await auditRows("member.academic_level_changed", target.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].metadata).toMatchObject({ from: "300 Level", to: "400 Level", reason: "Promoted after review" });
  });

  it("status: Publicity suspends and reactivates; protected members, self and bad values are refused", async () => {
    const url = (id: string) => `/api/members/${id}/status`;
    for (const actor of [outsider, president]) {
      const res = await patch(url(target.id), actor.cookie, { accountStatus: "Suspended" });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("OFFICE_REQUIRED");
    }

    const deactivate = await patch(url(target.id), publicity.cookie, { accountStatus: "Deactivated" });
    expect(deactivate.status).toBe(400);
    expect(deactivate.body.error.code).toBe("VALIDATION_ERROR");

    const self = await patch(url(publicity.id), publicity.cookie, { accountStatus: "Suspended" });
    expect(self.status).toBe(400);
    expect(self.body.error.code).toBe("CANNOT_SELF_MODIFY");

    for (const protectedId of [president.id, publicityTwo.id, admin.id]) {
      const res = await patch(url(protectedId), publicity.cookie, { accountStatus: "Suspended" });
      expect(res.status, protectedId).toBe(403);
      expect(res.body.error.code, protectedId).toBe("PROTECTED_MEMBER");
    }

    const unknown = await patch(url(randomUUID()), publicity.cookie, { accountStatus: "Suspended" });
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe("MEMBER_NOT_FOUND");

    const suspend = await patch(url(target.id), publicity.cookie, { accountStatus: "Suspended", reason: "Test suspension" });
    logResponse("Members", "Publicity -> suspend member", suspend.status, suspend.body);
    expect(suspend.status).toBe(200);
    expect(suspend.body.data.accountStatus).toBe("Suspended");
    expect(JSON.stringify(suspend.body)).not.toContain("passwordHash");

    const oldSession = await get("/api/auth/me", target.cookie);
    expect(oldSession.status).toBe(401);
    const login = await request(app).post("/api/auth/login").send({ email: target.email, password: "vitestpass123" });
    expect(login.status).toBe(403);
    expect(login.body.error.code).toBe("ACCOUNT_NOT_ACTIVE");

    const rows = await auditRows("member.status_changed", target.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].metadata).toMatchObject({ from: "Active", to: "Suspended", reason: "Test suspension" });

    const reactivate = await patch(url(target.id), publicity.cookie, { accountStatus: "Active" });
    expect(reactivate.status).toBe(200);
    expect(reactivate.body.data.accountStatus).toBe("Active");
  });

  it("password reset: who may reset whom, and the response never carries the password", async () => {
    const url = (id: string) => `/api/members/${id}/reset-password`;

    for (const actor of [outsider, president]) {
      const res = await patch(url(target.id), actor.cookie, { newPassword: TEMP_PASSWORD });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("OFFICE_OR_CAPABILITY_REQUIRED");
    }

    const short = await patch(url(target.id), publicity.cookie, { newPassword: "short" });
    expect(short.status).toBe(400);
    expect(short.body.error.code).toBe("VALIDATION_ERROR");

    const unknown = await patch(url(randomUUID()), publicity.cookie, { newPassword: TEMP_PASSWORD });
    expect(unknown.status).toBe(404);

    const self = await patch(url(publicity.id), publicity.cookie, { newPassword: TEMP_PASSWORD });
    expect(self.status).toBe(400);
    expect(self.body.error.code).toBe("CANNOT_SELF_MODIFY");

    for (const protectedId of [president.id, admin.id, publicityTwo.id]) {
      const res = await patch(url(protectedId), publicity.cookie, { newPassword: TEMP_PASSWORD });
      expect(res.status, protectedId).toBe(403);
      expect(res.body.error.code, protectedId).toBe("PROTECTED_MEMBER");
    }

    const technicalHeadOnMember = await patch(url(target.id), admin.cookie, { newPassword: TEMP_PASSWORD });
    expect(technicalHeadOnMember.status).toBe(403);
    expect(technicalHeadOnMember.body.error.code).toBe("OFFICE_REQUIRED");

    const technicalHeadOnPublicity = await patch(url(publicityTwo.id), admin.cookie, { newPassword: TEMP_PASSWORD });
    expect(technicalHeadOnPublicity.status).toBe(200);
    expect(technicalHeadOnPublicity.body.data).toEqual({ id: publicityTwo.id, mustChangePassword: true });

    const ok = await patch(url(target.id), publicity.cookie, { newPassword: TEMP_PASSWORD });
    logResponse("Members", "Publicity -> reset member password", ok.status, ok.body);
    expect(ok.status).toBe(200);
    expect(ok.body.data).toEqual({ id: target.id, mustChangePassword: true });
    expect(JSON.stringify(ok.body)).not.toContain(TEMP_PASSWORD);

    const rows = await auditRows("member.password_reset", target.id);
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows[0].metadata)).not.toContain(TEMP_PASSWORD);
  });

  it("roles: only the President", async () => {
    const url = `/api/members/${target.id}/role`;
    for (const actor of [outsider, publicity, admin]) {
      const res = await patch(url, actor.cookie, { action: "assign", roleId: "Bible Study Coordinator" });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("OFFICE_REQUIRED");
    }

    const ok = await patch(url, president.cookie, { action: "assign", roleId: "Bible Study Coordinator" });
    expect(ok.status).toBe(200);
    expect(JSON.stringify(ok.body)).not.toContain("passwordHash");
    expect(JSON.stringify(ok.body)).not.toContain("$2b$");

    const selfEscalation = await patch(`/api/members/${president.id}/role`, president.cookie, { action: "assign", roleId: "Technical Administrator" });
    expect(selfEscalation.status).toBe(400);
    expect(selfEscalation.body.error.code).toBe("CANNOT_SELF_ESCALATE");

    const removeBase = await patch(url, president.cookie, { action: "remove", roleId: "Member" });
    expect(removeBase.status).toBe(400);
    expect(removeBase.body.error.code).toBe("CANNOT_REMOVE_BASE_ROLE");

    const invalid = await patch(url, president.cookie, { action: "assign", roleId: "No Such Role" });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe("INVALID_ROLE");
  });

  it("ids and search input are handled safely", async () => {
    const unknown = await get(`/api/members/${randomUUID()}`, outsider.cookie);
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe("MEMBER_NOT_FOUND");

    const malformed = await get("/api/members/not-a-real-uuid", outsider.cookie);
    expect(malformed.status).toBe(400);
    expect(malformed.body.error.code).toBe("INVALID_ID_FORMAT");

    const injection = await get(`/api/members?search=${encodeURIComponent("'; DROP TABLE users;--")}`, outsider.cookie);
    expect(injection.status).not.toBe(500);
  });

  it("unauthenticated requests are blocked", async () => {
    expect((await get("/api/members")).status).toBe(401);
  });
});