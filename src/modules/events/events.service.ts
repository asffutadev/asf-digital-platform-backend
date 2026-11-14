import { AppError } from "../../errors/appError.js";
import * as repo from "./events.repository.js";
import type { CreateEventInput, ListEventsInput, UpdateEventInput } from "./events.validation.js";

type EventRow = NonNullable<Awaited<ReturnType<typeof repo.findById>>>;

function toProgram(row: EventRow) {
  const event = row.event;
  return {
    id: event.id,
    title: event.title,
    startTime: event.startTime,
    location: event.location,
    description: event.description,
    guestMinister: event.speaker,
    programType: event.mode === "Online / Zoom" ? "Online" : "Physical",
    imageAssetId: event.imageAssetId,
    imageUrl: row.imageAssetUrl ?? event.imageUrl,
    status: event.status === "Active" ? "Published" : event.status,
    archived: event.startTime.getTime() < Date.now() - 90 * 24 * 60 * 60 * 1000,
    createdBy: event.createdBy,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
  };
}

async function assertAssetExists(imageAssetId: string | undefined) {
  if (imageAssetId && !(await repo.findMediaAsset(imageAssetId))) {
    throw AppError.badRequest("Image asset was not found", "MEDIA_ASSET_NOT_FOUND", {
      imageAssetId: ["Image asset was not found"],
    });
  }
}

export async function createEvent(input: CreateEventInput, createdBy: string) {
  await assertAssetExists(input.imageAssetId);
  const row = await repo.createEvent({
    title: input.title,
    startTime: new Date(input.startTime),
    location: input.location,
    description: input.description,
    speaker: input.guestMinister,
    mode: input.programType === "Online" ? "Online / Zoom" : "In-Person",
    imageAssetId: input.imageAssetId,
    createdBy,
    category: "Fellowship",
    status: "Draft",
  });
  return row ? toProgram(row) : null;
}

export async function getEvents(filters: ListEventsInput, canViewDrafts: boolean) {
  const result = await repo.listEvents(filters, canViewDrafts);
  return {
    data: result.rows.map((row) => toProgram(row)),
    total: result.total,
  };
}

export async function getEvent(id: string, canViewDrafts: boolean) {
  const row = await repo.findById(id);
  if (!row || (!canViewDrafts && row.event.status === "Draft")) {
    throw AppError.notFound("Event not found", "EVENT_NOT_FOUND");
  }
  return toProgram(row);
}

export async function getFeaturedEvent() {
  const row = await repo.getFeatured();
  if (!row) throw AppError.notFound("No upcoming programs", "NO_UPCOMING_EVENT");
  return toProgram(row);
}

export async function updateEvent(id: string, input: UpdateEventInput) {
  const existing = await repo.findById(id);
  if (!existing) throw AppError.notFound("Event not found", "EVENT_NOT_FOUND");
  if (existing.event.status === "Cancelled") {
    throw AppError.conflict("Cancelled programs cannot be edited", "CANCELLED_NOT_EDITABLE");
  }
  await assertAssetExists(input.imageAssetId);
  const row = await repo.updateEvent(id, {
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.startTime !== undefined ? { startTime: new Date(input.startTime) } : {}),
    ...(input.location !== undefined ? { location: input.location } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.guestMinister !== undefined ? { speaker: input.guestMinister } : {}),
    ...(input.programType !== undefined ? { mode: input.programType === "Online" ? "Online / Zoom" : "In-Person" } : {}),
    ...(input.imageAssetId !== undefined ? { imageAssetId: input.imageAssetId } : {}),
  });
  return row ? toProgram(row) : null;
}

export async function publishEvent(id: string) {
  const existing = await repo.findById(id);
  if (!existing) throw AppError.notFound("Event not found", "EVENT_NOT_FOUND");
  if (existing.event.status !== "Draft") {
    throw AppError.conflict("Only draft programs can be published", "ONLY_DRAFT_PUBLISHABLE");
  }
  const row = await repo.publishEvent(id);
  return row ? toProgram(row) : null;
}

export async function cancelEvent(id: string) {
  const existing = await repo.findById(id);
  if (!existing) throw AppError.notFound("Event not found", "EVENT_NOT_FOUND");
  if (existing.event.status === "Cancelled") {
    throw AppError.conflict("This program is already cancelled", "ALREADY_CANCELLED");
  }
  if (existing.event.status !== "Active") {
    throw AppError.conflict("Only published programs can be cancelled", "ONLY_PUBLISHED_CANCELLABLE");
  }
  const row = await repo.cancelEvent(id);
  return row ? toProgram(row) : null;
}

export async function deleteEvent(id: string) {
  const existing = await repo.findById(id);
  if (!existing) throw AppError.notFound("Event not found", "EVENT_NOT_FOUND");
  if (existing.event.status !== "Draft") {
    throw AppError.conflict("Only draft programs can be deleted", "ONLY_DRAFT_DELETABLE");
  }
  await repo.deleteEvent(id);
}
