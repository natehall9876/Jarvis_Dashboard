/** Appends an `error` query param to a path, for the "redirect back with a message" pattern every mutation form uses. */
export function withError(path: string, message: string): string {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}error=${encodeURIComponent(message)}`;
}

/** Form fields are always strings (or null); these coerce them consistently. */
export function optionalString(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  if (typeof value !== "string" || value.trim().length === 0) return null;
  return value.trim();
}

export function requiredString(formData: FormData, key: string): string {
  const value = optionalString(formData, key);
  if (value === null) throw new Error(`${key} is required.`);
  return value;
}

export function optionalNumber(formData: FormData, key: string): number | null {
  const value = optionalString(formData, key);
  if (value === null) return null;
  const num = Number(value);
  return Number.isNaN(num) ? null : num;
}

export function requiredNumber(formData: FormData, key: string): number {
  const value = optionalNumber(formData, key);
  if (value === null) throw new Error(`${key} must be a number.`);
  return value;
}

export function checkbox(formData: FormData, key: string): boolean {
  return formData.get(key) === "on" || formData.get(key) === "true";
}

export function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err && typeof err.message === "string") {
    return err.message;
  }
  return "Something went wrong.";
}

/**
 * Runs a mutation and captures failures as a plain result instead of a
 * thrown error. Next's `redirect()` works by throwing internally, so it
 * must always be called OUTSIDE a try/catch — this lets every action do
 * `const result = await runMutation(...); if (!result.ok) redirect(...)`
 * afterward without a catch block ever swallowing a legitimate redirect.
 */
export async function runMutation<T>(
  fn: () => Promise<T>,
): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (err) {
    return { ok: false, message: extractErrorMessage(err) };
  }
}
