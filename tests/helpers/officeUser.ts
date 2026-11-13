import request from "supertest";
import { expect } from "vitest";
import { inArray } from "drizzle-orm";
import { app } from "../../src/app.js";
import { db } from "../../src/db/index.js";
import { userExecutiveOffices } from "../../src/db/schema/index.js";

// Registers a throwaway member (the register response carries the session cookie, so no login is needed)
// and optionally gives them an executive office. The password is always "vitestpass123".
export async function registerWithOffice(label: string, officeId?: string, name?: string) {
  const email = `vitest-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  const res = await request(app).post("/api/auth/register").send({
    email,
    password: "vitestpass123",
    name: name ?? `Vitest ${label}`,
    departmentId: "other",
    gender: "Male",
    academicLevel: "300 Level",
  });
  expect(res.status).toBe(201);
  const id = res.body.data.id as string;
  if (officeId) await db.insert(userExecutiveOffices).values({ userId: id, officeId });
  return { id, email, cookie: res.headers["set-cookie"]![0].split(";")[0] };
}

export async function removeOfficesOf(userIds: string[]) {
  if (userIds.length === 0) return;
  await db.delete(userExecutiveOffices).where(inArray(userExecutiveOffices.userId, userIds));
}