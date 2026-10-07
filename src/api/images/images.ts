/**
 * Image proxy — streams Pixabay CDN images through our server.
 *
 * GET /api/images/proxy?url=<encoded-pixabay-url>
 */

import type { IRouter } from "express";
import { badRequest, createApiRouter, isAppError, upstreamError } from "../../lib/http";

const router: IRouter = createApiRouter();

const ALLOWED_HOSTS = ["pixabay.com", "cdn.pixabay.com"];

function isAllowedUrl(raw: string): boolean {
  try {
    const { protocol, hostname } = new URL(raw);
    if (protocol !== "https:") return false;
    return ALLOWED_HOSTS.some((h) => hostname === h || hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

router.get("/images/proxy", async (req, res) => {
  const raw = req.query.url as string | undefined;

  if (!raw || !isAllowedUrl(raw)) {
    throw badRequest("Invalid or missing url parameter");
  }

  try {
    const upstream = await fetch(raw, {
      headers: {
        Referer: "https://pixabay.com/",
        "User-Agent":
          "Mozilla/5.0 (compatible; AccessReadyBot/1.0; +https://accessready.app)",
      },
    });

    if (!upstream.ok) {
      throw upstreamError("Upstream image unavailable", { upstreamStatus: upstream.status });
    }

    const rawCT = upstream.headers.get("content-type") ?? "";
    const contentType =
      rawCT.startsWith("image/") ? rawCT : "image/jpeg";
    const buffer = Buffer.from(await upstream.arrayBuffer());

    res.set({
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=3600",
      "Content-Length": String(buffer.length),
    });
    res.send(buffer);
  } catch (err) {
    if (isAppError(err)) throw err;
    throw upstreamError("Failed to fetch image");
  }
});

export default router;
