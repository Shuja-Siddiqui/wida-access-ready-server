/**
 * Image Factory — super-admin library image generation pipeline.
 *
 *   prompts/standards/2020  → Claude HF prompt (isolated from writing session engine)
 *   providers/              → HF Inference + FLUX sidecar
 *   services/               → prompt, pool, generation
 *   api/routes              → /api/admin/images/*
 */
export { default as imageFactoryRouter } from "./api/routes";
export { buildAndPersistImagePrompt } from "./services/prompt-service";
export { listImageFactoryPools } from "./services/pool-service";
export { buildImageFactoryPromptUserPayload } from "./prompts/user-payload";
