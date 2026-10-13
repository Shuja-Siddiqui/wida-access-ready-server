/**
 * Image proxy — streams Pixabay CDN images through our server.
 *
 * Pixabay's webformatURL has same-origin referrer protection; browsers
 * requesting the URL directly (with our app domain as Referer) get a 429.
 * Fetching server-side works fine — no Referer restriction applies.
 *
 * GET /api/images/proxy?url=<encoded-pixabay-url>
 */

import { Router, type IRouter } from "express";

const router: IRouter = Router();

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
    res.status(400).json({ error: "Invalid or missing url parameter" });
    return;
  }

  try {
    const upstream = await fetch(raw, {
      headers: {
        // Mimic a browser visiting pixabay.com so the CDN treats it as same-origin
        Referer: "https://pixabay.com/",
        "User-Agent":
          "Mozilla/5.0 (compatible; AccessReadyBot/1.0; +https://accessready.app)",
      },
    });

    if (!upstream.ok) {
      res.status(upstream.status).json({ error: "Upstream image unavailable" });
      return;
    }

    // Pixabay CDN returns binary/octet-stream; force image/jpeg so browsers render it.
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
  } catch {
    res.status(502).json({ error: "Failed to fetch image" });
  }
});

export default router;
