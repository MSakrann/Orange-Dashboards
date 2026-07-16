import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyJiraHubSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): boolean {
  if (!signatureHeader) return false;

  const [method, provided] = signatureHeader.split("=", 2);
  if (!method || !provided) return false;

  const algorithm = method.toLowerCase();
  if (algorithm !== "sha256" && algorithm !== "sha1") return false;

  const expected = createHmac(algorithm, secret)
    .update(rawBody, "utf8")
    .digest("hex");

  try {
    const providedBuffer = Buffer.from(provided, "utf8");
    const expectedBuffer = Buffer.from(expected, "utf8");
    if (providedBuffer.length !== expectedBuffer.length) return false;
    return timingSafeEqual(providedBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

export function isWebhookAuthorized(options: {
  request: Request;
  rawBody: string;
  expectedSecret: string;
}): boolean {
  const { request, rawBody, expectedSecret } = options;
  const url = new URL(request.url);
  const querySecret = url.searchParams.get("secret");
  const headerSecret = request.headers.get("x-dashboard-webhook-secret");

  if (querySecret === expectedSecret || headerSecret === expectedSecret) {
    return true;
  }

  return verifyJiraHubSignature(
    rawBody,
    request.headers.get("x-hub-signature"),
    expectedSecret,
  );
}
