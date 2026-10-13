-- Legacy Image Factory pool key "general" → ELA (single SF for English Language Arts).
UPDATE "image_generation_pools" SET "subject" = 'ela' WHERE "subject" = 'general';
UPDATE "image_generation_jobs" SET "subject" = 'ela' WHERE "subject" = 'general';
