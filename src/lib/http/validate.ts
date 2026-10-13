import { badRequest } from "./app-error";

type ParseResult<T> =
  | { success: true; data: T }
  | { success: false; error: { issues: unknown } };

type ParseSchema<T> = {
  safeParse: (input: unknown) => ParseResult<T>;
};

/** Parse request body; throws 400 AppError on failure. */
export function parseBody<T>(schema: ParseSchema<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw badRequest("Validation failed", { issues: parsed.error.issues });
  }
  return parsed.data;
}

/** Parse query params; throws 400 AppError on failure. */
export function parseQuery<T>(schema: ParseSchema<T>, query: unknown): T {
  const parsed = schema.safeParse(query);
  if (!parsed.success) {
    throw badRequest("Validation failed", { issues: parsed.error.issues });
  }
  return parsed.data;
}
