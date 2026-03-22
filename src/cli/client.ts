import { DEFAULT_DAEMON_URL } from "../core/constants.ts";

export function daemonUrl(): string {
  return process.env.YESCHEF_DAEMON_URL ?? DEFAULT_DAEMON_URL;
}

export async function daemonRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${daemonUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Daemon request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}
