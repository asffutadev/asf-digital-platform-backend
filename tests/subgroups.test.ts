import { afterAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { registerWithOffice, removeOfficesOf } from "./helpers/officeUser.js";

vi.setConfig({ testTimeout: 300_000 });

const officeUserIds: string[] = [];
afterAll(async () => { await removeOfficesOf(officeUserIds); }, 120_000);

describe("canonical subgroups", () => {
  it("rejects non-canonical subgroup values during registration", async () => {
    const response = await request(app).post("/api/auth/register").send({
      email: `subgroup-invalid-${Date.now()}@example.com`, password: "vitestpass123", name: "Invalid Subgroup", departmentId: "computer-science", gender: "Male", academicLevel: "100 Level", subgroup: "Legacy Group",
    });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects non-canonical subgroup values during mutation", async () => {
    const publicity = await registerWithOffice("subgroups-publicity", "publicity-coordinator");
    officeUserIds.push(publicity.id);
    const member = await registerWithOffice("subgroups-target");
    const response = await request(app).patch(`/api/members/${member.id}/subgroup`).set("Cookie", publicity.cookie).send({ subgroup: "Legacy Group" });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });
});