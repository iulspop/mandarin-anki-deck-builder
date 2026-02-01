import { useCallback, useRef, useState } from "react";
import { useRevalidator } from "react-router";

export interface GenerateProgress {
  done: number;
  total: number;
  current: string;
}

interface WordInput {
  simplified: string;
  pinyin: string;
  meaning: string;
  partOfSpeech?: string;
}

export function useGenerateCards() {
  const [progress, setProgress] = useState<GenerateProgress | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const revalidator = useRevalidator();
  const abortRef = useRef<AbortController | null>(null);

  const generate = useCallback(async (words: WordInput[]) => {
    if (words.length === 0) return;

    setIsGenerating(true);
    setError(null);
    setProgress({ done: 0, total: words.length, current: "" });

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/generate-cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ words }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Server error ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.complete) {
              setProgress(null);
            } else if (event.error && !event.done) {
              throw new Error(event.error);
            } else if (event.done !== undefined) {
              setProgress({ done: event.done, total: event.total, current: event.current });
            }
          } catch (e) {
            if (e instanceof SyntaxError) continue;
            throw e;
          }
        }
      }

      // Clear IndexedDB cache
      try {
        const req = indexedDB.open("hsk-cache", 1);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("data", "readwrite");
          tx.objectStore("data").clear();
        };
      } catch {
        // best-effort
      }

      revalidator.revalidate();
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setError((e as Error).message);
      }
    } finally {
      setIsGenerating(false);
      abortRef.current = null;
    }
  }, [revalidator]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const revalidating = revalidator.state === "loading";

  return { generate, progress, isGenerating: isGenerating || revalidating, error, cancel };
}
