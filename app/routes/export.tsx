import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useLoaderData, Link } from "react-router";
import type { Route } from "./+types/export";
import { getWords, getWordIndex, type HskVersion } from "~/lib/words.server";
import { useTrackedWords } from "~/hooks/use-tracked-words";
import { useGenerateCards } from "~/hooks/use-generate-cards";
import { Toast, type ToastData } from "~/components/toast";
import { Checkbox } from "@base-ui/react/checkbox";
import { AlertDialog } from "@base-ui/react/alert-dialog";
import type { WordWithTracking, WordIndexEntry, HskWordWithDeck } from "~/lib/types";

function AudioButton({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);

  const handleClick = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      audio.currentTime = 0;
      setPlaying(false);
    } else {
      audio.play();
      setPlaying(true);
    }
  };

  return (
    <>
      <audio
        ref={audioRef}
        src={src}
        preload="none"
        onEnded={() => setPlaying(false)}
      />
      <button
        type="button"
        className="rc-audio-btn"
        onClick={handleClick}
        aria-label="Play audio"
      >
        {playing ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
            <rect x="6" y="4" width="4" height="16" rx="1" />
            <rect x="14" y="4" width="4" height="16" rx="1" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>
    </>
  );
}

interface CardTemplate {
  id: string;
  name: string;
  description?: string;
  front: (w: WordWithTracking, idx?: WordIndexEntry) => React.ReactNode;
  back: (w: WordWithTracking, idx?: WordIndexEntry) => React.ReactNode;
}

function SentenceBlockFront({ idx }: { idx?: WordIndexEntry }) {
  if (idx?.sentence) {
    return (
      <>
        <div className="rc-sentence">{idx.sentence}</div>
        {idx.sentencePinyin && (
          <div className="rc-pinyin-sen rc-whover-sen">
            {idx.sentencePinyin.includes("Sandhi:") ? (
              <>
                {idx.sentencePinyin.split("Sandhi:")[0].trim()}
                <br />
                Sandhi: {idx.sentencePinyin.split("Sandhi:")[1].trim()}
              </>
            ) : (
              idx.sentencePinyin
            )}
          </div>
        )}
      </>
    );
  }
  return <div className="rc-stub">(example sentence coming soon)</div>;
}

function SentenceBlockBack({ idx }: { idx?: WordIndexEntry }) {
  return (
    <>
      {idx?.sentence ? (
        <>
          <div className="rc-sentence">{idx.sentence}</div>
          {idx.sentencePinyin && (
            <div className="rc-pinyin-sen">
              {idx.sentencePinyin.includes("Sandhi:") ? (
                <>
                  {idx.sentencePinyin.split("Sandhi:")[0].trim()}
                  <br />
                  Sandhi: {idx.sentencePinyin.split("Sandhi:")[1].trim()}
                </>
              ) : (
                idx.sentencePinyin
              )}
            </div>
          )}
          {idx.sentenceMeaning && (
            <div className="rc-meaning-sen">{idx.sentenceMeaning}</div>
          )}
          {(idx.audio || idx.sentenceAudio) && (
            <div className="rc-audio-row">
              {idx.audio && <AudioButton src={`/media/${idx.audio}`} />}
              {idx.sentenceAudio && (
                <AudioButton src={`/media/${idx.sentenceAudio}`} />
              )}
            </div>
          )}
          {idx.sentenceImage && (
            <div className="rc-image">
              <img src={`/media/${idx.sentenceImage}`} alt="" />
            </div>
          )}
        </>
      ) : (
        <div className="rc-stub">(example sentence coming soon)</div>
      )}
    </>
  );
}

const TEMPLATES: CardTemplate[] = [
  {
    id: "character-meaning",
    name: "Character → Meaning",
    description: "The only card you need for a pure immersion approach \u2014 learning through thousands of hours of exposure to comprehensible input. This card provides enough memory scaffolding that you\u2019ll naturally acquire the rest (recall of pronunciation and characters) through immersion alone. Fewer card types means less time in Anki and more time immersing.",
    front: (w, idx) => (
      <>
        <div
          className="rc-hanzi rc-whover"
          style={{ "--pinyin": `'${idx?.pinyin || w.pinyin}'` } as React.CSSProperties}
        >
          {w.character}
        </div>
        <div className="rc-pinyin"><br /></div>
        <div className="rc-english"><br /></div>
        <div className="rc-description"><br /></div>
        <hr />
        <SentenceBlockFront idx={idx} />
      </>
    ),
    back: (w, idx) => (
      <>
        <div className="rc-hanzi">{w.character}</div>
        <div className="rc-pinyin">{idx?.pinyin || w.pinyin}</div>
        <div className="rc-english">{idx?.meaning || w.meaning}</div>
        {idx?.partOfSpeech && (
          <div className="rc-description">{idx.partOfSpeech}</div>
        )}
        <hr />
        <SentenceBlockBack idx={idx} />
      </>
    ),
  },
  {
    id: "pinyin-meaning",
    name: "Pinyin → Meaning",
    description: "Helpful for immersion learners already familiar with some pinyin but not yet with characters. Good for an easier start with your first 100\u2013300 words \u2014 after that, focus on Character \u2192 Meaning as your sole card. Also useful for a skill-based approach focused on speaking practice.",
    front: (w, idx) => (
      <>
        <div className="rc-pinyin">{idx?.pinyin || w.pinyin}</div>
        {idx?.partOfSpeech && (
          <div className="rc-description">{idx.partOfSpeech}</div>
        )}
        <hr />
        <SentenceBlockFront idx={idx} />
      </>
    ),
    back: (w, idx) => (
      <>
        <div className="rc-hanzi">{w.character}</div>
        <div className="rc-pinyin">{idx?.pinyin || w.pinyin}</div>
        <div className="rc-english">{idx?.meaning || w.meaning}</div>
        {idx?.partOfSpeech && (
          <div className="rc-description">{idx.partOfSpeech}</div>
        )}
        <hr />
        <SentenceBlockBack idx={idx} />
      </>
    ),
  },
  {
    id: "meaning-character",
    name: "Meaning \u2192 Character (Pinyin)",
    description: "Useful for a skill-based approach to learning Chinese, e.g. focusing on speaking conversationally as quickly as possible through deliberate practice.",
    front: (w, idx) => (
      <>
        <div className="rc-english">{idx?.meaning || w.meaning}</div>
        {idx?.partOfSpeech && (
          <div className="rc-description">{idx.partOfSpeech}</div>
        )}
      </>
    ),
    back: (w, idx) => (
      <>
        <div className="rc-hanzi">{w.character}</div>
        <div className="rc-pinyin">{idx?.pinyin || w.pinyin}</div>
        <div className="rc-english">{idx?.meaning || w.meaning}</div>
        {idx?.partOfSpeech && (
          <div className="rc-description">{idx.partOfSpeech}</div>
        )}
        <hr />
        <SentenceBlockBack idx={idx} />
      </>
    ),
  },
];

function parseCookieRaw(cookieHeader: string | null, key: string, fallback: string): string {
  if (!cookieHeader) return fallback;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${key}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : fallback;
}

export function loader({ request }: Route.LoaderArgs) {
  const cookieHeader = request.headers.get("cookie");
  const version = parseCookieRaw(cookieHeader, "hsk-version", "3.0") as HskVersion;
  const allWords = getWords(undefined, version);
  const wordIndex = getWordIndex();
  return { allWords, wordIndex };
}

function openCacheDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("hsk-cache", 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("data")) {
        db.createObjectStore("data");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGet<T>(db: IDBDatabase, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("data", "readonly");
    const req = tx.objectStore("data").get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(db: IDBDatabase, entries: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("data", "readwrite");
    const store = tx.objectStore("data");
    for (const [key, value] of Object.entries(entries)) {
      store.put(value, key);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clientLoader({ serverLoader }: Route.ClientLoaderArgs) {
  const raw = localStorage.getItem("tracked-words");
  const trackedIds: string[] = raw ? JSON.parse(raw) : [];

  try {
    const db = await openCacheDB();
    const version = document.cookie.match(/(?:^|;\s*)hsk-version=([^;]*)/)?.[1] ?? "3.0";
    const [cachedAllWords, cachedWordIndex] = await Promise.all([
      idbGet<HskWordWithDeck[]>(db, `all-words-${version}`),
      idbGet<Record<string, WordIndexEntry>>(db, `word-index-${version}`),
    ]);

    if (cachedAllWords && cachedWordIndex) {
      return { allWords: cachedAllWords, wordIndex: cachedWordIndex, trackedIds };
    }

    const serverData = await serverLoader();
    idbPut(db, { [`all-words-${version}`]: serverData.allWords, [`word-index-${version}`]: serverData.wordIndex });
    return { ...serverData, trackedIds };
  } catch {
    const serverData = await serverLoader();
    return { ...serverData, trackedIds };
  }
}

clientLoader.hydrate = true as const;

export function HydrateFallback() {
  return (
    <div className="export-page">
      <header className="export-header">
        <Link to="/words" className="back-link">&larr; Back to vocabulary</Link>
        <h1>Export to Anki</h1>
      </header>
    </div>
  );
}

export default function ExportRoute() {
  const { allWords, wordIndex } = useLoaderData<typeof clientLoader>();
  const { trackedWords } = useTrackedWords();
  const { generate, progress: genProgress, isGenerating, error: genError } = useGenerateCards();

  const trackedWordsList: WordWithTracking[] = useMemo(
    () => allWords
      .filter((w) => trackedWords.has(w.id))
      .map((w) => ({ ...w, isTracked: true })),
    [allWords, trackedWords],
  );

  const [currentIndex, setCurrentIndex] = useState(0);

  // Clamp index when list shrinks
  const clampedIndex = trackedWordsList.length === 0 ? 0 : Math.min(currentIndex, trackedWordsList.length - 1);
  if (clampedIndex !== currentIndex) setCurrentIndex(clampedIndex);

  const currentWord = trackedWordsList[clampedIndex] ?? null;
  const currentWordIndex = currentWord ? wordIndex[currentWord.character] : undefined;

  const goPrev = () => setCurrentIndex((i) => Math.max(0, i - 1));
  const goNext = () => setCurrentIndex((i) => Math.min(trackedWordsList.length - 1, i + 1));

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  });

  const missingCards = useMemo(
    () => trackedWordsList.filter((w) => !wordIndex[w.character]),
    [trackedWordsList, wordIndex],
  );

  const handleGenerateCurrent = useCallback(async () => {
    if (!currentWord) return;
    await generate([{ simplified: currentWord.character, pinyin: currentWord.pinyin, meaning: currentWord.meaning }]);
  }, [currentWord, generate]);

  const handleGenerateAllMissing = useCallback(async () => {
    if (missingCards.length === 0) return;
    await generate(missingCards.map((w) => ({ simplified: w.character, pinyin: w.pinyin, meaning: w.meaning })));
  }, [missingCards, generate]);

  const [regenConfirmOpen, setRegenConfirmOpen] = useState(false);

  const handleRegenerate = useCallback(async () => {
    if (!currentWord) return;
    setRegenConfirmOpen(false);
    await generate([{ simplified: currentWord.character, pinyin: currentWord.pinyin, meaning: currentWord.meaning }]);
  }, [currentWord, generate]);

  const [toast, setToast] = useState<ToastData | null>(null);
  const [enabledTemplates, setEnabledTemplates] = useState<
    Record<string, boolean>
  >(() =>
    Object.fromEntries(TEMPLATES.map((t) => [t.id, t.id === "character-meaning"]))
  );

  const selectedCount = Object.values(enabledTemplates).filter(Boolean).length;
  const totalCards = trackedWordsList.length * selectedCount;

  const toggleTemplate = (id: string) => {
    setEnabledTemplates((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleExport = useCallback(async () => {
    setToast({ type: "pending", message: "Exporting Anki deck..." });
    try {
      const selected = Object.entries(enabledTemplates)
        .filter(([, v]) => v)
        .map(([k]) => k);
      const res = await fetch("/api/export-anki", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templates: selected, trackedWords: [...trackedWords] }),
      });
      if (!res.ok) {
        const data = await res.json();
        setToast({ type: "error", message: data.error || "Export failed" });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "hsk-vocabulary.apkg";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setToast({ type: "success", message: "Anki deck downloaded!" });
    } catch {
      setToast({
        type: "error",
        message: "Failed to connect to export server",
      });
    }
  }, [enabledTemplates, trackedWords]);

  const activeTemplates = TEMPLATES.filter((t) => enabledTemplates[t.id]);

  return (
    <div className="export-page">
      <header className="export-header">
        <Link to="/words" className="back-link">
          &larr; Back to vocabulary
        </Link>
        <h1>Export to Anki</h1>
      </header>

      {trackedWordsList.length === 0 ? (
        <div className="export-empty">
          <p>No words tracked yet. Go back and track some words first.</p>
        </div>
      ) : (
        <>
          <div className="export-config">
            <h2 className="export-config-title">Card Types</h2>
            <p className="export-config-note">Each card type tests a different kind of recall.</p>
            <div className="template-toggles">
              {TEMPLATES.map((template) => (
                <div key={template.id} className="template-toggle" onClick={() => toggleTemplate(template.id)}>
                  <Checkbox.Root
                    className="template-checkbox"
                    checked={enabledTemplates[template.id]}
                    onClick={(e) => e.stopPropagation()}
                    onCheckedChange={() => toggleTemplate(template.id)}
                  >
                    <Checkbox.Indicator className="template-checkbox-indicator">
                      &#10003;
                    </Checkbox.Indicator>
                  </Checkbox.Root>
                  {template.name}
                </div>
              ))}
            </div>
          </div>

          <div className="export-summary">
            <p>
              <strong>{trackedWordsList.length}</strong> words &middot;{" "}
              {selectedCount} card {selectedCount === 1 ? "type" : "types"}{" "}
              &middot; <strong>{totalCards}</strong> total cards
              {missingCards.length > 0 && (
                <> &middot; <strong>{missingCards.length}</strong> words missing extras (sentence, audio, image)</>
              )}
            </p>
            <div className="export-summary-actions">
              {currentWord && !currentWordIndex && !isGenerating && (
                <button
                  type="button"
                  className="generate-single-btn"
                  onClick={handleGenerateCurrent}
                  disabled={isGenerating}
                >
                  Generate "{currentWord.character}"
                </button>
              )}
              {currentWord && currentWordIndex && !isGenerating && (
                <button
                  type="button"
                  className="regenerate-btn"
                  onClick={() => setRegenConfirmOpen(true)}
                  disabled={isGenerating}
                >
                  Regenerate "{currentWord.character}"
                </button>
              )}
              {missingCards.length > 0 && (
                <button
                  type="button"
                  className="generate-missing-btn"
                  onClick={handleGenerateAllMissing}
                  disabled={isGenerating}
                >
                  {isGenerating && genProgress
                    ? `Generating ${genProgress.done}/${genProgress.total}...`
                    : `Generate ${missingCards.length} Missing Extras`}
                </button>
              )}
            </div>
          </div>

          <div className="card-nav">
            <button type="button" className="card-nav-btn" onClick={goPrev} disabled={clampedIndex === 0}>&larr;</button>
            <span className="card-nav-label">
              {currentWord?.character} &mdash; {clampedIndex + 1} / {trackedWordsList.length}
            </span>
            <button type="button" className="card-nav-btn" onClick={goNext} disabled={clampedIndex >= trackedWordsList.length - 1}>&rarr;</button>
          </div>

          <div className="card-templates">
            {activeTemplates.length === 0 ? (
              <div className="card-templates-empty">
                <p>No card types selected. Enable at least one above to preview and export.</p>
              </div>
            ) : (
              activeTemplates.map((template) => (
                <div key={template.id} className="card-template-section">
                  <h2 className="template-name">{template.name}</h2>
                  {template.description && <p className="template-description">{template.description}</p>}
                  <div className="card-preview-row">
                    <div className="card-preview">
                      <div className="card-label">Front</div>
                      <div className="anki-card">
                        {currentWord && template.front(currentWord, currentWordIndex)}
                      </div>
                    </div>
                    <div className="card-preview">
                      <div className="card-label">Back</div>
                      <div className="anki-card">
                        {currentWord && template.back(currentWord, currentWordIndex)}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="export-action">
            <button
              type="button"
              className="export-confirm-btn"
              onClick={handleExport}
              disabled={toast?.type === "pending" || selectedCount === 0}
            >
              {toast?.type === "pending"
                ? "Exporting..."
                : "Download .apkg"}
            </button>
          </div>
        </>
      )}

      <AlertDialog.Root open={regenConfirmOpen} onOpenChange={setRegenConfirmOpen}>
        <AlertDialog.Portal>
          <AlertDialog.Backdrop className="dialog-backdrop" />
          <AlertDialog.Popup className="dialog-popup">
            <AlertDialog.Title className="dialog-title">Regenerate Card Data</AlertDialog.Title>
            <p className="generate-confirm-message">
              Regenerate card data for &ldquo;{currentWord?.character}&rdquo;? This will overwrite the existing sentence, audio, and image with new AI-generated content.
            </p>
            <div className="add-word-actions">
              <AlertDialog.Close className="add-word-cancel">Cancel</AlertDialog.Close>
              <button type="button" className="add-word-submit" onClick={handleRegenerate}>
                Regenerate
              </button>
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Portal>
      </AlertDialog.Root>

      {toast && <Toast {...toast} onDismiss={() => setToast(null)} />}
      {isGenerating && genProgress && (
        <Toast
          type="pending"
          message={`Generating ${genProgress.done}/${genProgress.total}${genProgress.current ? ` — ${genProgress.current}` : ""}...`}
          onDismiss={() => {}}
        />
      )}
      {!isGenerating && genError && (
        <Toast
          type="error"
          message={genError}
          onDismiss={() => {}}
        />
      )}
    </div>
  );
}
