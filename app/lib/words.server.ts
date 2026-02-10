import path from "node:path";
import Database from "better-sqlite3";

import type { HskWord, HskWordWithDeck, WordIndexEntry } from "./types";

export type HskVersion = "2.0" | "3.0";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "words.db");

let db: ReturnType<typeof Database> | null = null;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    // Migrate: add traditional column if missing
    const cols = db.prepare("PRAGMA table_info(words)").all() as Array<{
      name: string;
    }>;
    if (!cols.some((c) => c.name === "traditional")) {
      db.exec("ALTER TABLE words ADD COLUMN traditional TEXT");
    }
  }
  return db;
}

const cachedWords = new Map<HskVersion, HskWord[]>();

export function getAllWords(version: HskVersion = "3.0"): HskWord[] {
  const cached = cachedWords.get(version);
  if (cached) return cached;

  const col = version === "2.0" ? "hsk_level_v2" : "hsk_level_v3";
  const rows = getDb()
    .prepare(
      `SELECT simplified, pinyin, meaning, traditional, ${col} AS hsk_level, hsk_level_v2, hsk_level_v3, frequency, source
       FROM words
       WHERE hsk_level_v2 IS NOT NULL OR hsk_level_v3 IS NOT NULL OR source = 'custom'
       ORDER BY CASE WHEN source = 'custom' THEN 1 ELSE 0 END, ${col}, pinyin`,
    )
    .all() as Array<{
    simplified: string;
    pinyin: string;
    meaning: string;
    traditional: string | null;
    hsk_level: number | null;
    hsk_level_v2: number | null;
    hsk_level_v3: number | null;
    frequency: number | null;
    source: string;
  }>;

  const words: HskWord[] = rows.map((r) => ({
    character: r.simplified,
    frequency: r.frequency,
    hskLevel: r.hsk_level,
    hskLevelV2: r.hsk_level_v2,
    hskLevelV3: r.hsk_level_v3,
    id: r.simplified,
    meaning: r.meaning,
    pinyin: r.pinyin,
    source: r.source,
    traditional: r.traditional,
  }));

  cachedWords.set(version, words);
  return words;
}

export function getWords(
  level?: number | "custom",
  version: HskVersion = "3.0",
): HskWordWithDeck[] {
  const allWords = getAllWords(version);
  const wordIndex = getWordIndex();
  const filtered =
    level === "custom"
      ? allWords.filter((w) => w.source === "custom")
      : level
        ? allWords.filter((w) => w.hskLevel === level)
        : allWords;

  return filtered.map((w) => {
    const card = wordIndex[w.id];
    return {
      ...w,
      audio: card?.audio || null,
      hasIndex: !!card,
    };
  });
}

function clearCache() {
  cachedWords.clear();
}

export function addCustomWord(
  simplified: string,
  pinyin: string,
  meaning: string,
): { ok: true } | { ok: false; error: string } {
  const existing = getDb()
    .prepare("SELECT simplified FROM words WHERE simplified = ?")
    .get(simplified) as { simplified: string } | undefined;

  if (existing) {
    return {
      error: `"${simplified}" already exists in the word list`,
      ok: false,
    };
  }

  getDb()
    .prepare(
      `INSERT INTO words (simplified, pinyin, meaning, source)
       VALUES (?, ?, ?, 'custom')`,
    )
    .run(simplified, pinyin, meaning);

  clearCache();
  return { ok: true };
}

export function addCustomWords(
  words: { simplified: string; pinyin: string; meaning: string }[],
): { ok: true; ids: string[]; added: number } {
  const database = getDb();
  const insert = database.prepare(
    `INSERT OR IGNORE INTO words (simplified, pinyin, meaning, source)
     VALUES (?, ?, ?, 'custom')`,
  );

  let added = 0;
  const tx = database.transaction(() => {
    for (const w of words) {
      const result = insert.run(w.simplified, w.pinyin, w.meaning);
      if (result.changes > 0) added++;
    }
  });
  tx();

  clearCache();
  return { added, ids: words.map((w) => w.simplified), ok: true };
}

let cachedIndex: Record<string, WordIndexEntry> | null = null;

export function clearWordIndexCache() {
  cachedIndex = null;
  cachedWords.clear();
}

export function getWordIndex(): Record<string, WordIndexEntry> {
  if (cachedIndex) return cachedIndex;

  const rows = getDb().prepare("SELECT * FROM word_cards").all() as Array<{
    simplified: string;
    pinyin: string;
    meaning: string;
    part_of_speech: string;
    audio: string;
    sentence: string;
    sentence_pinyin: string;
    sentence_meaning: string;
    sentence_audio: string;
    sentence_image: string;
    card_source: string;
  }>;

  const index: Record<string, WordIndexEntry> = {};
  for (const r of rows) {
    index[r.simplified] = {
      audio: r.audio ?? "",
      meaning: r.meaning ?? "",
      partOfSpeech: r.part_of_speech ?? "",
      pinyin: r.pinyin ?? "",
      sentence: r.sentence ?? "",
      sentenceAudio: r.sentence_audio ?? "",
      sentenceImage: r.sentence_image ?? "",
      sentenceMeaning: r.sentence_meaning ?? "",
      sentencePinyin: r.sentence_pinyin ?? "",
      simplified: r.simplified,
      source: r.card_source ?? "",
    };
  }

  cachedIndex = index;
  return cachedIndex;
}
