import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const DATA_DIR = path.join(import.meta.dirname, "..", "data");
const COMPLETE_PATH = path.join(DATA_DIR, "complete.json");
const INDEX_PATH = path.join(DATA_DIR, "word-index.json");
const DB_PATH = path.join(DATA_DIR, "words.db");

function parseLevel(levelStr: string, prefix: string): number | null {
  const match = levelStr.match(new RegExp(`^${prefix}-(\\d+)$`));
  return match ? Number.parseInt(match[1], 10) : null;
}

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS words (
    simplified TEXT PRIMARY KEY,
    pinyin TEXT NOT NULL,
    meaning TEXT NOT NULL,
    traditional TEXT,
    hsk_level_v2 INTEGER,
    hsk_level_v3 INTEGER,
    frequency INTEGER,
    pos TEXT,
    source TEXT NOT NULL DEFAULT 'hsk'
  );

  CREATE TABLE IF NOT EXISTS word_cards (
    simplified TEXT PRIMARY KEY REFERENCES words(simplified),
    pinyin TEXT,
    meaning TEXT,
    part_of_speech TEXT,
    audio TEXT,
    sentence TEXT,
    sentence_pinyin TEXT,
    sentence_meaning TEXT,
    sentence_audio TEXT,
    sentence_image TEXT,
    card_source TEXT
  );
`);

// --- Migrate: add traditional column if missing ---
const cols = db.prepare("PRAGMA table_info(words)").all() as Array<{
  name: string;
}>;
if (!cols.some((c) => c.name === "traditional")) {
  db.exec("ALTER TABLE words ADD COLUMN traditional TEXT");
}

// --- Sync words from complete.json ---

const raw = JSON.parse(fs.readFileSync(COMPLETE_PATH, "utf-8")) as Array<{
  simplified: string;
  frequency: number;
  level: string[];
  pos?: string[];
  forms: Array<{
    traditional?: string;
    transcriptions: { pinyin: string };
    meanings: string[];
  }>;
}>;

const upsertWord = db.prepare(`
  INSERT OR REPLACE INTO words (simplified, pinyin, meaning, traditional, hsk_level_v2, hsk_level_v3, frequency, pos, source)
  VALUES (@simplified, @pinyin, @meaning, @traditional, @hsk_level_v2, @hsk_level_v3, @frequency, @pos, @source)
`);

const syncWords = db.transaction(() => {
  for (const entry of raw) {
    const form = entry.forms[0];
    if (!form) continue;

    const hskV2 =
      entry.level.map((l) => parseLevel(l, "old")).find((l) => l !== null) ??
      null;
    const hskV3 =
      entry.level.map((l) => parseLevel(l, "new")).find((l) => l !== null) ??
      null;

    if (hskV2 === null && hskV3 === null) continue;

    upsertWord.run({
      frequency: entry.frequency,
      hsk_level_v2: hskV2,
      hsk_level_v3: hskV3,
      meaning: form.meanings.join("; "),
      pinyin: form.transcriptions.pinyin,
      pos: entry.pos ? entry.pos.join(",") : null,
      simplified: entry.simplified,
      source: "hsk",
      traditional: form.traditional ?? null,
    });
  }
});

syncWords();
console.log("Synced words table from complete.json");

// --- Sync word_cards from word-index.json ---

if (fs.existsSync(INDEX_PATH)) {
  const index = JSON.parse(fs.readFileSync(INDEX_PATH, "utf-8")) as Record<
    string,
    {
      simplified: string;
      pinyin: string;
      meaning: string;
      partOfSpeech?: string;
      audio?: string;
      sentence?: string;
      sentencePinyin?: string;
      sentenceMeaning?: string;
      sentenceAudio?: string;
      sentenceImage?: string;
      source?: string;
    }
  >;

  // Ensure every card has a parent row in words (cards may reference words not in HSK lists)
  const ensureWord = db.prepare(`
    INSERT OR IGNORE INTO words (simplified, pinyin, meaning, source)
    VALUES (@simplified, @pinyin, @meaning, 'custom')
  `);

  const upsertCard = db.prepare(`
    INSERT OR REPLACE INTO word_cards (simplified, pinyin, meaning, part_of_speech, audio, sentence, sentence_pinyin, sentence_meaning, sentence_audio, sentence_image, card_source)
    VALUES (@simplified, @pinyin, @meaning, @part_of_speech, @audio, @sentence, @sentence_pinyin, @sentence_meaning, @sentence_audio, @sentence_image, @card_source)
  `);

  const syncCards = db.transaction(() => {
    for (const [key, card] of Object.entries(index)) {
      const simplified = card.simplified || key;
      ensureWord.run({
        meaning: card.meaning || "",
        pinyin: card.pinyin || "",
        simplified,
      });
      upsertCard.run({
        audio: card.audio || null,
        card_source: card.source || null,
        meaning: card.meaning || null,
        part_of_speech: card.partOfSpeech || null,
        pinyin: card.pinyin || null,
        sentence: card.sentence || null,
        sentence_audio: card.sentenceAudio || null,
        sentence_image: card.sentenceImage || null,
        sentence_meaning: card.sentenceMeaning || null,
        sentence_pinyin: card.sentencePinyin || null,
        simplified: card.simplified || key,
      });
    }
  });

  syncCards();
  console.log("Synced word_cards table from word-index.json");
} else {
  console.log("No word-index.json found, skipping word_cards sync");
}

const wordCount = (
  db.prepare("SELECT COUNT(*) AS count FROM words").get() as { count: number }
).count;
const cardCount = (
  db.prepare("SELECT COUNT(*) AS count FROM word_cards").get() as {
    count: number;
  }
).count;
console.log(`Database: ${wordCount} words, ${cardCount} cards`);

db.close();
