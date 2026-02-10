import { Dialog } from "@base-ui/react/dialog";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFetcher } from "react-router";

import type { HskWordWithDeck } from "~/lib/types";

export function AddWordDialog({
  existingWords,
}: {
  existingWords: HskWordWithDeck[];
}) {
  const fetcher = useFetcher<{ ok: boolean; error?: string }>();
  const [open, setOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [simplified, setSimplified] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const isSubmitting = fetcher.state !== "idle";

  const existingIds = useMemo(
    () => new Set(existingWords.map((w) => w.id)),
    [existingWords],
  );

  const simplifiedError =
    simplified.trim() && existingIds.has(simplified.trim())
      ? `"${simplified.trim()}" already exists in the word list`
      : null;

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      if (fetcher.data.ok) {
        setOpen(false);
      } else {
        setServerError(fetcher.data.error ?? "Failed to add word");
      }
    }
  }, [fetcher.data, fetcher.state]);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      setServerError(null);
      setSimplified("");
      formRef.current?.reset();
    }
  };

  return (
    <Dialog.Root onOpenChange={handleOpenChange} open={open}>
      <Dialog.Trigger className="add-word-btn">+ Add Word</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="dialog-backdrop" />
        <Dialog.Popup className="dialog-popup">
          <Dialog.Title className="dialog-title">Add Custom Word</Dialog.Title>
          <fetcher.Form
            action="/words"
            className="add-word-form"
            method="post"
            onChange={() => setServerError(null)}
            ref={formRef}
          >
            <input name="intent" type="hidden" value="add-word" />
            <div
              className={`add-word-field ${simplifiedError ? "field-invalid" : ""}`}
            >
              <label className="add-word-label" htmlFor="add-simplified">
                Simplified
              </label>
              <input
                className="add-word-input"
                id="add-simplified"
                name="simplified"
                onChange={(e) => setSimplified(e.target.value)}
                placeholder="e.g. 咖啡"
                required
                value={simplified}
              />
              {simplifiedError && (
                <p className="add-word-field-error">{simplifiedError}</p>
              )}
            </div>
            <div className="add-word-field">
              <label className="add-word-label" htmlFor="add-pinyin">
                Pinyin
              </label>
              <input
                className="add-word-input"
                id="add-pinyin"
                name="pinyin"
                placeholder="e.g. kāfēi"
                required
              />
            </div>
            <div className="add-word-field">
              <label className="add-word-label" htmlFor="add-meaning">
                Meaning
              </label>
              <input
                className="add-word-input"
                id="add-meaning"
                name="meaning"
                placeholder="e.g. coffee"
                required
              />
            </div>
            {serverError && <p className="add-word-error">{serverError}</p>}
            <div className="add-word-actions">
              <Dialog.Close className="add-word-cancel">Cancel</Dialog.Close>
              <button
                className="add-word-submit"
                disabled={isSubmitting || !!simplifiedError}
                type="submit"
              >
                {isSubmitting ? "Adding..." : "Add Word"}
              </button>
            </div>
          </fetcher.Form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
