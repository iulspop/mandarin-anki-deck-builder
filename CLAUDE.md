# Mandarin Anki Deck Builder

## Architecture

React Router framework mode app with a Python Flask companion server for AI-powered card generation and Anki export.

### Node app (main)
- **Framework**: React Router v7 (framework mode), Vite, TailwindCSS v4
- **Database**: SQLite via `better-sqlite3` at `data/words.db`
- **Key routes**: `/words` (vocabulary browser), `/export` (Anki export preview), `/api/export-anki` (proxy to Python)
- **Client caching**: IndexedDB (`hsk-cache`) with build-hash invalidation — `__BUILD_HASH__` injected via Vite `define`
- **Search**: uFuzzy for Latin queries (pinyin/meaning), substring for Chinese character queries
- **Word data source**: `data/complete.json` synced to SQLite via `scripts/sync-db.ts`

### Python server
- **Location**: `python-server/server.py`
- **Purpose**: Anki `.apkg` generation (genanki), AI sentence generation (Claude), TTS (Google Cloud), image generation (Stability AI)
- **Runs on port 5001**, proxied from Node via `/api/export-anki`

### Database schema
- `words` table: `simplified` (PK), `pinyin`, `meaning`, `traditional`, `hsk_level_v2`, `hsk_level_v3`, `frequency`, `pos`, `source`
- `word_cards` table: `simplified` (PK, FK), card data (audio, sentence, image, etc.)
- Auto-migration in `words.server.ts` `getDb()` adds missing columns on startup

### Deployment
- Docker: two containers (`node` + `python`), `data/` volume-mounted (not baked into image)
- `docker-compose.yml` at repo root
- VPS at `chinese-vocabulary.polyanova.com`
- DB migrations must happen at runtime (server startup) since `data/` is a volume mount

## Commands

- `npm run dev` — start dev server
- `npm run build` — production build
- `npx tsx scripts/sync-db.ts` — sync `complete.json` + `word-index.json` into SQLite
- `npx react-router typegen && npx tsc --noEmit` — typecheck

## Key patterns

- HSK words exist in v2, v3, or both — always query with `WHERE hsk_level_v2 IS NOT NULL OR hsk_level_v3 IS NOT NULL OR source = 'custom'`
- Client loader uses IndexedDB cache with `__BUILD_HASH__` invalidation; `clientAction` clears cache on mutations
- Word list uses TanStack Table with virtualized rows (~11k words), column visibility persisted in cookies
- Tracked words stored in `localStorage` (`tracked-words` key)
