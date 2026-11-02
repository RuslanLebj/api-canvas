const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export function toTransportUrl(
  logicalUrl: string,
  gateway = process.env.API_CANVAS_HOST_GATEWAY,
): string {
  if (!gateway) return logicalUrl;
  const url = new URL(logicalUrl);
  if (!LOOPBACK_HOSTS.has(url.hostname)) return logicalUrl;
  url.hostname = gateway;
  return url.toString();
}
