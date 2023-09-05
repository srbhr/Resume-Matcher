import { headers } from "next/headers";

/**
 * Returns a boolean indicating whether the code is running in a development environment.
 * @returns {boolean} - True if the code is running in a development environment, false otherwise.
 */
export function isRunningInDevEnvironment(): boolean {
  return process.env.NODE_ENV === "development";
}

/**
 * Returns the protocol and host of the current request.
 * @returns A string representing the protocol and host of the current request.
 */
export function getProtocolAndHost(): string {
  const _headers = headers();
  const host = _headers.get("host") ?? "localhost:3000";
  const protocol = _headers.get("referer")?.split("://")[0] ?? "http";

  return `${protocol}://${host}`;
}
