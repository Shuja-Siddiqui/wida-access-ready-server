import { Router, type IRouter } from "express";
import { eq, count, sql, desc, isNull } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  districtsTable,
  schoolsTable,
  usersTable,
  studentsTable,
  profilesTable,
  districtAdminsTable,
  billingConfigTable,
} from "../../../db";
import { libraryTable, libraryTopicsTable, topicsTable, themesTable } from "../../../db/schema";
import { asc } from "drizzle-orm";
import { sendError, sendSuccess } from "../../lib/api-response";
import { requireAuth, requireSuperAdmin } from "../../middlewares/auth";
import { getUncachableStripeClient } from "../../lib/stripeClient";
import { ObjectStorageService } from "../../lib/objectStorage";
import { runImagePipeline, type SupportedMediaType } from "../../lib/image-pipeline";
import { logger } from "../../config/logger";

const storage = new ObjectStorageService();

const router: IRouter = Router();

router.use("/admin", requireAuth, requireSuperAdmin);

// ── GET /admin/stats ─────────────────────────────────────────────────────────
router.get("/admin/stats", async (_req, res): Promise<void> => {
  const [userCounts, [districtCount], [schoolCount], [studentCount], [guardianCount], subRows] =
    await Promise.all([
      db
        .select({ role: usersTable.role, count: count() })
        .from(usersTable)
        .groupBy(usersTable.role),
      db.select({ count: count() }).from(districtsTable),
      db.select({ count: count() }).from(schoolsTable),
      db.select({ count: count() }).from(studentsTable),
      db.select({ count: count() }).from(profilesTable),
      db.execute(sql`
        select count(*) as count
        from "stripe"."subscriptions"
        where status = 'active'
      `),
    ]);

  const roleMap: Record<string, number> = {};
  for (const row of userCounts) {
    roleMap[row.role] = Number(row.count);
  }

  const activeSubscriptions = Number((subRows.rows[0] as Record<string, unknown>)?.count ?? 0);

  sendSuccess(res, {
    users: {
      total: Object.values(roleMap).reduce((a, b) => a + b, 0),
      byRole: roleMap,
    },
    districts: Number(districtCount?.count ?? 0),
    schools: Number(schoolCount?.count ?? 0),
    students: Number(studentCount?.count ?? 0),
    profiles: Number(guardianCount?.count ?? 0),
    activeSubscriptions,
  });
});

// ── GET /admin/users ─────────────────────────────────────────────────────────
const ListUsersQuery = z.object({
  role: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
});

router.get("/admin/users", async (req, res): Promise<void> => {
  const parsed = ListUsersQuery.safeParse(req.query);
  if (!parsed.success) {
    sendError(res, 400, parsed.error.message);
    return;
  }

  const { role, page, limit, search } = parsed.data;
  const offset = (page - 1) * limit;

  const conditions: ReturnType<typeof sql>[] = [];
  if (role) conditions.push(sql`${usersTable.role} = ${role}`);
  if (search) {
    conditions.push(
      sql`(lower(${usersTable.name}) like ${"%" + search.toLowerCase() + "%"} or lower(${usersTable.email}) like ${"%" + search.toLowerCase() + "%"})`,
    );
  }

  const whereClause =
    conditions.length > 0
      ? sql`where ${sql.join(conditions, sql` and `)}`
      : sql``;

  const [rows, totalRows] = await Promise.all([
    db.execute(sql`
      select id, email, name, role, email_verified, created_at
      from users
      ${whereClause}
      order by created_at desc
      limit ${limit} offset ${offset}
    `),
    db.execute(sql`
      select count(*) as total from users ${whereClause}
    `),
  ]);

  const total = Number((totalRows.rows[0] as Record<string, unknown>)?.total ?? 0);

  sendSuccess(res, {
    users: rows.rows,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

// ── GET /admin/districts/:districtId  (full drill-down) ──────────────────────
const DistrictIdParam = z.object({ districtId: z.string().uuid() });

router.get("/admin/districts/:districtId", async (req, res): Promise<void> => {
  const params = DistrictIdParam.safeParse(req.params);
  if (!params.success) {
    sendError(res, 400, "Invalid district ID");
    return;
  }
  const { districtId } = params.data;

  const [district] = await db
    .select({
      id: districtsTable.id,
      name: districtsTable.name,
      state: districtsTable.state,
      districtCode: districtsTable.districtCode,
      schoolCount: count(schoolsTable.id),
    })
    .from(districtsTable)
    .leftJoin(schoolsTable, eq(schoolsTable.districtId, districtsTable.id))
    .where(eq(districtsTable.id, districtId))
    .groupBy(districtsTable.id)
    .limit(1);

  if (!district) {
    sendError(res, 404, "District not found");
    return;
  }

  // Schools in the district with per-school teacher + student counts
  const schools = await db.execute(sql`
    select
      s.id,
      s.name,
      s.state,
      s.school_code                      as "schoolCode",
      count(distinct g.id)::int          as "teacherCount",
      count(distinct st.id)::int         as "studentCount"
    from schools s
    left join profiles g  on g.school_id  = s.id
    left join students  st on st.guardian_id = g.id
    where s.district_id = ${districtId}
    group by s.id
    order by s.name
  `);

  // Teachers per school with their assigned students
  const teacherRows = await db.execute(sql`
    select
      g.id                as "teacherId",
      g.school_id         as "schoolId",
      u.name              as "teacherName",
      u.email             as "teacherEmail",
      u.role              as "teacherRole",
      json_agg(
        json_build_object(
          'id',              st.id,
          'name',            st.name,
          'gradeBand',       st.grade_band,
          'stateAssessment', st.state_assessment
        ) order by st.name
      ) filter (where st.id is not null) as students
    from profiles g
    inner join users u   on u.id  = g.user_id
    inner join schools s on s.id  = g.school_id
    left  join students st on st.guardian_id = g.id
    where s.district_id = ${districtId}
    group by g.id, g.school_id, u.name, u.email, u.role
    order by u.name
  `);

  type TeacherRow = {
    teacherId: string; schoolId: string;
    teacherName: string; teacherEmail: string; teacherRole: string;
    students: { id: string; name: string; gradeBand: string | null; stateAssessment: string | null }[] | null;
  };

  // Group teachers under their school
  const teachersBySchool: Record<string, TeacherRow[]> = {};
  for (const row of teacherRows.rows as TeacherRow[]) {
    if (!teachersBySchool[row.schoolId]) teachersBySchool[row.schoolId] = [];
    teachersBySchool[row.schoolId].push(row);
  }

  type SchoolRow = { id: string; name: string; state: string | null; schoolCode: string | null; teacherCount: number; studentCount: number };
  const schoolsWithTeachers = (schools.rows as SchoolRow[]).map((s) => ({
    ...s,
    teachers: (teachersBySchool[s.id] ?? []).map((t) => ({
      id: t.teacherId,
      name: t.teacherName,
      email: t.teacherEmail,
      role: t.teacherRole,
      students: t.students ?? [],
    })),
  }));

  sendSuccess(res, { district, schools: schoolsWithTeachers });
});

// ── GET /admin/students/:studentId ───────────────────────────────────────────
const StudentIdParam = z.object({ studentId: z.string().uuid() });

router.get("/admin/students/:studentId", async (req, res): Promise<void> => {
  const params = StudentIdParam.safeParse(req.params);
  if (!params.success) {
    sendError(res, 400, "Invalid student ID");
    return;
  }
  const { studentId } = params.data;

  const [studentRows, levelRows, sessionRows] = await Promise.all([
    db.execute(sql`
      select
        s.id,
        s.name,
        s.grade_band           as "gradeBand",
        s.state_assessment     as "stateAssessment",
        s.current_streak       as "currentStreak",
        s.longest_streak       as "longestStreak",
        s.total_xp             as "totalXp",
        s.last_session_date    as "lastSessionDate",
        s.created_at           as "createdAt",
        u.name                 as "teacherName"
      from students s
      left join profiles g on g.id = s.guardian_id
      left join users u     on u.id = g.user_id
      where s.id = ${studentId}
      limit 1
    `),
    db.execute(sql`
      select domain, current_level as "currentLevel", exit_threshold as "exitThreshold", at_exit as "atExit"
      from student_levels
      where student_id = ${studentId}
      order by domain
    `),
    db.execute(sql`
      select domain, level_end as "levelEnd", score_pct as "scorePct", created_at as "createdAt"
      from sessions
      where student_id = ${studentId}
        and completed = true
        and level_end is not null
      order by created_at asc
      limit 200
    `),
  ]);

  const student = studentRows.rows[0];
  if (!student) {
    sendError(res, 404, "Student not found");
    return;
  }

  sendSuccess(res, {
    student,
    levels: levelRows.rows,
    sessions: sessionRows.rows,
  });
});

// ── DELETE /admin/districts/:districtId ──────────────────────────────────────

router.delete("/admin/districts/:districtId", async (req, res): Promise<void> => {
  const params = DistrictIdParam.safeParse(req.params);
  if (!params.success) {
    sendError(res, 400, "Invalid district ID");
    return;
  }

  const { districtId } = params.data;

  const [existing] = await db
    .select({ id: districtsTable.id })
    .from(districtsTable)
    .where(eq(districtsTable.id, districtId))
    .limit(1);

  if (!existing) {
    sendError(res, 404, "District not found");
    return;
  }

  // Disconnect schools from district (keeps school records intact).
  await db
    .update(schoolsTable)
    .set({ districtId: null })
    .where(eq(schoolsTable.districtId, districtId));

  // Remove district admin memberships.
  await db
    .delete(districtAdminsTable)
    .where(eq(districtAdminsTable.districtId, districtId));

  await db.delete(districtsTable).where(eq(districtsTable.id, districtId));

  sendSuccess(res, { deleted: true });
});

// ── GET /admin/subscriptions ─────────────────────────────────────────────────
router.get("/admin/subscriptions", async (_req, res): Promise<void> => {
  const result = await db.execute(sql`
    select
      s.id                              as subscription_id,
      s.status,
      s.created,
      s.cancel_at_period_end,
      si.quantity,
      p.unit_amount,
      p.currency,
      pr.name                           as plan_name,
      pr.metadata->>'planId'            as plan_id,
      c.email                           as customer_email,
      c.name                            as customer_name,
      osc.owner_id,
      osc.owner_type
    from "stripe"."subscriptions" s
    join "stripe"."customers" c on c.id = s.customer
    left join "stripe"."subscription_items" si on si.subscription = s.id
    left join "stripe"."prices" p on p.id = si.price
    left join "stripe"."products" pr on pr.id = p.product
    left join "owner_stripe_customers" osc on osc.stripe_customer_id = c.id
    order by s.created desc
    limit 200
  `);

  sendSuccess(res, { subscriptions: result.rows });
});

// ── PATCH /admin/pricing ─────────────────────────────────────────────────────
// Always writes to billing_config (the authoritative local source).
// Also updates Stripe if it is connected and has a matching product.
const UpdatePricingBody = z.object({
  planId: z.enum(["solo", "organization"]),
  priceCents: z.number().int().min(100),
});

router.patch("/admin/pricing", async (req, res): Promise<void> => {
  const parsed = UpdatePricingBody.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, parsed.error.message);
    return;
  }

  const { planId, priceCents } = parsed.data;
  const adminId = (req as { auth?: { id?: string } }).auth?.id ?? null;

  // ── 1. Always persist to billing_config ──────────────────────────────────
  await db
    .insert(billingConfigTable)
    .values({ planId, name: planId === "solo" ? "Personal" : "Organization", priceCents, updatedBy: adminId })
    .onConflictDoUpdate({
      target: billingConfigTable.planId,
      set: { priceCents, updatedAt: new Date(), updatedBy: adminId },
    });

  // ── 2. Also update Stripe if connected ───────────────────────────────────
  let stripeResult: { newPriceId: string; currency: string } | null = null;
  try {
    const lookup = await db.execute(sql`
      select
        p.id   as product_id,
        pr.id  as price_id,
        pr.currency
      from "stripe"."products" p
      join "stripe"."prices" pr on pr.product = p.id
      where p.active = true
        and pr.active = true
        and p.metadata->>'planId' = ${planId}
      order by pr.created desc
      limit 1
    `);

    const current = lookup.rows[0] as
      | { product_id: string; price_id: string; currency: string }
      | undefined;

    if (current) {
      const stripe = await getUncachableStripeClient();
      const newPrice = await stripe.prices.create({
        product: current.product_id,
        unit_amount: priceCents,
        currency: current.currency,
        recurring: { interval: "month" },
        metadata: { planId },
      });
      await stripe.products.update(current.product_id, { default_price: newPrice.id });
      await stripe.prices.update(current.price_id, { active: false });
      stripeResult = { newPriceId: newPrice.id, currency: newPrice.currency };
    }
  } catch {
    // Stripe not connected — config-only update is sufficient.
  }

  sendSuccess(res, {
    planId,
    priceCents,
    currency: stripeResult?.currency ?? "usd",
    ...(stripeResult ? { newPriceId: stripeResult.newPriceId } : {}),
    source: stripeResult ? "stripe+config" : "config",
  });
});

// ── GET /api/admin/library ────────────────────────────────────────────────────
// List all library rows (no ownership filter), newest first, with presigned URLs.

router.get("/admin/library", async (req, res): Promise<void> => {
  try {
    const limit  = Math.min(Number(req.query.limit  ?? 20), 100);
    const offset = Number(req.query.offset ?? 0);

    const rows = await db
      .select({
        id:               libraryTable.id,
        s3Key:            libraryTable.s3Key,
        thumbnailKey:     libraryTable.thumbnailKey,
        mediumKey:        libraryTable.mediumKey,
        contentType:      libraryTable.contentType,
        sizeBytes:        libraryTable.sizeBytes,
        tags:             libraryTable.tags,
        description:      libraryTable.description,
        detectionResults: libraryTable.detectionResults,
        contexts:         libraryTable.contexts,
        imageConcept:     libraryTable.imageConcept,
        uploaderId:       libraryTable.uploaderId,
        createdAt:        libraryTable.createdAt,
        uploaderEmail:    usersTable.email,
        uploaderName:     usersTable.name,
        topicCount:       sql<number>`(SELECT COUNT(*) FROM library_topics WHERE library_id = ${libraryTable.id})`.mapWith(Number),
      })
      .from(libraryTable)
      .leftJoin(usersTable, eq(libraryTable.uploaderId, usersTable.id))
      .orderBy(desc(libraryTable.createdAt))
      .limit(limit)
      .offset(offset);

    // Attach short-lived presigned GET URLs (thumbnail preferred; falls back to original)
    const items = await Promise.all(
      rows.map(async (row) => {
        const [imageUrl, thumbnailUrl, mediumUrl] = await Promise.all([
          storage.getPresignedGetUrl(row.s3Key, 3600).catch(() => null),
          row.thumbnailKey ? storage.getPresignedGetUrl(row.thumbnailKey, 3600).catch(() => null) : null,
          row.mediumKey    ? storage.getPresignedGetUrl(row.mediumKey,    3600).catch(() => null) : null,
        ]);
        return { ...row, imageUrl, thumbnailUrl, mediumUrl };
      })
    );

    const [{ total }] = await db.select({ total: count() }).from(libraryTable);

    sendSuccess(res, { items, total: Number(total), limit, offset });
  } catch (err) {
    logger.error({ err }, "admin/library: list failed");
    sendError(res, 500, "Failed to fetch library");
  }
});

// ── POST /api/admin/library/analyze ──────────────────────────────────────────
// Run the Claude + Grounding DINO pipeline on an image without saving anything.
// Used by the admin upload panel's "Auto-detect" button to pre-fill fields.

router.post("/admin/library/analyze", async (req, res): Promise<void> => {
  const { image } = req.body as { image?: string };
  if (!image || !image.startsWith("data:image/")) {
    sendError(res, 400, "image must be a base64 data URI");
    return;
  }

  const match = image.match(/^data:([^;]+);base64,(.+)$/s);
  if (!match) { sendError(res, 400, "Could not parse image data URI"); return; }

  const contentType = match[1]! as SupportedMediaType;
  const base64Data  = match[2]!;

  try {
    // Fetch all topics so the pipeline can suggest which ones apply
    const topicRows = await db
      .select({
        id:        topicsTable.id,
        name:      topicsTable.name,
        themeName: themesTable.name,
      })
      .from(topicsTable)
      .innerJoin(themesTable, eq(themesTable.id, topicsTable.themeId))
      .where(eq(topicsTable.isActive, true))
      .orderBy(asc(themesTable.displayOrder), asc(topicsTable.displayOrder));

    const { candidates, confirmedTags, description, imageConcept, suggestedTopicIds, detectionResults } =
      await runImagePipeline(image, base64Data, contentType, { topics: topicRows });

    sendSuccess(res, {
      candidates,
      confirmedTags,
      description,
      imageConcept,
      suggestedTopicIds,
      detections: detectionResults.detections,
    });
  } catch (err) {
    logger.error({ err }, "admin/library: analyze failed");
    sendError(res, 500, "AI analysis failed — is the Grounding DINO sidecar running?");
  }
});

// ── POST /api/admin/library/upload ────────────────────────────────────────────
// Upload an image → run Claude vision + Grounding DINO pipeline → save to S3 + DB.
//
// Claude always runs to identify candidates; DINO always runs to verify them.
// If the caller supplies description/tags those are respected as overrides but
// DINO still verifies the tags in the image.

const DetectionBoxSchema = z.object({
  label:  z.string().min(1),
  score:  z.number(),
  box:    z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }),
  /** Polygon vertices [[x,y],…] in normalized [0,1] coords. `box` is the bounding rect. */
  points: z.array(z.tuple([z.number(), z.number()])).optional(),
  source: z.string().optional(),
});

const VALID_CONTEXTS = [
  "general",
  "academic:math",
  "academic:science",
  "academic:social_studies",
  "academic:ela",
] as const;

const UploadSchema = z.object({
  image:       z.string().min(10),     // base64 data URI e.g. data:image/jpeg;base64,…
  description: z.string().max(1000).optional(),
  tags:        z.array(z.string()).max(50).optional(),
  topicIds:    z.array(z.string().uuid()).max(50).optional(),
  /** Usage contexts — which session types may use this image. */
  contexts:    z.array(z.enum(VALID_CONTEXTS)).max(10).optional().default([]),
  /** Specific concept depicted, e.g. "Chromosomes", "Westward Expansion". */
  imageConcept: z.string().max(200).optional(),
  // Optional: pre-edited detections from the annotation tool.
  detections:  z.array(DetectionBoxSchema).optional(),
});

router.post("/admin/library/upload", async (req, res): Promise<void> => {
  const parsed = UploadSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, "Invalid request body");
    return;
  }

  const { image, description: userDescription, tags: userTags, topicIds: userTopicIds, detections: userDetections, contexts: userContexts, imageConcept: userImageConcept } = parsed.data;

  // Parse data URI
  const match = image.match(/^data:([^;]+);base64,(.+)$/s);
  if (!match) {
    sendError(res, 400, "image must be a base64 data URI");
    return;
  }
  const contentType = match[1]! as SupportedMediaType;
  const base64Data  = match[2]!;
  const buffer      = Buffer.from(base64Data, "base64");

  try {
    // Step 1 — upload original to S3 immediately so the image is safe even if AI fails
    const { generateImageVariants } = await import("../../lib/imageResize");
    const { key, sizeBytes } = await storage.uploadBuffer(buffer, contentType, "access-ready-files/library");

    // Generate + upload thumbnail (200 px) and medium (600 px) variants in parallel (non-fatal)
    const variantId = key.split("/").pop()!; // reuse the same UUID so keys stay paired
    const thumbnailS3Key = `access-ready-files/library/thumbnails/${variantId}`;
    const mediumS3Key    = `access-ready-files/library/medium/${variantId}`;

    let thumbnailKey: string | null = null;
    let mediumKey:    string | null = null;
    try {
      const variants = await generateImageVariants(buffer);
      await Promise.all([
        storage.uploadBufferWithKey(variants.thumbnail, "image/jpeg", thumbnailS3Key)
          .then(() => { thumbnailKey = thumbnailS3Key; })
          .catch((err: unknown) => logger.warn({ err }, "admin/library: thumbnail upload failed")),
        storage.uploadBufferWithKey(variants.medium, "image/jpeg", mediumS3Key)
          .then(() => { mediumKey = mediumS3Key; })
          .catch((err: unknown) => logger.warn({ err }, "admin/library: medium upload failed")),
      ]);
    } catch (err) {
      logger.warn({ err }, "admin/library: image resize failed, skipping variants");
    }

    // Step 2 — run pipeline OR use pre-edited detections from the annotation tool.
    // When the admin has already reviewed/edited boxes before uploading, skip DINO
    // and store the hand-curated detections directly.
    let pipelineResult: Awaited<ReturnType<typeof runImagePipeline>> | null = null;
    let manualDetectionResult: { detections: typeof userDetections; tags: string[] } | null = null;

    if (userDetections && userDetections.length > 0) {
      // Use pre-edited boxes — still run Claude for description/topic suggestion if needed
      logger.info({ boxCount: userDetections.length }, "admin/library: using pre-edited detections, skipping DINO");
      const derivedTags = [...new Set(userDetections.map((d) => d.label))];
      manualDetectionResult = { detections: userDetections, tags: userTags ?? derivedTags };
    } else {
      // Full pipeline: Claude vision + Grounding DINO
      const topicRows = await db
        .select({ id: topicsTable.id, name: topicsTable.name, themeName: themesTable.name })
        .from(topicsTable)
        .innerJoin(themesTable, eq(themesTable.id, topicsTable.themeId))
        .where(eq(topicsTable.isActive, true))
        .orderBy(asc(themesTable.displayOrder), asc(topicsTable.displayOrder));

      try {
        pipelineResult = await runImagePipeline(image, base64Data, contentType, {
          description: userDescription,
          tags:        userTags,
          topics:      topicRows,
        });
        logger.info(
          { confirmedTags: pipelineResult.confirmedTags, model: pipelineResult.detectionResults.model },
          "admin/library: pipeline complete",
        );
      } catch (pipelineErr) {
        logger.error({ err: pipelineErr }, "admin/library: AI pipeline failed, saving with user-supplied metadata");
      }
    }

    // Step 3 — insert library row
    const uploaderId = (req as any).auth?.userId ?? null;
    const finalTags        = manualDetectionResult?.tags ?? pipelineResult?.confirmedTags ?? userTags ?? [];
    const finalDescription = pipelineResult?.description ?? userDescription ?? null;
    const finalDetections  = manualDetectionResult
      ? { detections: manualDetectionResult.detections, model: "manual" }
      : pipelineResult
        ? (pipelineResult.detectionResults as Record<string, unknown>)
        : null;

    const [row] = await db
      .insert(libraryTable)
      .values({
        s3Key:            key,
        thumbnailKey:     thumbnailKey ?? undefined,
        mediumKey:        mediumKey ?? undefined,
        contentType,
        sizeBytes,
        tags:             finalTags,
        description:      finalDescription,
        detectionResults: finalDetections,
        contexts:         userContexts ?? [],
        imageConcept:     userImageConcept ?? pipelineResult?.imageConcept ?? null,
        uploaderId,
      })
      .returning();

    // Step 4 — save topic assignments
    const topicIdsToSave = userTopicIds ?? pipelineResult?.suggestedTopicIds ?? [];
    if (topicIdsToSave.length > 0) {
      await db
        .insert(libraryTopicsTable)
        .values(topicIdsToSave.map((topicId) => ({ libraryId: row!.id, topicId })))
        .onConflictDoNothing();
    }

    const [imageUrl, thumbnailUrl, mediumUrl] = await Promise.all([
      storage.getPresignedGetUrl(row!.s3Key, 3600).catch(() => null),
      row!.thumbnailKey ? storage.getPresignedGetUrl(row!.thumbnailKey, 3600).catch(() => null) : null,
      row!.mediumKey    ? storage.getPresignedGetUrl(row!.mediumKey,    3600).catch(() => null) : null,
    ]);
    sendSuccess(res, { item: { ...row, imageUrl, thumbnailUrl, mediumUrl, topicIds: topicIdsToSave } });

    // Step 5 — fire-and-forget: run Claude Vision for any academic contexts.
    // We do this AFTER responding so the upload feels instant.
    const uploadedContexts = (userContexts ?? []) as string[];
    if (uploadedContexts.some((c) => c.startsWith("academic:"))) {
      import("../../lib/claude/academic-vision").then(({ processAcademicVisionForImage }) => {
        processAcademicVisionForImage(row!.id, row!.s3Key, uploadedContexts, base64Data, contentType)
          .catch((err: unknown) => logger.warn({ err, imageId: row!.id }, "academic-vision: background processing failed"));
      }).catch((err: unknown) => logger.warn({ err }, "academic-vision: module import failed"));
    }
  } catch (err) {
    logger.error({ err }, "admin/library: upload failed");
    sendError(res, 500, "Upload failed");
  }
});

// ── PUT /api/admin/library/:id/detections ────────────────────────────────────
// Save manually-edited bounding boxes for a library image.
// Updates detection_results + rederives tags from the final label set.

router.put("/admin/library/:id/detections", async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const body = req.body as { detections?: unknown };

  if (!Array.isArray(body.detections)) {
    sendError(res, 400, "detections must be an array");
    return;
  }

  for (const d of body.detections) {
    const det = d as Record<string, unknown>;
    if (typeof det.label !== "string" || !det.label.trim()) {
      sendError(res, 400, "Each detection must have a non-empty label");
      return;
    }
    const box = det.box as Record<string, unknown> | undefined;
    if (!box || typeof box.x !== "number" || typeof box.y !== "number" ||
        typeof box.width !== "number" || typeof box.height !== "number") {
      sendError(res, 400, "Each detection must have a box with x, y, width, height");
      return;
    }
  }

  try {
    const detections = body.detections as { label: string; score: number; box: Record<string, number> }[];
    const tags = [...new Set(detections.map((d) => d.label))];

    const [row] = await db
      .update(libraryTable)
      .set({
        detectionResults: { detections, model: "manual" } as Record<string, unknown>,
        tags,
      })
      .where(eq(libraryTable.id, id))
      .returning({ id: libraryTable.id });

    if (!row) {
      sendError(res, 404, "Item not found");
      return;
    }

    logger.info({ id, boxCount: detections.length, tags }, "admin/library: detections saved manually");
    sendSuccess(res, { updated: true });
  } catch (err) {
    logger.error({ err }, "admin/library: update detections failed");
    sendError(res, 500, "Update failed");
  }
});


// ── PUT /api/admin/library/:id/contexts ──────────────────────────────────────
// Update usage contexts for a single library image.
// Used by the bulk-assign workflow on the admin library page.

const UpdateContextsBody = z.object({
  contexts: z.array(z.enum(VALID_CONTEXTS)).max(10),
});

router.put("/admin/library/:id/contexts", async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const parsed = UpdateContextsBody.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, parsed.error.message);
    return;
  }

  try {
    const [row] = await db
      .update(libraryTable)
      .set({ contexts: parsed.data.contexts })
      .where(eq(libraryTable.id, id))
      .returning({ id: libraryTable.id });

    if (!row) {
      sendError(res, 404, "Item not found");
      return;
    }

    logger.info({ id, contexts: parsed.data.contexts }, "admin/library: contexts updated");
    sendSuccess(res, { updated: true, contexts: parsed.data.contexts });
  } catch (err) {
    logger.error({ err }, "admin/library: update contexts failed");
    sendError(res, 500, "Update failed");
  }
});

// ── PUT /api/admin/library/:id/metadata ──────────────────────────────────────
// Update the subject and/or topic label for a single library image.
// These are the two fields shown to (and used by) the AI content generator.

const UpdateMetadataBody = z.object({
  imageConcept: z.string().max(200).nullable().optional(),
});

router.put("/admin/library/:id/metadata", async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const parsed = UpdateMetadataBody.safeParse(req.body);
  if (!parsed.success) { sendError(res, 400, parsed.error.message); return; }

  try {
    const [row] = await db
      .update(libraryTable)
      .set({
        ...(parsed.data.imageConcept !== undefined ? { imageConcept: parsed.data.imageConcept } : {}),
      })
      .where(eq(libraryTable.id, id))
      .returning({ id: libraryTable.id, imageConcept: libraryTable.imageConcept });

    if (!row) { sendError(res, 404, "Item not found"); return; }

    logger.info({ id, imageConcept: row.imageConcept }, "admin/library: metadata updated");
    sendSuccess(res, { updated: true, imageConcept: row.imageConcept });
  } catch (err) {
    logger.error({ err }, "admin/library: update metadata failed");
    sendError(res, 500, "Update failed");
  }
});

// ── DELETE /api/admin/library/:id ─────────────────────────────────────────────
// Admin can delete any row regardless of ownership.

router.delete("/admin/library/:id", async (req, res): Promise<void> => {
  const id = req.params.id as string;
  try {
    const [row] = await db
      .select({
        s3Key:        libraryTable.s3Key,
        thumbnailKey: libraryTable.thumbnailKey,
        mediumKey:    libraryTable.mediumKey,
      })
      .from(libraryTable)
      .where(eq(libraryTable.id, id))
      .limit(1);

    if (!row) {
      sendError(res, 404, "Item not found");
      return;
    }

    // Delete original + variants from S3 (non-fatal per key)
    await Promise.all([
      storage.deleteObject(row.s3Key).catch((err: unknown) =>
        logger.warn({ err, key: row.s3Key }, "admin/library: S3 delete (original) failed")
      ),
      row.thumbnailKey
        ? storage.deleteObject(row.thumbnailKey).catch((err: unknown) =>
            logger.warn({ err, key: row.thumbnailKey }, "admin/library: S3 delete (thumbnail) failed")
          )
        : null,
      row.mediumKey
        ? storage.deleteObject(row.mediumKey).catch((err: unknown) =>
            logger.warn({ err, key: row.mediumKey }, "admin/library: S3 delete (medium) failed")
          )
        : null,
    ]);

    await db.delete(libraryTable).where(eq(libraryTable.id, id));

    sendSuccess(res, { deleted: true });
  } catch (err) {
    logger.error({ err }, "admin/library: delete failed");
    sendError(res, 500, "Delete failed");
  }
});

export default router;
