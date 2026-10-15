import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Content-ID referenced in email HTML (`cid:…`). */
export const EMAIL_LOGO_CID = "access-ready-logo@accessready";

export function emailLogoSrc(): string {
  return `cid:${EMAIL_LOGO_CID}`;
}

/** Resolve bundled logo on disk (api-server/assets, monorepo FE public, or EMAIL_LOGO_PATH). */
export function resolveEmailLogoPath(): string | null {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    process.env.EMAIL_LOGO_PATH,
    path.resolve(here, "../../../assets/goelprep-logo.png"),
    path.resolve(process.cwd(), "assets/goelprep-logo.png"),
    path.resolve(process.cwd(), "../access-ready/public/goelprep-logo.png"),
  ].filter((p): p is string => Boolean(p?.trim()));

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      /* ignore */
    }
  }
  return null;
}

export function emailLogoAttachment(): {
  filename: string;
  path: string;
  cid: string;
} | null {
  const logoPath = resolveEmailLogoPath();
  if (!logoPath) return null;
  return {
    filename: "goelprep-logo.png",
    path: logoPath,
    cid: EMAIL_LOGO_CID,
  };
}
