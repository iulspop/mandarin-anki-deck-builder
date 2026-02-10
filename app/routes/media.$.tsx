import fs from "node:fs";
import path from "node:path";

import type { Route } from "./+types/media.$";

const MEDIA_DIR = path.join(process.cwd(), "data", "media");

const MIME_TYPES: Record<string, string> = {
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export function loader({ params }: Route.LoaderArgs) {
  const filename = params["*"];
  if (!filename) throw new Response("Not found", { status: 404 });

  // Prevent path traversal
  const resolved = path.resolve(MEDIA_DIR, filename);
  if (!resolved.startsWith(MEDIA_DIR)) {
    throw new Response("Forbidden", { status: 403 });
  }

  if (!fs.existsSync(resolved)) {
    throw new Response("Not found", { status: 404 });
  }

  const ext = path.extname(filename).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";

  return new Response(fs.readFileSync(resolved), {
    headers: {
      "Cache-Control": "public, max-age=86400",
      "Content-Type": contentType,
    },
  });
}
