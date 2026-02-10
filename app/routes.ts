import type { RouteConfig } from "@react-router/dev/routes";
import { index, route } from "@react-router/dev/routes";

export default [
  index("routes/_index.tsx"),
  route("words", "routes/words.tsx"),
  route("export", "routes/export.tsx"),
  route("api/export-anki", "routes/api.export-anki.ts"),
  route("api/generate-cards", "routes/api.generate-cards.ts"),
  route("media/*", "routes/media.$.tsx"),
] satisfies RouteConfig;
