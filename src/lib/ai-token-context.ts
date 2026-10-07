import { AsyncLocalStorage } from "node:async_hooks";

export type AiTokenCallKind =
  | "content_generate"
  | "feedback"
  | "item_feedback"
  | "attempt_feedback"
  | "speech"
  | "object_detect"
  | "image_factory"
  | "other";

export interface AiTokenContext {
  studentId?: string;
  sessionId?: string;
  domain?: string;
  callKind?: AiTokenCallKind;
}

const storage = new AsyncLocalStorage<AiTokenContext>();

export function getAiTokenContext(): AiTokenContext | undefined {
  return storage.getStore();
}

export function withAiTokenContext<T>(ctx: AiTokenContext, fn: () => Promise<T>): Promise<T> {
  const parent = storage.getStore();
  return storage.run({ ...parent, ...ctx }, fn);
}

export function patchAiTokenContext(patch: Partial<AiTokenContext>): void {
  const store = storage.getStore();
  if (store) Object.assign(store, patch);
}
