-- Migration: create themes, topics, and library_topics tables
-- Implements the Theme → Topic → Image hierarchy for content organisation.
-- Applied to: Replit dev DB + AWS RDS production DB

-- themes: top-level content categories
CREATE TABLE IF NOT EXISTS "themes" (
  "id"            uuid        PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name"          text        NOT NULL,
  "slug"          text        NOT NULL,
  "description"   text,
  "display_order" integer     NOT NULL DEFAULT 0,
  "is_active"     boolean     NOT NULL DEFAULT true,
  "created_at"    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "themes_slug_unique" UNIQUE ("slug")
);
--> statement-breakpoint

-- topics: sub-categories within a theme
CREATE TABLE IF NOT EXISTS "topics" (
  "id"            uuid        PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "theme_id"      uuid        NOT NULL REFERENCES "themes"("id") ON DELETE CASCADE,
  "name"          text        NOT NULL,
  "slug"          text        NOT NULL,
  "description"   text,
  "display_order" integer     NOT NULL DEFAULT 0,
  "is_active"     boolean     NOT NULL DEFAULT true,
  "created_at"    timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "topics_theme_id_slug_idx" ON "topics" ("theme_id", "slug");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "topics_theme_id_idx" ON "topics" ("theme_id");
--> statement-breakpoint

-- library_topics: many-to-many join between library images and topics
CREATE TABLE IF NOT EXISTS "library_topics" (
  "library_id" uuid    NOT NULL REFERENCES "library"("id")  ON DELETE CASCADE,
  "topic_id"   uuid    NOT NULL REFERENCES "topics"("id")   ON DELETE CASCADE,
  "sort_order" integer NOT NULL DEFAULT 0,
  "added_at"   timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("library_id", "topic_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_topics_topic_id_idx"   ON "library_topics" ("topic_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_topics_library_id_idx" ON "library_topics" ("library_id");
--> statement-breakpoint

-- Seed the 5 canonical themes
INSERT INTO "themes" ("name", "slug", "display_order") VALUES
  ('School and Learning',        'school-and-learning',        0),
  ('Community and Neighborhood', 'community-and-neighborhood',  1),
  ('Health and Well-Being',      'health-and-well-being',       2),
  ('Environment and Weather',    'environment-and-weather',     3),
  ('Technology and Communication','technology-and-communication',4)
ON CONFLICT ("slug") DO NOTHING;
