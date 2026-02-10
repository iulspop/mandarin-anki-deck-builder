import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..");
const COMPLETE_PATH = path.join(ROOT, "data", "complete.json");
const WORD_INDEX_PATH = path.join(ROOT, "data", "word-index.json");

interface CompleteWord {
  simplified: string;
  level: string;
}

interface WordIndexEntry {
  simplified: string;
  pinyin: string;
  meaning: string;
  source: string;
}

// Load all HSK words (both versions)
const completeData: CompleteWord[] = JSON.parse(
  fs.readFileSync(COMPLETE_PATH, "utf-8"),
);
const hskWords = new Set(completeData.map((w) => w.simplified));

// Load word index (merged deck cards)
const wordIndex: Record<string, WordIndexEntry> = JSON.parse(
  fs.readFileSync(WORD_INDEX_PATH, "utf-8"),
);

// Find cards not in HSK list
const unmatched: WordIndexEntry[] = [];
for (const [key, entry] of Object.entries(wordIndex)) {
  if (!hskWords.has(key)) {
    unmatched.push(entry);
  }
}

// Print results
console.log(`HSK words: ${hskWords.size}`);
console.log(`Deck cards: ${Object.keys(wordIndex).length}`);
console.log(`Cards NOT in HSK list: ${unmatched.length}\n`);

if (unmatched.length > 0) {
  console.log("Character | Pinyin | Meaning | Source");
  console.log("----------|--------|---------|-------");
  for (const entry of unmatched) {
    const meaning =
      entry.meaning.length > 60
        ? `${entry.meaning.slice(0, 57)}...`
        : entry.meaning;
    console.log(
      `${entry.simplified} | ${entry.pinyin} | ${meaning} | ${entry.source}`,
    );
  }
}
