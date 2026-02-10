import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Link,
  useLoaderData,
  useNavigate,
  useSearchParams,
} from "react-router";

import type { Route } from "./+types/words";
import { AddWordDialog } from "~/components/add-word-dialog";
import { FrequencyCoverage } from "~/components/frequency-coverage";
import { ImportCSVDialog } from "~/components/import-csv-dialog";
import { Toast } from "~/components/toast";
import type { WordListPrefs } from "~/components/word-list";
import { WordList } from "~/components/word-list";
import { useTrackedWords } from "~/hooks/use-tracked-words";
import { computeCoverageCurve, computeFrequencyStats } from "~/lib/stats";
import type { HskWordWithDeck, WordWithTracking } from "~/lib/types";
import type { HskVersion } from "~/lib/words.server";
import {
  addCustomWord,
  addCustomWords,
  getWordIndex,
  getWords,
} from "~/lib/words.server";

const HSK_LEVELS_V3 = [1, 2, 3, 4, 5, 6, 7] as const;
const HSK_LEVELS_V2 = [1, 2, 3, 4, 5, 6] as const;
const HSK_LEVEL_LABELS: Record<number, string> = { 7: "7-9" };

function parseCookie<T>(
  cookieHeader: string | null,
  key: string,
  fallback: T,
): T {
  if (!cookieHeader) return fallback;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${key}=([^;]*)`));
  if (!match) return fallback;
  try {
    return JSON.parse(decodeURIComponent(match[1])) as T;
  } catch {
    return fallback;
  }
}

function parseCookieRaw(
  cookieHeader: string | null,
  key: string,
  fallback: string,
): string {
  if (!cookieHeader) return fallback;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${key}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : fallback;
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "add-word") {
    const simplified = (formData.get("simplified") as string)?.trim();
    const pinyin = (formData.get("pinyin") as string)?.trim();
    const meaning = (formData.get("meaning") as string)?.trim();

    if (!simplified || !pinyin || !meaning) {
      return { error: "All fields are required", ok: false };
    }

    return addCustomWord(simplified, pinyin, meaning);
  }

  if (intent === "import-csv") {
    const wordsJson = formData.get("words") as string;
    if (!wordsJson) {
      return { error: "No words provided", ok: false };
    }
    try {
      const words = JSON.parse(wordsJson) as {
        simplified: string;
        pinyin: string;
        meaning: string;
      }[];
      if (!Array.isArray(words) || words.length === 0) {
        return { error: "No valid words found", ok: false };
      }
      return addCustomWords(words);
    } catch {
      return { error: "Invalid word data", ok: false };
    }
  }

  return { error: "Unknown action", ok: false };
}

export function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const levelParam = url.searchParams.get("level");
  const level =
    levelParam === "custom"
      ? ("custom" as const)
      : levelParam
        ? Number.parseInt(levelParam, 10)
        : undefined;
  const cookieHeader = request.headers.get("cookie");

  const version = parseCookieRaw(
    cookieHeader,
    "hsk-version",
    "3.0",
  ) as HskVersion;
  const maxLevel = version === "2.0" ? 6 : 7;

  // If on a level that doesn't exist in this version, ignore the level filter
  const effectiveLevel =
    level === "custom"
      ? ("custom" as const)
      : typeof level === "number" && level <= maxLevel
        ? level
        : undefined;

  const allWords = getWords(undefined, version);
  const words =
    effectiveLevel === "custom"
      ? allWords.filter((w) => w.source === "custom")
      : effectiveLevel
        ? allWords.filter((w) => w.hskLevel === effectiveLevel)
        : allWords;

  const freqView = parseCookie<"bars" | "coverage">(
    cookieHeader,
    "freq-view",
    "bars",
  );
  const wordListPrefs: WordListPrefs = {
    columnFilters: parseCookie(cookieHeader, "wl-col-filters", []),
    columnVisibility: parseCookie(cookieHeader, "wl-col-visibility", {
      frequency: false,
      hasIndex: false,
      hskLevel: false,
      hskVersion: false,
    }),
    pinTracked: parseCookie(cookieHeader, "wl-pin-tracked", true),
    searchField: parseCookie(cookieHeader, "wl-search-field", "all" as const),
    sorting: parseCookie(cookieHeader, "wl-sorting", [
      { desc: false, id: "frequency" },
    ]),
  };

  const wordIndex = getWordIndex();
  return {
    allWords,
    currentLevel: effectiveLevel ?? null,
    freqView,
    version,
    wordIndex,
    wordListPrefs,
    words,
  };
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

function idbPut(
  db: IDBDatabase,
  entries: Record<string, unknown>,
): Promise<void> {
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

async function clearCacheDB(): Promise<void> {
  try {
    const db = await openCacheDB();
    const tx = db.transaction("data", "readwrite");
    tx.objectStore("data").clear();
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // ignore — cache clear is best-effort
  }
}

export async function clientLoader({
  serverLoader,
  request,
}: Route.ClientLoaderArgs) {
  const url = new URL(request.url);
  const levelParam = url.searchParams.get("level");
  const level =
    levelParam === "custom"
      ? ("custom" as const)
      : levelParam
        ? Number.parseInt(levelParam, 10)
        : undefined;

  const cookieHeader = document.cookie;
  const version = parseCookieRaw(
    cookieHeader,
    "hsk-version",
    "3.0",
  ) as HskVersion;

  const raw = localStorage.getItem("tracked-words");
  const trackedIds: string[] = raw ? JSON.parse(raw) : [];

  try {
    if (localStorage.getItem("cached-all-words")) {
      localStorage.removeItem("cached-hsk-version");
      localStorage.removeItem("cached-all-words");
      localStorage.removeItem("cached-word-index");
    }

    const db = await openCacheDB();
    const cachedHash = await idbGet<string>(db, "cache-hash");
    const hashValid = cachedHash === __BUILD_HASH__;

    const cachedAllWords = hashValid
      ? await idbGet<HskWordWithDeck[]>(db, `all-words-${version}`)
      : undefined;

    if (!hashValid) {
      const tx = db.transaction("data", "readwrite");
      tx.objectStore("data").clear();
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }

    if (cachedAllWords) {
      const maxLevel = version === "2.0" ? 6 : 7;
      const effectiveLevel =
        level === "custom"
          ? ("custom" as const)
          : typeof level === "number" && level <= maxLevel
            ? level
            : undefined;
      const words =
        effectiveLevel === "custom"
          ? cachedAllWords.filter((w) => w.source === "custom")
          : effectiveLevel
            ? cachedAllWords.filter((w) => w.hskLevel === effectiveLevel)
            : cachedAllWords;

      const freqView = parseCookie<"bars" | "coverage">(
        cookieHeader,
        "freq-view",
        "bars",
      );
      const wordListPrefs: WordListPrefs = {
        columnFilters: parseCookie(cookieHeader, "wl-col-filters", []),
        columnVisibility: parseCookie(cookieHeader, "wl-col-visibility", {
          frequency: false,
          hasIndex: false,
          hskLevel: false,
          hskVersion: false,
        }),
        pinTracked: parseCookie(cookieHeader, "wl-pin-tracked", true),
        searchField: parseCookie(
          cookieHeader,
          "wl-search-field",
          "all" as const,
        ),
        sorting: parseCookie(cookieHeader, "wl-sorting", [
          { desc: false, id: "frequency" },
        ]),
      };

      return {
        allWords: cachedAllWords,
        currentLevel: effectiveLevel ?? null,
        freqView,
        trackedIds,
        version,
        wordListPrefs,
        words,
      };
    }

    const serverData = await serverLoader();
    idbPut(db, {
      [`all-words-${version}`]: serverData.allWords,
      [`word-index-${version}`]: serverData.wordIndex,
      "cache-hash": __BUILD_HASH__,
    });
    return { ...serverData, trackedIds };
  } catch {
    // IndexedDB unavailable — fall back to server
    const serverData = await serverLoader();
    return { ...serverData, trackedIds };
  }
}

clientLoader.hydrate = true as const;

export async function clientAction({ serverAction }: Route.ClientActionArgs) {
  const result = await serverAction();
  if (result.ok) {
    await clearCacheDB();
  }
  return result;
}

export function HydrateFallback() {
  return (
    <div className="words-page">
      <header className="words-header">
        <h1>Mandarin Anki Deck Builder</h1>
      </header>
    </div>
  );
}

export default function WordsRoute() {
  const { words, allWords, currentLevel, freqView, wordListPrefs, version } =
    useLoaderData<typeof clientLoader>();
  const { trackedWords, toggleWord, trackAll, untrackAll } = useTrackedWords();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const hskLevels = version === "2.0" ? HSK_LEVELS_V2 : HSK_LEVELS_V3;

  const [shareToast, setShareToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Import shared words from ?share= param
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional one-time mount effect to consume share param
  useEffect(() => {
    const shareParam = searchParams.get("share");
    if (!shareParam) return;
    try {
      const decoded = decodeURIComponent(atob(shareParam));
      const ids = decoded.split(",").filter(Boolean);
      if (ids.length > 0) {
        trackAll(ids);
        setShareToast({
          message: `Added ${ids.length} shared words to your list`,
          type: "success",
        });
      }
    } catch {
      setShareToast({ message: "Invalid share link", type: "error" });
    }
    // Remove share param from URL
    searchParams.delete("share");
    setSearchParams(searchParams, { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCopyShareLink = useCallback(async () => {
    const ids = [...trackedWords];
    if (ids.length === 0) return false;
    const encoded = btoa(encodeURIComponent(ids.join(",")));
    const url = `${window.location.origin}/words?share=${encoded}`;
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch {
      return false;
    }
  }, [trackedWords]);

  const hasCustomWords = useMemo(
    () => allWords.some((w) => w.source === "custom"),
    [allWords],
  );

  const wordsWithTracking: WordWithTracking[] = useMemo(
    () => words.map((w) => ({ ...w, isTracked: trackedWords.has(w.id) })),
    [words, trackedWords],
  );

  const frequencyStats = useMemo(
    () =>
      computeFrequencyStats(
        allWords,
        trackedWords,
        typeof currentLevel === "number" ? currentLevel : undefined,
      ),
    [allWords, trackedWords, currentLevel],
  );

  const coverageCurve = useMemo(
    () => computeCoverageCurve(allWords, trackedWords),
    [allWords, trackedWords],
  );

  const trackedCount = trackedWords.size;
  const levelTrackedCount = wordsWithTracking.filter((w) => w.isTracked).length;
  const allLevelTracked =
    wordsWithTracking.length > 0 &&
    levelTrackedCount === wordsWithTracking.length;

  const handleBulkToggle = () => {
    const levelWordIds = words.map((w) => w.id);
    if (allLevelTracked) {
      untrackAll(levelWordIds);
    } else {
      trackAll(levelWordIds);
    }
  };

  const handleCSVImported = useCallback(
    (ids: string[], added: number) => {
      trackAll(ids);
      const tracked = ids.length;
      setShareToast({
        message: `${added} word${added !== 1 ? "s" : ""} added, ${tracked} word${tracked !== 1 ? "s" : ""} tracked`,
        type: "success",
      });
    },
    [trackAll],
  );

  const handleVersionToggle = () => {
    const newVersion = version === "3.0" ? "2.0" : "3.0";
    document.cookie = `hsk-version=${newVersion};path=/;max-age=31536000;SameSite=Lax`;
    navigate("/words");
  };

  return (
    <div className="words-page">
      <header className="words-header">
        <div className="header-title-row">
          <h1>Mandarin Anki Deck Builder</h1>
          <button
            className="version-toggle"
            onClick={handleVersionToggle}
            type="button"
          >
            HSK {version}
          </button>
        </div>
      </header>

      <div className="floating-actions">
        <span className="tracked-badge">{trackedCount} words tracked</span>
        <AddWordDialog existingWords={allWords} />
        <Link className="export-btn" to="/export">
          Export to Anki
        </Link>
      </div>

      <nav className="level-tabs">
        <Link
          className={`level-tab ${currentLevel === null ? "active" : ""}`}
          to="/words"
        >
          All
        </Link>
        {hskLevels.map((level) => (
          <Link
            className={`level-tab ${currentLevel === level ? "active" : ""}`}
            key={level}
            to={`/words?level=${level}`}
          >
            HSK {HSK_LEVEL_LABELS[level] ?? level}
          </Link>
        ))}
        {hasCustomWords && (
          <Link
            className={`level-tab ${currentLevel === "custom" ? "active" : ""}`}
            to="/words?level=custom"
          >
            Custom
          </Link>
        )}
      </nav>

      {currentLevel !== null && typeof currentLevel === "number" && (
        <div className="level-actions">
          <span>
            {levelTrackedCount} / {wordsWithTracking.length} tracked in HSK{" "}
            {HSK_LEVEL_LABELS[currentLevel] ?? currentLevel}
          </span>
          <button className="bulk-btn" onClick={handleBulkToggle} type="button">
            {allLevelTracked ? "Untrack All" : "Track All"} HSK{" "}
            {HSK_LEVEL_LABELS[currentLevel] ?? currentLevel}
          </button>
        </div>
      )}

      {currentLevel === "custom" && (
        <div className="level-actions">
          <span>
            {levelTrackedCount} / {wordsWithTracking.length} custom words
            tracked
          </span>
          <button className="bulk-btn" onClick={handleBulkToggle} type="button">
            {allLevelTracked ? "Untrack All" : "Track All"} Custom
          </button>
        </div>
      )}

      {currentLevel !== "custom" && (
        <FrequencyCoverage
          coverageCurve={coverageCurve}
          initialView={freqView}
          isHsk7={currentLevel === 7}
          stats={frequencyStats}
        />
      )}

      <WordList
        importButton={<ImportCSVDialog onImported={handleCSVImported} />}
        onShareList={handleCopyShareLink}
        onToggle={toggleWord}
        prefs={wordListPrefs}
        words={wordsWithTracking}
      />

      {shareToast && (
        <Toast {...shareToast} onDismiss={() => setShareToast(null)} />
      )}
    </div>
  );
}
