import {
  S3Client,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Readable } from "stream";
import { randomUUID } from "crypto";
import {
  ObjectAclPolicy,
  ObjectPermission,
  canAccessObject,
  getObjectAclPolicy,
  setObjectAclPolicy,
  type S3ObjectRef,
} from "./objectAcl";

// ---------------------------------------------------------------------------
// S3 client — lazy singleton; re-created on server restart (which happens
// automatically when env vars are added/changed in Replit).
// ---------------------------------------------------------------------------

let _s3: S3Client | null = null;

function getS3(): S3Client {
  if (!_s3) {
    _s3 = new S3Client({
      region: process.env.AWS_REGION ?? "us-east-1",
      ...(process.env.AWS_ACCESS_KEY_ID
        ? {
            credentials: {
              accessKeyId: process.env.AWS_ACCESS_KEY_ID,
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
            },
          }
        : {}),
    });
  }
  return _s3;
}

function requireBucket(): string {
  const name = process.env.S3_BUCKET_NAME;
  if (!name) {
    throw new Error(
      "S3_BUCKET_NAME is not set. Add it to your Replit environment variables."
    );
  }
  return name;
}

/** Key prefix for all user-uploaded private objects. */
const UPLOADS_PREFIX = "uploads";
/** Key prefix for public static assets served without authentication. */
const PUBLIC_PREFIX = "public";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ObjectStorageService {
  /**
   * Generate a short-lived presigned PUT URL for a new private upload.
   * Returns the full S3 presigned URL; call normalizeObjectEntityPath() on it
   * to get the canonical /objects/<key> internal path.
   */
  async getObjectEntityUploadURL(): Promise<string> {
    const s3 = getS3();
    const bucket = requireBucket();
    const key = `${UPLOADS_PREFIX}/${randomUUID()}`;
    const command = new PutObjectCommand({ Bucket: bucket, Key: key });
    return getSignedUrl(s3, command, { expiresIn: 900 }); // 15 min
  }

  /**
   * Convert a raw S3 presigned URL → canonical /objects/<key> internal path.
   * If the value is already an internal path it is returned unchanged.
   */
  normalizeObjectEntityPath(rawPath: string): string {
    try {
      const url = new URL(rawPath);
      if (url.hostname.endsWith("amazonaws.com")) {
        const bucket = requireBucket();
        // Virtual-hosted style: https://<bucket>.s3.<region>.amazonaws.com/<key>
        // Path style:           https://s3.<region>.amazonaws.com/<bucket>/<key>
        const key = url.hostname.startsWith(`${bucket}.`)
          ? url.pathname.slice(1)                       // strip leading /
          : url.pathname.slice(bucket.length + 2);      // strip /<bucket>/
        return `/objects/${key}`;
      }
    } catch {
      // rawPath is not a URL — fall through
    }
    return rawPath;
  }

  /**
   * Search for a public asset at PUBLIC_PREFIX/<filePath> in the bucket.
   * Returns an S3ObjectRef or null if not found.
   */
  async searchPublicObject(filePath: string): Promise<S3ObjectRef | null> {
    const s3 = getS3();
    const bucket = requireBucket();
    const key = `${PUBLIC_PREFIX}/${filePath}`;
    try {
      await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return { bucket, key };
    } catch {
      return null;
    }
  }

  /**
   * Stream an S3 object as a fetch-compatible Response, preserving
   * Content-Type and adding appropriate Cache-Control headers.
   */
  async downloadObject(
    file: S3ObjectRef,
    cacheTtlSec: number = 3600
  ): Promise<Response> {
    const s3 = getS3();
    const aclPolicy = await getObjectAclPolicy(file);
    const isPublic = aclPolicy?.visibility === "public";

    const resp = await s3.send(
      new GetObjectCommand({ Bucket: file.bucket, Key: file.key })
    );
    if (!resp.Body) {
      throw new ObjectNotFoundError();
    }

    // AWS SDK v3 Body is a Readable in Node.js
    const nodeStream = resp.Body as Readable;
    const webStream = Readable.toWeb(nodeStream) as ReadableStream;

    const headers: Record<string, string> = {
      "Content-Type": resp.ContentType ?? "application/octet-stream",
      "Cache-Control": `${isPublic ? "public" : "private"}, max-age=${cacheTtlSec}`,
    };
    if (resp.ContentLength) {
      headers["Content-Length"] = String(resp.ContentLength);
    }

    return new Response(webStream, { headers });
  }

  /**
   * Resolve an internal /objects/<key> path to an S3ObjectRef,
   * verifying the object exists.
   */
  async getObjectEntityFile(objectPath: string): Promise<S3ObjectRef> {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }
    const s3 = getS3();
    const bucket = requireBucket();
    const key = objectPath.slice("/objects/".length);

    try {
      await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    } catch {
      throw new ObjectNotFoundError();
    }

    return { bucket, key };
  }

  /**
   * Set ACL metadata on an object identified by its raw upload URL or
   * internal /objects/ path. Returns the canonical internal path.
   */
  async trySetObjectEntityAclPolicy(
    rawPath: string,
    aclPolicy: ObjectAclPolicy
  ): Promise<string> {
    const normalizedPath = this.normalizeObjectEntityPath(rawPath);
    if (!normalizedPath.startsWith("/")) {
      return normalizedPath;
    }

    const objectFile = await this.getObjectEntityFile(normalizedPath);
    await setObjectAclPolicy(objectFile, aclPolicy);
    return normalizedPath;
  }

  /**
   * Upload a raw Buffer directly to S3 (server-side), auto-generating a UUID key.
   * Useful when the image is already in memory (e.g. base64 from a request body)
   * and we want to persist it without a browser round-trip presigned PUT.
   */
  async uploadBuffer(
    buffer: Buffer,
    contentType: string,
    prefix: string = UPLOADS_PREFIX
  ): Promise<{ key: string; sizeBytes: number }> {
    const key = `${prefix}/${randomUUID()}`;
    return this.uploadBufferWithKey(buffer, contentType, key);
  }

  /**
   * Upload a raw Buffer to S3 under an explicit key (no UUID generation).
   * Use when you need predictable, paired keys (e.g. thumbnail + medium variants
   * that mirror the original's UUID).
   */
  async uploadBufferWithKey(
    buffer: Buffer,
    contentType: string,
    key: string
  ): Promise<{ key: string; sizeBytes: number }> {
    const s3 = getS3();
    const bucket = requireBucket();
    await s3.send(
      new PutObjectCommand({ Bucket: bucket, Key: key, Body: buffer, ContentType: contentType })
    );
    return { key, sizeBytes: buffer.byteLength };
  }

  /**
   * Generate a short-lived presigned GET URL for any S3 key.
   * Pass this to the frontend so it can display or download the file
   * directly from S3 without routing through the server.
   */
  async getPresignedGetUrl(s3Key: string, ttlSec = 3600): Promise<string> {
    const s3 = getS3();
    const bucket = requireBucket();
    const command = new GetObjectCommand({ Bucket: bucket, Key: s3Key });
    return getSignedUrl(s3, command, { expiresIn: ttlSec });
  }

  /**
   * Delete an object from S3 by its key.
   */
  /**
   * Download an S3 object and return its raw bytes as a Buffer.
   * Used for feeding image data to vision APIs (e.g. Claude Vision).
   */
  async getImageBuffer(s3Key: string): Promise<{ buffer: Buffer; contentType: string }> {
    const s3     = getS3();
    const bucket = requireBucket();
    const resp   = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: s3Key }));
    if (!resp.Body) throw new ObjectNotFoundError();
    const chunks: Uint8Array[] = [];
    for await (const chunk of resp.Body as Readable) {
      chunks.push(chunk as Uint8Array);
    }
    return {
      buffer:      Buffer.concat(chunks),
      contentType: resp.ContentType ?? "image/jpeg",
    };
  }

  async deleteObject(s3Key: string): Promise<void> {
    const s3 = getS3();
    const bucket = requireBucket();
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: s3Key }));
  }

  async canAccessObjectEntity({
    userId,
    objectFile,
    requestedPermission,
  }: {
    userId?: string;
    objectFile: S3ObjectRef;
    requestedPermission?: ObjectPermission;
  }): Promise<boolean> {
    return canAccessObject({
      userId,
      objectFile,
      requestedPermission: requestedPermission ?? ObjectPermission.READ,
    });
  }
}
