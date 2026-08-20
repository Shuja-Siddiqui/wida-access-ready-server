/**
 * Admin routes — Themes, Topics, and Topic-Image assignment.
 *
 * Hierarchy:  Theme  →  Topic  →  Library images (via library_topics join)
 *
 * All routes sit under /api/admin/* and inherit the requireAuth +
 * requireSuperAdmin guards applied at the parent router level in admin.ts.
 *
 * Route map:
 *   GET    /api/admin/themes
 *   POST   /api/admin/themes
 *   PATCH  /api/admin/themes/:themeId
 *   DELETE /api/admin/themes/:themeId
 *
 *   GET    /api/admin/themes/:themeId/topics
 *   POST   /api/admin/themes/:themeId/topics
 *   PATCH  /api/admin/topics/:topicId
 *   DELETE /api/admin/topics/:topicId
 *
 *   GET    /api/admin/topics/:topicId/images
 *   POST   /api/admin/topics/:topicId/images      body: { libraryIds: string[] }
 *   DELETE /api/admin/topics/:topicId/images/:libraryId
 */

import { Router, type IRouter } from "express";
import { eq, count, asc, and, desc } from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "../../../db";
import {
  themesTable,
  topicsTable,
  libraryTopicsTable,
  libraryTable,
} from "../../../db/schema";
import { sendError, sendSuccess } from "../../lib/api-response";
import { ObjectStorageService } from "../../lib/objectStorage";
import { logger } from "../../config/logger";

const router: IRouter = Router();
const storage = new ObjectStorageService();

// ── Shared util ───────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// ── All topics (flat list) ────────────────────────────────────────────────────

// GET /api/admin/topics — flat list of all active topics with parent theme info
router.get("/admin/topics", async (_req, res): Promise<void> => {
  try {
    const topics = await db
      .select({
        id:           topicsTable.id,
        name:         topicsTable.name,
        slug:         topicsTable.slug,
        themeId:      topicsTable.themeId,
        themeName:    themesTable.name,
        displayOrder: topicsTable.displayOrder,
        isActive:     topicsTable.isActive,
      })
      .from(topicsTable)
      .innerJoin(themesTable, eq(themesTable.id, topicsTable.themeId))
      .orderBy(asc(themesTable.displayOrder), asc(topicsTable.displayOrder));
    sendSuccess(res, { topics });
  } catch (err) {
    logger.error({ err }, "admin/topics: flat list failed");
    sendError(res, 500, "Failed to fetch topics");
  }
});

// ── Library image ↔ topic assignment ─────────────────────────────────────────

// GET /api/admin/library/:libraryId/topics — topic IDs currently assigned to an image
router.get("/admin/library/:libraryId/topics", async (req, res): Promise<void> => {
  const { libraryId } = req.params;
  try {
    const rows = await db
      .select({ topicId: libraryTopicsTable.topicId })
      .from(libraryTopicsTable)
      .where(eq(libraryTopicsTable.libraryId, libraryId));
    sendSuccess(res, { topicIds: rows.map((r) => r.topicId) });
  } catch (err) {
    logger.error({ err }, "admin/library: get topics failed");
    sendError(res, 500, "Failed to fetch image topics");
  }
});

// PUT /api/admin/library/:libraryId/topics — replace all topic assignments for an image
router.put("/admin/library/:libraryId/topics", async (req, res): Promise<void> => {
  const { libraryId } = req.params;
  const parsed = z.object({ topicIds: z.array(z.string().uuid()) }).safeParse(req.body);
  if (!parsed.success) { sendError(res, 400, "Invalid request body"); return; }

  try {
    const [lib] = await db
      .select({ id: libraryTable.id })
      .from(libraryTable)
      .where(eq(libraryTable.id, libraryId))
      .limit(1);
    if (!lib) { sendError(res, 404, "Image not found"); return; }

    await db.delete(libraryTopicsTable).where(eq(libraryTopicsTable.libraryId, libraryId));
    if (parsed.data.topicIds.length > 0) {
      await db.insert(libraryTopicsTable).values(
        parsed.data.topicIds.map((topicId) => ({ libraryId, topicId })),
      );
    }
    sendSuccess(res, { assigned: parsed.data.topicIds.length });
  } catch (err) {
    logger.error({ err }, "admin/library: set topics failed");
    sendError(res, 500, "Failed to update image topics");
  }
});

// ── Themes ─────────────────────────────────────────────────────────────────────

// GET /api/admin/themes — list all themes with topic count
router.get("/admin/themes", async (_req, res): Promise<void> => {
  try {
    const themes = await db
      .select({
        id:           themesTable.id,
        name:         themesTable.name,
        slug:         themesTable.slug,
        description:  themesTable.description,
        displayOrder: themesTable.displayOrder,
        isActive:     themesTable.isActive,
        createdAt:    themesTable.createdAt,
        topicCount:   count(topicsTable.id),
      })
      .from(themesTable)
      .leftJoin(topicsTable, eq(topicsTable.themeId, themesTable.id))
      .groupBy(themesTable.id)
      .orderBy(asc(themesTable.displayOrder), asc(themesTable.name));
    sendSuccess(res, { themes });
  } catch (err) {
    logger.error({ err }, "admin/themes: list failed");
    sendError(res, 500, "Failed to fetch themes");
  }
});

const ThemeSchema = z.object({
  name:         z.string().min(1).max(100),
  slug:         z.string().min(1).max(100).regex(/^[a-z0-9-]+$/).optional(),
  description:  z.string().max(500).optional(),
  displayOrder: z.number().int().min(0).optional(),
  isActive:     z.boolean().optional(),
});

// POST /api/admin/themes — create theme
router.post("/admin/themes", async (req, res): Promise<void> => {
  const parsed = ThemeSchema.safeParse(req.body);
  if (!parsed.success) { sendError(res, 400, "Invalid request body"); return; }
  const { name, slug, description, displayOrder, isActive } = parsed.data;
  try {
    const [theme] = await db.insert(themesTable).values({
      name,
      slug:         slug ?? slugify(name),
      description:  description ?? null,
      displayOrder: displayOrder ?? 0,
      isActive:     isActive ?? true,
    }).returning();
    sendSuccess(res, { theme }, 201);
  } catch (err: any) {
    if (err.code === "23505") { sendError(res, 409, "A theme with this slug already exists"); return; }
    logger.error({ err }, "admin/themes: create failed");
    sendError(res, 500, "Failed to create theme");
  }
});

// PATCH /api/admin/themes/:themeId — update theme
router.patch("/admin/themes/:themeId", async (req, res): Promise<void> => {
  const { themeId } = req.params;
  const parsed = ThemeSchema.partial().safeParse(req.body);
  if (!parsed.success) { sendError(res, 400, "Invalid request body"); return; }
  const updates = parsed.data;
  // Auto-derive slug from name only when name changed without explicit slug
  if (updates.name && !updates.slug) updates.slug = slugify(updates.name);
  try {
    const [theme] = await db.update(themesTable).set(updates).where(eq(themesTable.id, themeId)).returning();
    if (!theme) { sendError(res, 404, "Theme not found"); return; }
    sendSuccess(res, { theme });
  } catch (err: any) {
    if (err.code === "23505") { sendError(res, 409, "A theme with this slug already exists"); return; }
    logger.error({ err }, "admin/themes: update failed");
    sendError(res, 500, "Failed to update theme");
  }
});

// DELETE /api/admin/themes/:themeId — delete theme (cascades to topics + library_topics)
router.delete("/admin/themes/:themeId", async (req, res): Promise<void> => {
  const { themeId } = req.params;
  try {
    const [row] = await db.delete(themesTable).where(eq(themesTable.id, themeId)).returning({ id: themesTable.id });
    if (!row) { sendError(res, 404, "Theme not found"); return; }
    sendSuccess(res, { deleted: true });
  } catch (err) {
    logger.error({ err }, "admin/themes: delete failed");
    sendError(res, 500, "Failed to delete theme");
  }
});

// ── Topics ─────────────────────────────────────────────────────────────────────

// GET /api/admin/themes/:themeId/topics — list topics with image count
router.get("/admin/themes/:themeId/topics", async (req, res): Promise<void> => {
  const { themeId } = req.params;
  try {
    const topics = await db
      .select({
        id:           topicsTable.id,
        themeId:      topicsTable.themeId,
        name:         topicsTable.name,
        slug:         topicsTable.slug,
        description:  topicsTable.description,
        displayOrder: topicsTable.displayOrder,
        isActive:     topicsTable.isActive,
        createdAt:    topicsTable.createdAt,
        imageCount:   count(libraryTopicsTable.libraryId),
      })
      .from(topicsTable)
      .leftJoin(libraryTopicsTable, eq(libraryTopicsTable.topicId, topicsTable.id))
      .where(eq(topicsTable.themeId, themeId))
      .groupBy(topicsTable.id)
      .orderBy(asc(topicsTable.displayOrder), asc(topicsTable.name));
    sendSuccess(res, { topics });
  } catch (err) {
    logger.error({ err }, "admin/topics: list failed");
    sendError(res, 500, "Failed to fetch topics");
  }
});

const TopicSchema = z.object({
  name:         z.string().min(1).max(100),
  slug:         z.string().min(1).max(100).regex(/^[a-z0-9-]+$/).optional(),
  description:  z.string().max(500).optional(),
  displayOrder: z.number().int().min(0).optional(),
  isActive:     z.boolean().optional(),
});

// POST /api/admin/themes/:themeId/topics — create topic under theme
router.post("/admin/themes/:themeId/topics", async (req, res): Promise<void> => {
  const { themeId } = req.params;
  const [theme] = await db.select({ id: themesTable.id }).from(themesTable).where(eq(themesTable.id, themeId)).limit(1);
  if (!theme) { sendError(res, 404, "Theme not found"); return; }

  const parsed = TopicSchema.safeParse(req.body);
  if (!parsed.success) { sendError(res, 400, "Invalid request body"); return; }
  const { name, slug, description, displayOrder, isActive } = parsed.data;
  try {
    const [topic] = await db.insert(topicsTable).values({
      themeId,
      name,
      slug:         slug ?? slugify(name),
      description:  description ?? null,
      displayOrder: displayOrder ?? 0,
      isActive:     isActive ?? true,
    }).returning();
    sendSuccess(res, { topic }, 201);
  } catch (err: any) {
    if (err.code === "23505") { sendError(res, 409, "A topic with this slug already exists in this theme"); return; }
    logger.error({ err }, "admin/topics: create failed");
    sendError(res, 500, "Failed to create topic");
  }
});

// PATCH /api/admin/topics/:topicId — update topic
router.patch("/admin/topics/:topicId", async (req, res): Promise<void> => {
  const { topicId } = req.params;
  const parsed = TopicSchema.partial().safeParse(req.body);
  if (!parsed.success) { sendError(res, 400, "Invalid request body"); return; }
  const updates = parsed.data;
  if (updates.name && !updates.slug) updates.slug = slugify(updates.name);
  try {
    const [topic] = await db.update(topicsTable).set(updates).where(eq(topicsTable.id, topicId)).returning();
    if (!topic) { sendError(res, 404, "Topic not found"); return; }
    sendSuccess(res, { topic });
  } catch (err: any) {
    if (err.code === "23505") { sendError(res, 409, "A topic with this slug already exists in this theme"); return; }
    logger.error({ err }, "admin/topics: update failed");
    sendError(res, 500, "Failed to update topic");
  }
});

// DELETE /api/admin/topics/:topicId — delete topic (cascades to library_topics)
router.delete("/admin/topics/:topicId", async (req, res): Promise<void> => {
  const { topicId } = req.params;
  try {
    const [row] = await db.delete(topicsTable).where(eq(topicsTable.id, topicId)).returning({ id: topicsTable.id });
    if (!row) { sendError(res, 404, "Topic not found"); return; }
    sendSuccess(res, { deleted: true });
  } catch (err) {
    logger.error({ err }, "admin/topics: delete failed");
    sendError(res, 500, "Failed to delete topic");
  }
});

// ── Topic ↔ Image assignment ──────────────────────────────────────────────────

// GET /api/admin/topics/:topicId/images — images assigned to this topic
router.get("/admin/topics/:topicId/images", async (req, res): Promise<void> => {
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
    logger.error({ err }, "admin/topics: list images failed");
    sendError(res, 500, "Failed to fetch topic images");
  }
});

const AssignImagesSchema = z.object({
  libraryIds: z.array(z.string().uuid()).min(1).max(50),
});

// POST /api/admin/topics/:topicId/images — assign images (idempotent)
router.post("/admin/topics/:topicId/images", async (req, res): Promise<void> => {
  const { topicId } = req.params;
  const [topic] = await db.select({ id: topicsTable.id }).from(topicsTable).where(eq(topicsTable.id, topicId)).limit(1);
  if (!topic) { sendError(res, 404, "Topic not found"); return; }

  const parsed = AssignImagesSchema.safeParse(req.body);
  if (!parsed.success) { sendError(res, 400, "Invalid request body"); return; }

  try {
    await db
      .insert(libraryTopicsTable)
      .values(parsed.data.libraryIds.map((libraryId) => ({ libraryId, topicId })))
      .onConflictDoNothing();
    sendSuccess(res, { assigned: parsed.data.libraryIds.length });
  } catch (err) {
    logger.error({ err }, "admin/topics: assign images failed");
    sendError(res, 500, "Failed to assign images to topic");
  }
});

// DELETE /api/admin/topics/:topicId/images/:libraryId — remove image from topic
router.delete("/admin/topics/:topicId/images/:libraryId", async (req, res): Promise<void> => {
  const { topicId, libraryId } = req.params;
  try {
    await db.delete(libraryTopicsTable).where(
      and(eq(libraryTopicsTable.topicId, topicId), eq(libraryTopicsTable.libraryId, libraryId)),
    );
    sendSuccess(res, { removed: true });
  } catch (err) {
    logger.error({ err }, "admin/topics: remove image failed");
    sendError(res, 500, "Failed to remove image from topic");
  }
});

export default router;
