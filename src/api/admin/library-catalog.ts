/**
 * Admin routes — image library catalog (content categories, topics, assignments).
 *
 * Hierarchy:  Content Category  →  Topic  →  Library images (via library_topics join)
 *
 * All routes sit under /api/admin/library/* and require requireAuth + requireSuperAdmin.
 * Mounted from admin.ts — guards must stay here so a separate mount cannot skip them.
 *
 * Route map:
 *   GET    /api/admin/library/content-categories
 *   POST   /api/admin/library/content-categories
 *   PATCH  /api/admin/library/content-categories/:contentCategoryId
 *   DELETE /api/admin/library/content-categories/:contentCategoryId
 *
 *   GET    /api/admin/library/content-categories/:contentCategoryId/topics
 *   POST   /api/admin/library/content-categories/:contentCategoryId/topics
 *
 *   GET    /api/admin/library/topics
 *   PATCH  /api/admin/library/topics/:topicId
 *   DELETE /api/admin/library/topics/:topicId
 *
 *   GET    /api/admin/library/topics/:topicId/images
 *   POST   /api/admin/library/topics/:topicId/images      body: { libraryImageIds: string[] }
 *   DELETE /api/admin/library/topics/:topicId/images/:libraryImageId
 *
 *   GET    /api/admin/library/images/:libraryImageId/topic-assignments
 *   PUT    /api/admin/library/images/:libraryImageId/topic-assignments  body: { topicIds: string[] }
 */

import { Router, type IRouter } from "express";
import { eq, count, asc, and, desc } from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "../../../db";
import {
  contentCategoriesTable,
  topicsTable,
  libraryTopicsTable,
  libraryTable,
} from "../../../db/schema";
import { sendError, sendSuccess } from "../../lib/http/api-response";
import { ObjectStorageService } from "../../lib/images/objectStorage";
import { logger } from "../../config/logger";
import { requireAuth, requireSuperAdmin } from "../../middlewares/auth";

const router: IRouter = Router();
const storage = new ObjectStorageService();

router.use("/admin", requireAuth, requireSuperAdmin);

function slugify(text: string): string {
  return text.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// ── Flat topic list ───────────────────────────────────────────────────────────

router.get("/admin/library/topics", async (_req, res): Promise<void> => {
  try {
    const topics = await db
      .select({
        id:                  topicsTable.id,
        name:                topicsTable.name,
        slug:                topicsTable.slug,
        contentCategoryId:   topicsTable.contentCategoryId,
        contentCategoryName: contentCategoriesTable.name,
        displayOrder:        topicsTable.displayOrder,
        isActive:            topicsTable.isActive,
      })
      .from(topicsTable)
      .innerJoin(contentCategoriesTable, eq(contentCategoriesTable.id, topicsTable.contentCategoryId))
      .orderBy(asc(contentCategoriesTable.displayOrder), asc(topicsTable.displayOrder));
    sendSuccess(res, { topics });
  } catch (err) {
    logger.error({ err }, "admin/library/topics: flat list failed");
    sendError(res, 500, "Failed to fetch library topics");
  }
});

// ── Library image ↔ topic assignments ─────────────────────────────────────────

router.get("/admin/library/images/:libraryImageId/topic-assignments", async (req, res): Promise<void> => {
  const { libraryImageId } = req.params;
  try {
    const rows = await db
      .select({ topicId: libraryTopicsTable.topicId })
      .from(libraryTopicsTable)
      .where(eq(libraryTopicsTable.libraryId, libraryImageId));
    sendSuccess(res, { topicIds: rows.map((r) => r.topicId) });
  } catch (err) {
    logger.error({ err }, "admin/library/images: get topic assignments failed");
    sendError(res, 500, "Failed to fetch image topic assignments");
  }
});

router.put("/admin/library/images/:libraryImageId/topic-assignments", async (req, res): Promise<void> => {
  const { libraryImageId } = req.params;
  const parsed = z.object({ topicIds: z.array(z.string().uuid()) }).safeParse(req.body);
  if (!parsed.success) { sendError(res, 400, "Invalid request body"); return; }

  try {
    const [lib] = await db
      .select({ id: libraryTable.id })
      .from(libraryTable)
      .where(eq(libraryTable.id, libraryImageId))
      .limit(1);
    if (!lib) { sendError(res, 404, "Library image not found"); return; }

    await db.delete(libraryTopicsTable).where(eq(libraryTopicsTable.libraryId, libraryImageId));
    if (parsed.data.topicIds.length > 0) {
      await db.insert(libraryTopicsTable).values(
        parsed.data.topicIds.map((topicId) => ({ libraryId: libraryImageId, topicId })),
      );
    }
    sendSuccess(res, { assigned: parsed.data.topicIds.length });
  } catch (err) {
    logger.error({ err }, "admin/library/images: set topic assignments failed");
    sendError(res, 500, "Failed to update image topic assignments");
  }
});

// ── Content categories ────────────────────────────────────────────────────────

router.get("/admin/library/content-categories", async (_req, res): Promise<void> => {
  try {
    const contentCategories = await db
      .select({
        id:           contentCategoriesTable.id,
        name:         contentCategoriesTable.name,
        slug:         contentCategoriesTable.slug,
        description:  contentCategoriesTable.description,
        displayOrder: contentCategoriesTable.displayOrder,
        isActive:     contentCategoriesTable.isActive,
        createdAt:    contentCategoriesTable.createdAt,
        topicCount:   count(topicsTable.id),
      })
      .from(contentCategoriesTable)
      .leftJoin(topicsTable, eq(topicsTable.contentCategoryId, contentCategoriesTable.id))
      .groupBy(contentCategoriesTable.id)
      .orderBy(asc(contentCategoriesTable.displayOrder), asc(contentCategoriesTable.name));
    sendSuccess(res, { contentCategories });
  } catch (err) {
    logger.error({ err }, "admin/library/content-categories: list failed");
    sendError(res, 500, "Failed to fetch content categories");
  }
});

const ContentCategorySchema = z.object({
  name:         z.string().min(1).max(100),
  slug:         z.string().min(1).max(100).regex(/^[a-z0-9-]+$/).optional(),
  description:  z.string().max(500).optional(),
  displayOrder: z.number().int().min(0).optional(),
  isActive:     z.boolean().optional(),
});

router.post("/admin/library/content-categories", async (req, res): Promise<void> => {
  const parsed = ContentCategorySchema.safeParse(req.body);
  if (!parsed.success) { sendError(res, 400, "Invalid request body"); return; }
  const { name, slug, description, displayOrder, isActive } = parsed.data;
  try {
    const [contentCategory] = await db.insert(contentCategoriesTable).values({
      name,
      slug:         slug ?? slugify(name),
      description:  description ?? null,
      displayOrder: displayOrder ?? 0,
      isActive:     isActive ?? true,
    }).returning();
    sendSuccess(res, { contentCategory }, 201);
  } catch (err: any) {
    if (err.code === "23505") { sendError(res, 409, "A content category with this slug already exists"); return; }
    logger.error({ err }, "admin/library/content-categories: create failed");
    sendError(res, 500, "Failed to create content category");
  }
});

router.patch("/admin/library/content-categories/:contentCategoryId", async (req, res): Promise<void> => {
  const { contentCategoryId } = req.params;
  const parsed = ContentCategorySchema.partial().safeParse(req.body);
  if (!parsed.success) { sendError(res, 400, "Invalid request body"); return; }
  const updates = parsed.data;
  if (updates.name && !updates.slug) updates.slug = slugify(updates.name);
  try {
    const [contentCategory] = await db
      .update(contentCategoriesTable)
      .set(updates)
      .where(eq(contentCategoriesTable.id, contentCategoryId))
      .returning();
    if (!contentCategory) { sendError(res, 404, "Content category not found"); return; }
    sendSuccess(res, { contentCategory });
  } catch (err: any) {
    if (err.code === "23505") { sendError(res, 409, "A content category with this slug already exists"); return; }
    logger.error({ err }, "admin/library/content-categories: update failed");
    sendError(res, 500, "Failed to update content category");
  }
});

router.delete("/admin/library/content-categories/:contentCategoryId", async (req, res): Promise<void> => {
  const { contentCategoryId } = req.params;
  try {
    const [row] = await db
      .delete(contentCategoriesTable)
      .where(eq(contentCategoriesTable.id, contentCategoryId))
      .returning({ id: contentCategoriesTable.id });
    if (!row) { sendError(res, 404, "Content category not found"); return; }
    sendSuccess(res, { deleted: true });
  } catch (err) {
    logger.error({ err }, "admin/library/content-categories: delete failed");
    sendError(res, 500, "Failed to delete content category");
  }
});

// ── Topics under a content category ───────────────────────────────────────────

router.get("/admin/library/content-categories/:contentCategoryId/topics", async (req, res): Promise<void> => {
  const { contentCategoryId } = req.params;
  try {
    const topics = await db
      .select({
        id:                topicsTable.id,
        contentCategoryId: topicsTable.contentCategoryId,
        name:              topicsTable.name,
        slug:              topicsTable.slug,
        description:       topicsTable.description,
        displayOrder:      topicsTable.displayOrder,
        isActive:          topicsTable.isActive,
        createdAt:         topicsTable.createdAt,
        imageCount:        count(libraryTopicsTable.libraryId),
      })
      .from(topicsTable)
      .leftJoin(libraryTopicsTable, eq(libraryTopicsTable.topicId, topicsTable.id))
      .where(eq(topicsTable.contentCategoryId, contentCategoryId))
      .groupBy(topicsTable.id)
      .orderBy(asc(topicsTable.displayOrder), asc(topicsTable.name));
    sendSuccess(res, { topics });
  } catch (err) {
    logger.error({ err }, "admin/library/content-categories: list topics failed");
    sendError(res, 500, "Failed to fetch topics for content category");
  }
});

const TopicSchema = z.object({
  name:         z.string().min(1).max(100),
  slug:         z.string().min(1).max(100).regex(/^[a-z0-9-]+$/).optional(),
  description:  z.string().max(500).optional(),
  displayOrder: z.number().int().min(0).optional(),
  isActive:     z.boolean().optional(),
});

router.post("/admin/library/content-categories/:contentCategoryId/topics", async (req, res): Promise<void> => {
  const { contentCategoryId } = req.params;
  const [category] = await db
    .select({ id: contentCategoriesTable.id })
    .from(contentCategoriesTable)
    .where(eq(contentCategoriesTable.id, contentCategoryId))
    .limit(1);
  if (!category) { sendError(res, 404, "Content category not found"); return; }

  const parsed = TopicSchema.safeParse(req.body);
  if (!parsed.success) { sendError(res, 400, "Invalid request body"); return; }
  const { name, slug, description, displayOrder, isActive } = parsed.data;
  try {
    const [topic] = await db.insert(topicsTable).values({
      contentCategoryId,
      name,
      slug:         slug ?? slugify(name),
      description:  description ?? null,
      displayOrder: displayOrder ?? 0,
      isActive:     isActive ?? true,
    }).returning();
    sendSuccess(res, { topic }, 201);
  } catch (err: any) {
    if (err.code === "23505") { sendError(res, 409, "A topic with this slug already exists in this content category"); return; }
    logger.error({ err }, "admin/library/content-categories: create topic failed");
    sendError(res, 500, "Failed to create library topic");
  }
});

router.patch("/admin/library/topics/:topicId", async (req, res): Promise<void> => {
  const { topicId } = req.params;
  const parsed = TopicSchema.partial().safeParse(req.body);
  if (!parsed.success) { sendError(res, 400, "Invalid request body"); return; }
  const updates = parsed.data;
  if (updates.name && !updates.slug) updates.slug = slugify(updates.name);
  try {
    const [topic] = await db.update(topicsTable).set(updates).where(eq(topicsTable.id, topicId)).returning();
    if (!topic) { sendError(res, 404, "Library topic not found"); return; }
    sendSuccess(res, { topic });
  } catch (err: any) {
    if (err.code === "23505") { sendError(res, 409, "A topic with this slug already exists in this content category"); return; }
    logger.error({ err }, "admin/library/topics: update failed");
    sendError(res, 500, "Failed to update library topic");
  }
});

router.delete("/admin/library/topics/:topicId", async (req, res): Promise<void> => {
  const { topicId } = req.params;
  try {
    const [row] = await db.delete(topicsTable).where(eq(topicsTable.id, topicId)).returning({ id: topicsTable.id });
    if (!row) { sendError(res, 404, "Library topic not found"); return; }
    sendSuccess(res, { deleted: true });
  } catch (err) {
    logger.error({ err }, "admin/library/topics: delete failed");
    sendError(res, 500, "Failed to delete library topic");
  }
});

// ── Topic ↔ image assignment ──────────────────────────────────────────────────

router.get("/admin/library/topics/:topicId/images", async (req, res): Promise<void> => {
  const { topicId } = req.params;
  const limit  = Math.min(Number(req.query.limit  ?? 20), 100);
  const offset = Number(req.query.offset ?? 0);
  try {
    const [rows, [{ total }]] = await Promise.all([
      db.select({
        id:          libraryTable.id,
        s3Key:       libraryTable.s3Key,
        contentType: libraryTable.contentType,
        sizeBytes:   libraryTable.sizeBytes,
        tags:        libraryTable.tags,
        description: libraryTable.description,
        sortOrder:   libraryTopicsTable.sortOrder,
        addedAt:     libraryTopicsTable.addedAt,
      })
        .from(libraryTopicsTable)
        .innerJoin(libraryTable, eq(libraryTable.id, libraryTopicsTable.libraryId))
        .where(eq(libraryTopicsTable.topicId, topicId))
        .orderBy(asc(libraryTopicsTable.sortOrder), asc(libraryTopicsTable.addedAt))
        .limit(limit)
        .offset(offset),
      db.select({ total: count() }).from(libraryTopicsTable).where(eq(libraryTopicsTable.topicId, topicId)),
    ]);

    const items = await Promise.all(
      rows.map(async (r) => ({
        ...r,
        imageUrl: await storage.getPresignedGetUrl(r.s3Key, 3600).catch(() => null),
      })),
    );

    sendSuccess(res, { items, total, limit, offset });
  } catch (err) {
    logger.error({ err }, "admin/library/topics: list images failed");
    sendError(res, 500, "Failed to fetch images assigned to topic");
  }
});

const AssignImagesSchema = z.object({
  libraryImageIds: z.array(z.string().uuid()).min(1).max(50),
});

router.post("/admin/library/topics/:topicId/images", async (req, res): Promise<void> => {
  const { topicId } = req.params;
  const [topic] = await db.select({ id: topicsTable.id }).from(topicsTable).where(eq(topicsTable.id, topicId)).limit(1);
  if (!topic) { sendError(res, 404, "Library topic not found"); return; }

  const parsed = AssignImagesSchema.safeParse(req.body);
  if (!parsed.success) { sendError(res, 400, "Invalid request body"); return; }

  try {
    await db
      .insert(libraryTopicsTable)
      .values(parsed.data.libraryImageIds.map((libraryId) => ({ libraryId, topicId })))
      .onConflictDoNothing();
    sendSuccess(res, { assigned: parsed.data.libraryImageIds.length });
  } catch (err) {
    logger.error({ err }, "admin/library/topics: assign images failed");
    sendError(res, 500, "Failed to assign images to topic");
  }
});

router.delete("/admin/library/topics/:topicId/images/:libraryImageId", async (req, res): Promise<void> => {
  const { topicId, libraryImageId } = req.params;
  try {
    await db.delete(libraryTopicsTable).where(
      and(eq(libraryTopicsTable.topicId, topicId), eq(libraryTopicsTable.libraryId, libraryImageId)),
    );
    sendSuccess(res, { removed: true });
  } catch (err) {
    logger.error({ err }, "admin/library/topics: remove image failed");
    sendError(res, 500, "Failed to remove image from topic");
  }
});

export default router;
