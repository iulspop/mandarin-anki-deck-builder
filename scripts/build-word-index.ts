import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..");
const DECKS_DIR = path.join(ROOT, "decks");
const OUTPUT_JSON = path.join(ROOT, "data", "word-index.json");
const OUTPUT_MEDIA = path.join(ROOT, "data", "media");

interface WordEntry {
  simplified: string;
  pinyin: string;
  meaning: string;
  partOfSpeech: string;
  audio: string;
  sentence: string;
  sentencePinyin: string;
  sentenceMeaning: string;
  sentenceAudio: string;
  sentenceImage: string;
  source: string;
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, "").trim();
}

function extractSound(s: string): string {
  const m = s.match(/\[sound:([^\]]+)\]/);
  return m ? m[1] : "";
}

function extractImage(s: string): string {
  const m = s.match(/src="([^"]+)"/);
  return m ? m[1] : "";
}

interface DeckNote {
  fields: string[];
}

interface DeckJson {
  notes: DeckNote[];
}

function loadRefold(): Map<string, WordEntry> {
  const deckPath = path.join(
    DECKS_DIR,
    "Refold_Mandarin_1k_Simplified",
    "deck.json",
  );
  if (!fs.existsSync(deckPath)) return new Map();

  const deck: DeckJson = JSON.parse(fs.readFileSync(deckPath, "utf-8"));
  const entries = new Map<string, WordEntry>();

  for (const note of deck.notes) {
    const f = note.fields;
    const simplified = f[1];
    if (!simplified) continue;

    entries.set(simplified, {
      audio: extractSound(f[6]),
      meaning: f[4],
      partOfSpeech: f[5],
      pinyin: f[3],
      sentence: stripHtml(f[7]),
      sentenceAudio: extractSound(f[11]),
      sentenceImage: extractImage(f[12]),
      sentenceMeaning: f[10],
      sentencePinyin: stripHtml(f[9]),
      simplified,
      source: "refold",
    });
  }

  console.log(`Refold: ${entries.size} words`);
  return entries;
}

function loadHsk1000_5000(): Map<string, WordEntry> {
  const deckPath = path.join(DECKS_DIR, "Mandarin_HSK_1000-5000", "deck.json");
  if (!fs.existsSync(deckPath)) return new Map();

  const deck: DeckJson = JSON.parse(fs.readFileSync(deckPath, "utf-8"));
  const entries = new Map<string, WordEntry>();

  for (const note of deck.notes) {
    const f = note.fields;
    const simplified = f[1];
    if (!simplified) continue;

    entries.set(simplified, {
      audio: extractSound(f[7]),
      meaning: f[5],
      partOfSpeech: f[6],
      pinyin: f[3], // Pinyin.1 (tone marks)
      sentence: stripHtml(f[10]),
      sentenceAudio: extractSound(f[17]),
      sentenceImage: extractImage(f[18]),
      sentenceMeaning: f[16],
      sentencePinyin: stripHtml(f[14]), // SentencePinyin.1 (tone marks)
      simplified,
      source: "hsk1000-5000",
    });
  }

  console.log(`HSK 1000-5000: ${entries.size} words`);
  return entries;
}

function copyMedia(index: Map<string, WordEntry>) {
  fs.mkdirSync(OUTPUT_MEDIA, { recursive: true });

  const mediaDirs: Record<string, string> = {
    "hsk1000-5000": path.join(DECKS_DIR, "Mandarin_HSK_1000-5000", "media"),
    refold: path.join(DECKS_DIR, "Refold_Mandarin_1k_Simplified", "media"),
  };

  let copied = 0;
  const seen = new Set<string>();

  for (const entry of index.values()) {
    const mediaDir = mediaDirs[entry.source];
    if (!mediaDir) continue;

    for (const file of [
      entry.audio,
      entry.sentenceAudio,
      entry.sentenceImage,
    ]) {
      if (!file || seen.has(file)) continue;
      seen.add(file);

      const src = path.join(mediaDir, file);
      const dst = path.join(OUTPUT_MEDIA, file);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dst);
        copied++;
      }
    }
  }

  console.log(`Copied ${copied} media files`);
}

// Build merged index: Refold takes priority
const refold = loadRefold();
const hsk = loadHsk1000_5000();

const merged = new Map<string, WordEntry>();

// HSK first so Refold overwrites
for (const [k, v] of hsk) merged.set(k, v);
for (const [k, v] of refold) merged.set(k, v);

console.log(`Merged index: ${merged.size} words`);

// Write JSON
const obj: Record<string, WordEntry> = {};
for (const [k, v] of merged) obj[k] = v;
fs.writeFileSync(OUTPUT_JSON, `${JSON.stringify(obj, null, 2)}\n`);
console.log(`Written to ${OUTPUT_JSON}`);

// Copy media
copyMedia(merged);
