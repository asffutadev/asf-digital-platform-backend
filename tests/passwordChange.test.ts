import { afterAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { registerWithOffice, removeOfficesOf } from "./helpers/officeUser.js";

vi.setConfig({ testTimeout: 300_000 });

const stamp = Date.now();
const OLD_PASSWORD = "vitestpass123";
const TEMP_PASSWORD = "TempPass2026x";
const NEW_PASSWORD = "NewPass2026x";

const officeUserIds: string[] = [];
afterAll(async () => { await removeOfficesOf(officeUserIds); }, 120_000);

const login = (email: string, password: string) => request(app).post("/api/auth/login").send({ email, password });
const authed = (method: "get" | "post", path: string, cookie: string) => (request(app) as any)[method](path).set("Cookie", cookie);

describe("temporary password and forced change", () => {
  let publicity: { id: string; cookie: string };
  let member: { id: string; email: string; cookie: string };
  let flaggedCookie: string;

  it("setup: a Publicity Coordinator and a member", async () => {
    publicity = await registerWithOffice(`pwd-pub-${stamp}`, "publicity-coordinator");
    member = await registerWithOffice(`pwd-member-${stamp}`);
    officeUserIds.push(publicity.id);
  });

  it("a reset flags the account, ends old sessions, and never returns the password", async () => {
    const res = await request(app)
      .patch(`/api/members/${member.id}/reset-password`)
      .set("Cookie", publicity.cookie)
      .send({ newPassword: TEMP_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ id: member.id, mustChangePassword: true });
    expect(JSON.stringify(res.body)).not.toContain(TEMP_PASSWORD);

    const oldSession = await authed("get", "/api/auth/me", member.cookie);
    expect(oldSession.status).toBe(401);
  });

  it("the old password stops working; the temporary one works and the login says a change is required", async () => {
    const old = await login(member.email, OLD_PASSWORD);
    expect(old.status).toBe(401);
    expect(old.body.error.code).toBe("INVALID_CREDENTIALS");

    const temp = await login(member.email, TEMP_PASSWORD);
    expect(temp.status).toBe(200);
    expect(temp.body.data.mustChangePassword).toBe(true);
    flaggedCookie = temp.headers["set-cookie"]![0].split(";")[0];
  });

  it("while flagged, only /me, /logout and /change-password are reachable", async () => {
    const me = await authed("get", "/api/auth/me", flaggedCookie);
    expect(me.status).toBe(200);
    expect(me.body.data.mustChangePassword).toBe(true);

    for (const path of ["/api/members", "/api/events", "/api/users/profile"]) {
      const res = await authed("get", path, flaggedCookie);
      expect(res.status, path).toBe(403);
      expect(res.body.error.code, path).toBe("PASSWORD_CHANGE_REQUIRED");
    }
  });

  it("change-password: wrong current, too short, unchanged, then success", async () => {
    const change = (body: object) => request(app).post("/api/auth/change-password").set("Cookie", flaggedCookie).send(body);

    const wrong = await change({ currentPassword: "WrongPass2026", newPassword: NEW_PASSWORD });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.code).toBe("INVALID_CURRENT_PASSWORD");

    const short = await change({ currentPassword: TEMP_PASSWORD, newPassword: "short" });
    expect(short.status).toBe(400);
    expect(short.body.error.code).toBe("VALIDATION_ERROR");

    const same = await change({ currentPassword: TEMP_PASSWORD, newPassword: TEMP_PASSWORD });
    expect(same.status).toBe(400);
    expect(same.body.error.code).toBe("PASSWORD_UNCHANGED");

    const ok = await change({ currentPassword: TEMP_PASSWORD, newPassword: NEW_PASSWORD });
    expect(ok.status).toBe(200);
    expect(ok.body.data).toEqual({ mustChangePassword: false });
  });

  it("afterwards: full access again, the temporary password is dead, the new one works", async () => {
    const members = await authed("get", "/api/members", flaggedCookie);
    expect(members.status).toBe(200);

    const temp = await login(member.email, TEMP_PASSWORD);
    expect(temp.status).toBe(401);

    const fresh = await login(member.email, NEW_PASSWORD);
    expect(fresh.status).toBe(200);
    expect(fresh.body.data.mustChangePassword).toBe(false);
  });
});