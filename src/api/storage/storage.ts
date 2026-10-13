import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import { z } from "zod/v4";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "../../generated";
import { ObjectStorageService, ObjectNotFoundError } from "../../lib/images/objectStorage";
import {
  canAccessPrivateObject,
  isUserUploadKey,
  normalizeStorageObjectPath,
  s3KeyFromObjectPath,
} from "../../lib/images/privateObjectAccess";
import { sendError, sendSuccess } from "../../lib/http/api-response";
import { requireAuth } from "../../middlewares/auth";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

/**
 * POST /storage/uploads/request-url
 *
 * Request a presigned URL for file upload.
 * The client sends JSON metadata (name, size, contentType) — NOT the file.
 * Then uploads the file directly to the returned presigned URL.
 */
router.post("/storage/uploads/request-url", requireAuth, async (req: Request, res: Response) => {
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, "Missing or invalid required fields");
    return;
  }

  try {
    const auth = req.auth!;
    const { name, size, contentType } = parsed.data;

    const uploadURL = await objectStorageService.getObjectEntityUploadURL(auth.userId);
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

    sendSuccess(
      res,
      RequestUploadUrlResponse.parse({
        uploadURL,
        objectPath,
        metadata: { name, size, contentType },
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Error generating upload URL");
    sendError(res, 500, "Failed to generate upload URL");
  }
});

const CompleteUploadBody = z.object({
  objectPath: z.string().min(1),
});

/**
 * POST /storage/uploads/complete
 *
 * Called after the client PUTs to the presigned URL. Stamps the object with
 * an ACL policy so GET /storage/objects/* can enforce per-user access.
 */
router.post("/storage/uploads/complete", requireAuth, async (req: Request, res: Response) => {
  const parsed = CompleteUploadBody.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, "Missing or invalid objectPath");
    return;
  }

  try {
    const auth = req.auth!;
    const objectPath = normalizeStorageObjectPath(parsed.data.objectPath);
    const key = s3KeyFromObjectPath(objectPath);

    if (!isUserUploadKey(key)) {
      sendError(res, 400, "Invalid upload path");
      return;
    }

    const expectedPrefix = `uploads/${auth.userId}/`;
    if (!key.startsWith(expectedPrefix)) {
      sendError(res, 403, "You do not have access to this upload");
      return;
    }

    const normalizedPath = await objectStorageService.trySetObjectEntityAclPolicy(objectPath, {
      owner: auth.userId,
      visibility: "private",
    });

    sendSuccess(res, { objectPath: normalizedPath });
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      sendError(res, 404, "Upload not found — finish the PUT before completing");
      return;
    }
    req.log.error({ err: error }, "Error completing upload");
    sendError(res, 500, "Failed to finalize upload");
  }
});

/**
 * GET /storage/public-objects/*
 *
 * Serve public assets from PUBLIC_OBJECT_SEARCH_PATHS.
 * These are unconditionally public — no authentication or ACL checks.
 * IMPORTANT: Always provide this endpoint when object storage is set up.
 */
router.get("/storage/public-objects/*filePath", async (req: Request, res: Response) => {
  try {
    const raw = req.params.filePath;
    const filePath = Array.isArray(raw) ? raw.join("/") : raw;
    const file = await objectStorageService.searchPublicObject(filePath);
    if (!file) {
      sendError(res, 404, "File not found");
      return;
    }

    const response = await objectStorageService.downloadObject(file);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    req.log.error({ err: error }, "Error serving public object");
    sendError(res, 500, "Failed to serve public object");
  }
});

/**
 * GET /storage/objects/*
 *
 * Serve object entities from PRIVATE_OBJECT_DIR.
 * These are served from a separate path from /public-objects and can optionally
 * be protected with authentication or ACL checks based on the use case.
 */
router.get("/storage/objects/*path", requireAuth, async (req: Request, res: Response) => {
  try {
    const auth = req.auth!;
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    const objectPath = normalizeStorageObjectPath(`/objects/${wildcardPath}`);
    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);

    const canAccess = await canAccessPrivateObject(auth, objectFile, objectPath);
    if (!canAccess) {
      sendError(res, 403, "You do not have access to this object");
      return;
    }

    const response = await objectStorageService.downloadObject(objectFile);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      req.log.warn({ err: error }, "Object not found");
      sendError(res, 404, "Object not found");
      return;
    }
    req.log.error({ err: error }, "Error serving object");
    sendError(res, 500, "Failed to serve object");
  }
});

export default router;
