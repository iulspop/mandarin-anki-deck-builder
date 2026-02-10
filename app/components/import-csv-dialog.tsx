import { Dialog } from "@base-ui/react/dialog";
import { Tooltip } from "@base-ui/react/tooltip";
import { FileDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";

interface ParsedWord {
  simplified: string;
  pinyin: string;
  meaning: string;
}

function parseCSV(text: string): { words: ParsedWord[]; error: string | null } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { error: "File is empty", words: [] };

  // Detect if first line is a header
  const firstLine = lines[0].toLowerCase();
  const startIdx =
    firstLine.includes("character") || firstLine.includes("simplified") ? 1 : 0;

  const words: ParsedWord[] = [];
  const errors: string[] = [];

  for (let i = startIdx; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim());
    if (cols.length < 3) {
      errors.push(`Row ${i + 1}: expected 3 columns, got ${cols.length}`);
      continue;
    }
    const [simplified, pinyin, meaning] = cols;
    if (!simplified || !pinyin || !meaning) {
      errors.push(`Row ${i + 1}: missing value`);
      continue;
    }
    words.push({ meaning: cols.slice(2).join(", "), pinyin, simplified });
  }

  if (words.length === 0) {
    return {
      error: errors.length > 0 ? errors.join("\n") : "No valid rows found",
      words: [],
    };
  }

  return {
    error: errors.length > 0 ? `${errors.length} row(s) skipped` : null,
    words,
  };
}

export function ImportCSVDialog({
  onImported,
}: {
  onImported: (ids: string[], added: number) => void;
}) {
  const fetcher = useFetcher<{
    ok: boolean;
    ids?: string[];
    added?: number;
    error?: string;
  }>();
  const [open, setOpen] = useState(false);
  const [parsed, setParsed] = useState<ParsedWord[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const isSubmitting = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      if (fetcher.data.ok && fetcher.data.ids) {
        onImported(fetcher.data.ids, fetcher.data.added ?? 0);
        setOpen(false);
      } else {
        setServerError(fetcher.data.error ?? "Import failed");
      }
    }
  }, [fetcher.data, fetcher.state, onImported]);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      setParsed(null);
      setParseError(null);
      setServerError(null);
      setFileName(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setServerError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const { words, error } = parseCSV(reader.result as string);
      setParsed(words.length > 0 ? words : null);
      setParseError(error);
    };
    reader.readAsText(file);
  };

  const handleSubmit = () => {
    if (!parsed || parsed.length === 0) return;
    const formData = new FormData();
    formData.set("intent", "import-csv");
    formData.set("words", JSON.stringify(parsed));
    fetcher.submit(formData, { action: "/words", method: "post" });
  };

  return (
    <Dialog.Root onOpenChange={handleOpenChange} open={open}>
      <Tooltip.Provider>
        <Tooltip.Root>
          <Tooltip.Trigger
            render={
              <Dialog.Trigger
                aria-label="Import CSV"
                className="import-csv-btn"
              />
            }
          >
            <FileDown size={14} />
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Positioner side="top" sideOffset={8}>
              <Tooltip.Popup className="share-copied-tooltip">
                Import CSV (Character, Pinyin, Meaning)
              </Tooltip.Popup>
            </Tooltip.Positioner>
          </Tooltip.Portal>
        </Tooltip.Root>
      </Tooltip.Provider>
      <Dialog.Portal>
        <Dialog.Backdrop className="dialog-backdrop" />
        <Dialog.Popup className="dialog-popup import-csv-dialog">
          <Dialog.Title className="dialog-title">
            Import Words from CSV
          </Dialog.Title>
          <p className="import-csv-hint">
            CSV should have columns: <code>Character, Pinyin, Meaning</code>
          </p>
          <input
            accept=".csv,text/csv"
            className="import-csv-file-hidden"
            onChange={handleFileChange}
            ref={fileRef}
            type="file"
          />
          <div className="import-csv-file-row">
            <button
              className="import-csv-choose-btn"
              onClick={() => fileRef.current?.click()}
              type="button"
            >
              Choose File
            </button>
            <span className="import-csv-file-name">
              {fileName ?? "No file chosen"}
            </span>
          </div>
          {parseError && <p className="import-csv-warning">{parseError}</p>}
          {parsed && parsed.length > 0 && (
            <div className="import-csv-preview">
              <p className="import-csv-count">
                {parsed.length} word(s) ready to import
              </p>
              <div className="import-csv-table">
                <div className="import-csv-table-header">
                  <span>Character</span>
                  <span>Pinyin</span>
                  <span>Meaning</span>
                </div>
                <div className="import-csv-table-body">
                  {parsed.slice(0, 50).map((w) => (
                    <div className="import-csv-table-row" key={w.simplified}>
                      <span>{w.simplified}</span>
                      <span>{w.pinyin}</span>
                      <span>{w.meaning}</span>
                    </div>
                  ))}
                  {parsed.length > 50 && (
                    <p className="import-csv-truncated">
                      ...and {parsed.length - 50} more
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
          {serverError && <p className="add-word-error">{serverError}</p>}
          <div className="add-word-actions">
            <Dialog.Close className="add-word-cancel">Cancel</Dialog.Close>
            <button
              className="add-word-submit"
              disabled={isSubmitting || !parsed || parsed.length === 0}
              onClick={handleSubmit}
              type="button"
            >
              {isSubmitting ? "Importing..." : "Import"}
            </button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
