let csrfToken: string | undefined;
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const method = options.method ?? "GET";
  if (!["GET", "HEAD"].includes(method) && !csrfToken) {
    const response = await fetch("/api/auth/csrf", {
      credentials: "same-origin",
    });
    if (!response.ok)
      throw new ApiError(
        "Could not secure your request. Please try again.",
        response.status,
      );
    csrfToken = (await response.json()).csrfToken;
  }
  const response = await fetch(`/api${path}`, {
    ...options,
    credentials: "same-origin",
    headers: {
      ...(options.body && { "Content-Type": "application/json" }),
      ...(csrfToken && { "X-CSRF-Token": csrfToken }),
      ...options.headers,
    },
  });
  if (path === "/auth/logout") csrfToken = undefined;
  if (!response.ok) {
    if (response.status === 403) csrfToken = undefined;
    const data = await response.json().catch(() => ({}));
    const detail = data.issues?.[0];
    throw new ApiError(
      detail
        ? `${detail.field}: ${detail.message}`
        : (data.error ?? "Unable to connect. Please try again."),
      response.status,
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
export const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : "Something went wrong. Please try again.";
