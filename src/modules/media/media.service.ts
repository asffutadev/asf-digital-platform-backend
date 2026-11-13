import { AppError } from "../../errors/appError.js";
import type { mediaAssets } from "../../db/schema/mediaAssets.js";
import type { StoredMedia } from "./providers/mediaProvider.interface.js";
import { mediaProvider } from "./providers/index.js";
import * as repository from "./media.repository.js";
import type { ListMediaQuery, UpdateMediaInput } from "./media.types.js";

type MediaAsset = typeof mediaAssets.$inferSelect;

export function toAssetResponse(asset: MediaAsset) {
  return {
    id: asset.id,
    provider: asset.provider,
    publicId: asset.publicId,
    url: asset.secureUrl,
    resourceType: asset.resourceType,
    format: asset.format,
    originalFilename: asset.originalFilename,
    mimeType: asset.mimeType,
    bytes: asset.bytes,
    width: asset.width,
    height: asset.height,
    altText: asset.altText,
    category: asset.category,
    tags: asset.tags,
    createdBy: asset.createdBy,
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt,
  };
}

export async function uploadAsset(
  file: { buffer: Buffer; originalname: string; size: number },
  createdBy: string,
  metadata: { altText?: string; category: string; tags: string[]; resourceType: "image" | "video" | "raw"; mimeType: string }
) {
  const stored: StoredMedia = await mediaProvider.upload({
    buffer: file.buffer,
    filename: file.originalname,
    resourceType: metadata.resourceType,
  });

  const asset = await repository.createAsset({
    provider: stored.provider,
    publicId: stored.publicId,
    secureUrl: stored.secureUrl,
    resourceType: stored.resourceType,
    format: stored.format,
    originalFilename: file.originalname,
    mimeType: metadata.mimeType,
    bytes: stored.bytes || file.size,
    width: stored.width,
    height: stored.height,
    altText: metadata.altText,
    category: metadata.category,
    tags: metadata.tags,
    createdBy,
  });
  return asset ? toAssetResponse(asset) : null;
}

export async function getPlacement(key: string) {
  const result = await repository.findPlacementByKey(key);
  if (!result) throw AppError.notFound("Media placement not found", "MEDIA_PLACEMENT_NOT_FOUND");
  return { key: result.placement.key, asset: result.asset ? toAssetResponse(result.asset) : null };
}

export async function listPlacements(keys?: string[]) {
  const rows = await repository.listPlacements(keys);
  return rows.map(({ placement, asset }) => ({
    key: placement.key,
    asset: asset ? toAssetResponse(asset) : null,
  }));
}

export async function assignAsset(key: string, assetId: string, assignedBy: string, altText?: string) {
  const placement = await repository.findPlacementByKey(key);
  if (!placement) throw AppError.notFound("Media placement not found", "MEDIA_PLACEMENT_NOT_FOUND");

  const asset = await repository.findAssetById(assetId);
  if (!asset) throw AppError.notFound("Media asset not found", "MEDIA_ASSET_NOT_FOUND");

  if (altText !== undefined) await repository.updateAsset(assetId, { altText });
  await repository.assignAsset(key, assetId, assignedBy);
  return getPlacement(key);
}

export async function listAssets(filters: ListMediaQuery) {
  const result = await repository.listAssets(filters);
  return { data: result.rows.map(toAssetResponse), total: result.total };
}

export async function getAsset(id: string) {
  const asset = await repository.findAssetById(id);
  if (!asset) throw AppError.notFound("Media asset not found", "MEDIA_ASSET_NOT_FOUND");
  return toAssetResponse(asset);
}

export async function updateAsset(id: string, input: UpdateMediaInput) {
  const asset = await repository.findAssetById(id);
  if (!asset) throw AppError.notFound("Media asset not found", "MEDIA_ASSET_NOT_FOUND");
  const updated = await repository.updateAsset(id, input);
  return updated ? toAssetResponse(updated) : null;
}

export async function deleteAsset(id: string) {
  const asset = await repository.findAssetById(id);
  if (!asset) throw AppError.notFound("Media asset not found", "MEDIA_ASSET_NOT_FOUND");

  const references = await repository.findAssetReferences(id);
  if (references.length > 0) {
    throw AppError.conflict("Media asset is still referenced", "MEDIA_ASSET_IN_USE", { references });
  }

  await mediaProvider.delete(asset.publicId, asset.resourceType);
  await repository.deleteAsset(id);
}
