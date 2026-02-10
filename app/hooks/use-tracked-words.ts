import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "tracked-words";

let cachedSet: Set<string> | null = null;
const listeners = new Set<() => void>();

function getSnapshot(): Set<string> {
  if (cachedSet) return cachedSet;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    cachedSet = raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    cachedSet = new Set();
  }
  return cachedSet;
}

const emptySet = new Set<string>();
function getServerSnapshot(): Set<string> {
  return emptySet;
}

function save(next: Set<string>): void {
  cachedSet = next;
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  const handleStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      cachedSet = null;
      for (const l of listeners) l();
    }
  };
  window.addEventListener("storage", handleStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", handleStorage);
  };
}

export function useTrackedWords() {
  const trackedWords = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const toggleWord = useCallback((id: string) => {
    const current = getSnapshot();
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    save(next);
  }, []);

  const trackAll = useCallback((ids: string[]) => {
    const current = getSnapshot();
    const next = new Set(current);
    for (const id of ids) next.add(id);
    save(next);
  }, []);

  const untrackAll = useCallback((ids: string[]) => {
    const current = getSnapshot();
    const next = new Set(current);
    for (const id of ids) next.delete(id);
    save(next);
  }, []);

  return { toggleWord, trackAll, trackedWords, untrackAll };
}
