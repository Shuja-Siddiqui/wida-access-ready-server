-- Rename themes → content_categories (image library catalog, not UI themes)
ALTER TABLE "themes" RENAME TO "content_categories";
--> statement-breakpoint
ALTER TABLE "topics" RENAME COLUMN "theme_id" TO "content_category_id";
--> statement-breakpoint
ALTER INDEX "topics_theme_id_slug_idx" RENAME TO "topics_content_category_id_slug_idx";
--> statement-breakpoint
ALTER INDEX "topics_theme_id_idx" RENAME TO "topics_content_category_id_idx";
--> statement-breakpoint
ALTER TABLE "content_categories" RENAME CONSTRAINT "themes_slug_unique" TO "content_categories_slug_unique";
--> statement-breakpoint
ALTER TABLE "topics" RENAME CONSTRAINT "topics_theme_id_fkey" TO "topics_content_category_id_fkey";
