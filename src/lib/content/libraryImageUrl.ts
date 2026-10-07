import type { ObjectStorageService } from "../images/objectStorage";

/**
 * URL for displaying a library image in student sessions.
 * Prefers a presigned S3 URL; falls back to an authenticated API proxy when S3 signing fails.
 */
export async function resolveLibraryImageDisplayUrl(
  storage: ObjectStorageService,
  params: { libraryImageId: string; s3Key: string; mediumKey?: string | null },
): Promise<string | null> {
  const key = params.mediumKey?.trim() || params.s3Key?.trim();
  if (!key) return null;

  try {
    return await storage.getPresignedGetUrl(key, 3600);
  } catch {
    return `/api/library/images/${params.libraryImageId}/file`;
  }
}
