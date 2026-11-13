import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { AppError } from "../../errors/appError.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import * as service from "./media.service.js";
import {
  assignMediaSchema,
  listMediaQuerySchema,
  mediaAssetIdSchema,
  placementKeySchema,
  updateMediaSchema,
  uploadMediaMetadataSchema,
} from "./media.validation.js";
import { fileTypeFromBuffer } from "file-type";

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 95 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_VIDEO_BYTES },
});

export const uploadMiddleware = upload.single("file");

function parsePlacementKey(value: string) {
  const parsed = placementKeySchema.safeParse(value);
  if (!parsed.success) throw AppError.badRequest("Invalid media placement key", "VALIDATION_ERROR");
  return parsed.data;
}

function parseAssetId(value: string) {
  const parsed = mediaAssetIdSchema.safeParse(value);
  if (!parsed.success) {
    throw AppError.badRequest("Invalid media asset ID", "INVALID_ID_FORMAT", {
      id: ["Media asset ID must be a UUID"],
    });
  }
  return parsed.data;
}

function parseUploadMetadata(body: Request["body"]) {
  let tags = body.tags;
  if (typeof tags === "string") {
    try {
      tags = JSON.parse(tags);
    } catch {
      throw AppError.badRequest("Tags must be a JSON array", "VALIDATION_ERROR", { tags: ["Tags must be a JSON array"] });
    }
  }
  const parsed = uploadMediaMetadataSchema.safeParse({ ...body, tags });
  if (!parsed.success) {
    throw AppError.badRequest("Invalid media metadata", "VALIDATION_ERROR", parsed.error.flatten().fieldErrors);
  }
  return parsed.data;
}

export async function uploadAsset(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) throw AppError.badRequest("No media file was uploaded", "NO_FILE");

    const realType = await fileTypeFromBuffer(req.file.buffer);
    const resourceType =
      realType?.mime.startsWith("image/") ? "image" :
      realType?.mime.startsWith("video/") ? "video" :
      realType?.mime === "application/pdf" ? "raw" :
      null;

    if (!realType || !resourceType) {
      throw AppError.badRequest("Only verified image, video, and PDF files are accepted", "INVALID_FILE_CONTENT");
    }
    const maxBytes = resourceType === "image" ? MAX_IMAGE_BYTES : resourceType === "raw" ? MAX_DOCUMENT_BYTES : MAX_VIDEO_BYTES;
    if (req.file.size > maxBytes) {
      throw AppError.badRequest("The uploaded file exceeds the allowed size", "FILE_TOO_LARGE");
    }

    const metadata = parseUploadMetadata(req.body);
    const asset = await service.uploadAsset(req.file, req.user!.id, {
      ...metadata,
      resourceType,
      mimeType: realType.mime,
    });
    return sendSuccess(res, asset, "Media uploaded", undefined, 201);
  } catch (error) {
    next(error);
  }
}

export async function listAssets(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = listMediaQuerySchema.safeParse(req.query);
    if (!parsed.success) throw AppError.badRequest("Invalid media query", "VALIDATION_ERROR", parsed.error.flatten().fieldErrors);
    const result = await service.listAssets(parsed.data);
    return sendSuccess(res, result.data, "Media assets retrieved", {
      total: result.total,
      page: parsed.data.page,
      limit: parsed.data.limit,
    });
  } catch (error) {
    next(error);
  }
}

export async function getAsset(req: Request, res: Response, next: NextFunction) {
  try {
    return sendSuccess(res, await service.getAsset(parseAssetId(req.params.id as string)));
  } catch (error) {
    next(error);
  }
}

export async function updateAsset(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = updateMediaSchema.safeParse(req.body);
    if (!parsed.success) throw AppError.badRequest("Invalid media metadata", "VALIDATION_ERROR", parsed.error.flatten().fieldErrors);
    return sendSuccess(res, await service.updateAsset(parseAssetId(req.params.id as string), parsed.data), "Media updated");
  } catch (error) {
    next(error);
  }
}

export async function removeAsset(req: Request, res: Response, next: NextFunction) {
  try {
    await service.deleteAsset(parseAssetId(req.params.id as string));
    return sendSuccess(res, null, "Media deleted");
  } catch (error) {
    next(error);
  }
}

export async function getPlacement(req: Request, res: Response, next: NextFunction) {
  try {
    const key = parsePlacementKey(req.params.key as string);
    res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    return sendSuccess(res, await service.getPlacement(key));
  } catch (error) {
    next(error);
  }
}

export async function listPlacements(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = listMediaQuerySchema.safeParse(req.query);
    if (!parsed.success) throw AppError.badRequest("Invalid media query", "VALIDATION_ERROR", parsed.error.flatten().fieldErrors);
    const keys = parsed.data.keys?.split(",").map((key) => parsePlacementKey(key));
    res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    return sendSuccess(res, await service.listPlacements(keys));
  } catch (error) {
    next(error);
  }
}

export async function assignAsset(req: Request, res: Response, next: NextFunction) {
  try {
    const key = parsePlacementKey(req.params.key as string);
    const parsed = assignMediaSchema.safeParse(req.body);
    if (!parsed.success) {
      throw AppError.badRequest("Invalid media assignment", "VALIDATION_ERROR", parsed.error.flatten().fieldErrors);
    }
    const result = await service.assignAsset(key, parsed.data.assetId, req.user!.id, parsed.data.altText);
    return sendSuccess(res, result, "Media assigned");
  } catch (error) {
    next(error);
  }
}

export function handleUpload(req: Request, res: Response, next: NextFunction) {
  uploadMiddleware(req, res, (error: unknown) => {
    if (error instanceof multer.MulterError || error instanceof Error) {
      next(AppError.badRequest(error.message, error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE" ? "FILE_TOO_LARGE" : "INVALID_FILE"));
      return;
    }
    next();
  });
}
