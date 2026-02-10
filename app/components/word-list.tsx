import { Checkbox } from "@base-ui/react/checkbox";
import { Input } from "@base-ui/react/input";
import { Popover } from "@base-ui/react/popover";
import { Select } from "@base-ui/react/select";
import { Tooltip } from "@base-ui/react/tooltip";
import uFuzzy from "@leeoniya/ufuzzy";
import type {
  ColumnFiltersState,
  SortingState,
  VisibilityState,
} from "@tanstack/react-table";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronDown,
  Filter,
  Pin,
  Search,
  Settings2,
  Share2,
  Volume2,
} from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";

import { TrackCell } from "./word-list-item";
import type { WordWithTracking } from "~/lib/types";

const columnHelper = createColumnHelper<WordWithTracking>();

const columns = [
  columnHelper.accessor("isTracked", {
    cell: ({ row, table }) => (
      <TrackCell
        onToggle={
          (table.options.meta as { onToggle: (id: string) => void }).onToggle
        }
        word={row.original}
      />
    ),
    enableSorting: true,
    filterFn: (row, _columnId, filterValue: string) => {
      if (filterValue === "all") return true;
      return filterValue === "tracked"
        ? row.original.isTracked
        : !row.original.isTracked;
    },
    header: "Track",
    id: "track",
    meta: { className: "col-track", gridWidth: "minmax(75px, 7%)" },
  }),
  columnHelper.accessor("character", {
    enableSorting: false,
    header: "Character",
    meta: { className: "col-character", gridWidth: "minmax(105px, 10%)" },
  }),
  columnHelper.accessor("pinyin", {
    enableSorting: false,
    header: "Pinyin",
    meta: { className: "col-pinyin", gridWidth: "minmax(100px, 15%)" },
  }),
  columnHelper.accessor("meaning", {
    enableSorting: false,
    header: "Meaning",
    meta: { className: "col-meaning", gridWidth: "1fr" },
  }),
  columnHelper.accessor("hasIndex", {
    cell: ({ getValue }) => (getValue() ? "✓" : "—"),
    enableSorting: false,
    filterFn: (row, _columnId, filterValue: string) => {
      if (filterValue === "all") return true;
      return filterValue === "has"
        ? row.original.hasIndex
        : !row.original.hasIndex;
    },
    header: "Deck",
    id: "hasIndex",
    meta: { className: "col-deck", gridWidth: "minmax(50px, 6%)" },
  }),
  columnHelper.accessor("hskLevel", {
    cell: ({ getValue }) => getValue() ?? "—",
    header: "HSK",
    meta: { className: "col-level", gridWidth: "minmax(50px, 7%)" },
    sortingFn: (rowA, rowB) => {
      const a = rowA.original.hskLevel;
      const b = rowB.original.hskLevel;
      if (a === null && b === null) return 0;
      if (a === null) return 1;
      if (b === null) return -1;
      return a - b;
    },
  }),
  columnHelper.display({
    cell: ({ row }) => {
      const { hskLevelV2, hskLevelV3 } = row.original;
      const parts: string[] = [];
      if (hskLevelV2 !== null) parts.push("2.0");
      if (hskLevelV3 !== null) parts.push("3.0");
      return parts.join(", ") || "—";
    },
    enableSorting: false,
    header: "Version",
    id: "hskVersion",
    meta: { className: "col-version", gridWidth: "minmax(60px, 7%)" },
  }),
  columnHelper.accessor("audio", {
    cell: ({ row, table }) => {
      const audio = row.original.audio;
      if (!audio) return "—";
      return (
        <button
          aria-label="Play audio"
          className="wl-audio-btn"
          onClick={() =>
            (
              table.options.meta as { playAudio: (src: string) => void }
            ).playAudio(`/media/${audio}`)
          }
          type="button"
        >
          <Volume2 size={14} />
        </button>
      );
    },
    enableSorting: false,
    header: "Audio",
    id: "audio",
    meta: { className: "col-audio", gridWidth: "minmax(65px, 6%)" },
  }),
  columnHelper.accessor("frequency", {
    cell: ({ getValue }) => {
      const v = getValue();
      if (v === null) return "—";
      return v > 9999 ? "10k+" : v.toLocaleString();
    },
    header: "Freq",
    meta: { className: "col-freq", gridWidth: "minmax(55px, 7%)" },
    sortingFn: (rowA, rowB) => {
      const a = rowA.original.frequency;
      const b = rowB.original.frequency;
      if (a === null && b === null) return 0;
      if (a === null) return 1;
      if (b === null) return -1;
      return a - b;
    },
  }),
];

const ROW_HEIGHT = 41;

const TOGGLEABLE_COLUMNS: { id: string; label: string }[] = [
  { id: "hasIndex", label: "Deck" },
  { id: "hskLevel", label: "HSK" },
  { id: "hskVersion", label: "Version" },
  { id: "audio", label: "Audio" },
  { id: "frequency", label: "Freq" },
];

function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

const uf = new uFuzzy({ intraIns: 1, intraMode: 1 });

function isChinese(s: string): boolean {
  return /[\u4e00-\u9fff]/.test(s);
}

type SearchField =
  | "all"
  | "character"
  | "pinyin"
  | "meaning"
  | "pinyin+character";

const COOKIE_OPTS = ";path=/;max-age=31536000;SameSite=Lax";

function saveCookie(key: string, value: unknown): void {
  document.cookie = `${key}=${encodeURIComponent(JSON.stringify(value))}${COOKIE_OPTS}`;
}

export interface WordListPrefs {
  columnVisibility?: VisibilityState;
  sorting?: SortingState;
  columnFilters?: ColumnFiltersState;
  searchField?: SearchField;
  pinTracked?: boolean;
}

function ShareLinkButton({
  onShareList,
}: {
  onShareList: () => Promise<boolean>;
}) {
  const [copied, setCopied] = useState(false);
  const handleClick = async () => {
    const success = await onShareList();
    if (!success) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Tooltip.Provider>
      <Tooltip.Root open={copied}>
        <Tooltip.Trigger
          render={
            <button
              aria-label="Copy share link"
              className="share-list-btn"
              onClick={handleClick}
              type="button"
            />
          }
        >
          <Share2 size={14} />
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Positioner side="top" sideOffset={8}>
            <Tooltip.Popup className="share-copied-tooltip">
              Share link copied!
            </Tooltip.Popup>
          </Tooltip.Positioner>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}

export function WordList({
  words,
  prefs = {},
  onToggle,
  onShareList,
  importButton,
}: {
  words: WordWithTracking[];
  prefs?: WordListPrefs;
  onToggle: (wordId: string) => void;
  onShareList?: () => Promise<boolean>;
  importButton?: React.ReactNode;
}) {
  const [sorting, setSorting] = useState<SortingState>(
    prefs.sorting ?? [{ desc: false, id: "frequency" }],
  );
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
    prefs.columnVisibility ?? {
      frequency: false,
      hasIndex: false,
      hskLevel: false,
      hskVersion: false,
    },
  );
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(
    prefs.columnFilters ?? [],
  );
  const [globalFilter, setGlobalFilter] = useState("");
  const [searchField, setSearchField] = useState<SearchField>(
    prefs.searchField ?? "all",
  );
  const [pinTracked, setPinTracked] = useState(prefs.pinTracked ?? true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const playAudio = useCallback((src: string) => {
    const el = audioRef.current;
    if (!el) return;
    if (el.src.endsWith(src.split("/").pop() ?? "") && !el.paused) {
      el.pause();
      el.currentTime = 0;
      return;
    }
    el.src = src;
    el.play();
  }, []);

  const handleSortingChange = (
    updater: SortingState | ((old: SortingState) => SortingState),
  ) => {
    setSorting((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      saveCookie("wl-sorting", next);
      return next;
    });
  };

  const handleColumnVisibilityChange = (
    updater: VisibilityState | ((old: VisibilityState) => VisibilityState),
  ) => {
    setColumnVisibility((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      saveCookie("wl-col-visibility", next);
      return next;
    });
  };

  const handleColumnFiltersChange = (
    updater:
      | ColumnFiltersState
      | ((old: ColumnFiltersState) => ColumnFiltersState),
  ) => {
    setColumnFilters((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      saveCookie("wl-col-filters", next);
      return next;
    });
  };

  const handleSearchFieldChange = (val: string | null) => {
    if (!val) return;
    const next = val as SearchField;
    setSearchField(next);
    saveCookie("wl-search-field", next);
  };

  const handlePinTrackedToggle = () => {
    setPinTracked((prev) => {
      const next = !prev;
      saveCookie("wl-pin-tracked", next);
      return next;
    });
  };

  const effectiveSorting = useMemo(
    () =>
      pinTracked
        ? [
            { desc: true, id: "track" },
            ...sorting.filter((s) => s.id !== "track"),
          ]
        : sorting.filter((s) => s.id !== "track"),
    [sorting, pinTracked],
  );

  // Build haystack for uFuzzy: one string per word combining searchable text
  const haystack = useMemo(
    () =>
      words.map((w) => {
        const pinyinNorm = stripDiacritics(w.pinyin.toLowerCase());
        return `${w.character} ${w.traditional ?? ""} ${pinyinNorm} ${w.meaning.toLowerCase()}`;
      }),
    [words],
  );

  // Run uFuzzy once per query change, produce a Set of matching word indices
  const fuzzyMatchSet = useMemo(() => {
    const q = globalFilter.trim().toLowerCase();
    if (!q || isChinese(q)) return null; // null = skip fuzzy, use substring
    const idxs = uf.filter(haystack, q);
    if (!idxs || idxs.length === 0) return new Set<number>();
    const info = uf.info(idxs, haystack, q);
    const order = uf.sort(info, haystack, q);
    return new Set(order.map((i) => idxs[i]));
  }, [haystack, globalFilter]);

  const table = useReactTable({
    columns,
    data: words,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    globalFilterFn: (row, _columnId, filterValue: string) => {
      const colonIdx = filterValue.indexOf(":");
      const field = colonIdx !== -1 ? filterValue.slice(0, colonIdx) : "all";
      const q = (
        colonIdx !== -1 ? filterValue.slice(colonIdx + 1) : filterValue
      ).toLowerCase();
      if (!q) return true;

      const w = row.original;

      // Chinese queries: exact substring match (fuzzy doesn't help)
      if (isChinese(q)) {
        const matchChar =
          w.character.includes(q) || (w.traditional?.includes(q) ?? false);
        switch (field) {
          case "character":
            return matchChar;
          case "meaning":
            return w.meaning.toLowerCase().includes(q);
          case "pinyin":
            return false;
          case "pinyin+character":
            return matchChar;
          default:
            return matchChar || w.meaning.toLowerCase().includes(q);
        }
      }

      // Latin queries: use uFuzzy set membership
      if (fuzzyMatchSet !== null) {
        return fuzzyMatchSet.has(row.index);
      }

      // Fallback substring match (shouldn't reach here, but safe)
      const pinyinLower = w.pinyin.toLowerCase();
      const pinyinNorm = stripDiacritics(pinyinLower);
      const pinyinNoSpaces = pinyinNorm.replace(/\s+/g, "");
      const matchPinyin =
        pinyinLower.includes(q) ||
        pinyinNorm.includes(q) ||
        pinyinNoSpaces.includes(q.replace(/\s+/g, ""));
      const matchChar =
        w.character.includes(q) || (w.traditional?.includes(q) ?? false);
      switch (field) {
        case "character":
          return matchChar;
        case "pinyin":
          return matchPinyin;
        case "pinyin+character":
          return matchPinyin || matchChar;
        case "meaning":
          return w.meaning.toLowerCase().includes(q);
        default:
          return (
            matchChar || matchPinyin || w.meaning.toLowerCase().includes(q)
          );
      }
    },
    meta: { onToggle, playAudio },
    onColumnFiltersChange: handleColumnFiltersChange,
    onColumnVisibilityChange: handleColumnVisibilityChange,
    onGlobalFilterChange: (value: string) => {
      const colonIdx = value.indexOf(":");
      if (colonIdx !== -1) {
        setGlobalFilter(value.slice(colonIdx + 1));
      }
    },
    onSortingChange: handleSortingChange,
    state: {
      columnFilters,
      columnVisibility,
      globalFilter: `${searchField}:${globalFilter}`,
      sorting: effectiveSorting,
    },
  });

  const { rows } = table.getRowModel();

  const gridTemplateColumns = table
    .getVisibleFlatColumns()
    .map(
      (col) =>
        (col.columnDef.meta as { gridWidth?: string } | undefined)?.gridWidth ??
        "1fr",
    )
    .join(" ");

  const virtualizer = useVirtualizer({
    count: rows.length,
    estimateSize: () => ROW_HEIGHT,
    getItemKey: (index) => rows[index].id,
    getScrollElement: () => scrollRef.current,
    measureElement: (el) => el.getBoundingClientRect().height,
    overscan: 20,
  });

  return (
    <>
      <audio preload="none" ref={audioRef} />
      <div className="table-toolbar">
        <span className="table-row-count">
          {rows.length.toLocaleString()} words
        </span>
        <div className="toolbar-spacer" />
        <div className="search-box">
          <Search className="search-icon" size={14} />
          <Select.Root
            onValueChange={handleSearchFieldChange}
            value={searchField}
          >
            <Select.Trigger className="search-field-trigger">
              <Select.Value />
              <Select.Icon className="search-field-icon">
                <ChevronDown size={12} />
              </Select.Icon>
            </Select.Trigger>
            <Select.Portal>
              <Select.Positioner
                align="start"
                className="search-field-positioner"
                side="bottom"
                sideOffset={4}
              >
                <Select.Popup className="search-field-popup">
                  {[
                    { label: "All", value: "all" },
                    { label: "Pinyin + Character", value: "pinyin+character" },
                    { label: "Character", value: "character" },
                    { label: "Pinyin", value: "pinyin" },
                    { label: "Meaning", value: "meaning" },
                  ].map((opt) => (
                    <Select.Item
                      className="search-field-item"
                      key={opt.value}
                      value={opt.value}
                    >
                      <Select.ItemIndicator className="search-field-indicator">
                        <Check size={12} />
                      </Select.ItemIndicator>
                      <Select.ItemText>{opt.label}</Select.ItemText>
                    </Select.Item>
                  ))}
                </Select.Popup>
              </Select.Positioner>
            </Select.Portal>
          </Select.Root>
          <Input
            className="search-input"
            onChange={(e) =>
              setGlobalFilter((e.target as HTMLInputElement).value)
            }
            placeholder={
              searchField === "all"
                ? "Search words..."
                : searchField === "pinyin+character"
                  ? "Search pinyin or character..."
                  : `Search ${searchField}...`
            }
            value={globalFilter}
          />
        </div>
        <Select.Root
          onValueChange={(val) => {
            handleColumnFiltersChange((prev) => {
              const next = prev.filter((f) => f.id !== "track");
              if (val !== "all") next.push({ id: "track", value: val });
              return next;
            });
          }}
          value={
            (columnFilters.find((f) => f.id === "track")?.value as string) ??
            "all"
          }
        >
          <Select.Trigger className="filter-pill">
            <Filter size={12} />
            <Select.Value placeholder="Tracked" />
            <Select.Icon className="search-field-icon">
              <ChevronDown size={12} />
            </Select.Icon>
          </Select.Trigger>
          <Select.Portal>
            <Select.Positioner
              align="start"
              className="search-field-positioner"
              side="bottom"
              sideOffset={4}
            >
              <Select.Popup className="search-field-popup">
                {[
                  { label: "All", value: "all" },
                  { label: "Tracked", value: "tracked" },
                  { label: "Untracked", value: "untracked" },
                ].map((opt) => (
                  <Select.Item
                    className="search-field-item"
                    key={opt.value}
                    value={opt.value}
                  >
                    <Select.ItemIndicator className="search-field-indicator">
                      <Check size={12} />
                    </Select.ItemIndicator>
                    <Select.ItemText>{opt.label}</Select.ItemText>
                  </Select.Item>
                ))}
              </Select.Popup>
            </Select.Positioner>
          </Select.Portal>
        </Select.Root>
        <Select.Root
          onValueChange={(val) => {
            handleColumnFiltersChange((prev) => {
              const next = prev.filter((f) => f.id !== "hasIndex");
              if (val !== "all") next.push({ id: "hasIndex", value: val });
              return next;
            });
          }}
          value={
            (columnFilters.find((f) => f.id === "hasIndex")?.value as string) ??
            "all"
          }
        >
          <Select.Trigger className="filter-pill">
            <Filter size={12} />
            <Select.Value placeholder="Deck" />
            <Select.Icon className="search-field-icon">
              <ChevronDown size={12} />
            </Select.Icon>
          </Select.Trigger>
          <Select.Portal>
            <Select.Positioner
              align="start"
              className="search-field-positioner"
              side="bottom"
              sideOffset={4}
            >
              <Select.Popup className="search-field-popup">
                {[
                  { label: "All", value: "all" },
                  { label: "Has card", value: "has" },
                  { label: "No card", value: "missing" },
                ].map((opt) => (
                  <Select.Item
                    className="search-field-item"
                    key={opt.value}
                    value={opt.value}
                  >
                    <Select.ItemIndicator className="search-field-indicator">
                      <Check size={12} />
                    </Select.ItemIndicator>
                    <Select.ItemText>{opt.label}</Select.ItemText>
                  </Select.Item>
                ))}
              </Select.Popup>
            </Select.Positioner>
          </Select.Portal>
        </Select.Root>
        <button
          className={`pin-tracked-btn ${pinTracked ? "active" : ""}`}
          onClick={handlePinTrackedToggle}
          title={
            pinTracked
              ? "Tracked words pinned to top"
              : "Pin tracked words to top"
          }
          type="button"
        >
          <Pin size={14} />
        </button>
        <Popover.Root>
          <Popover.Trigger className="columns-pill">
            <Settings2 size={14} />
            Columns
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Positioner
              align="center"
              className="columns-positioner"
              side="bottom"
              sideOffset={4}
            >
              <Popover.Popup className="columns-popup">
                {TOGGLEABLE_COLUMNS.map((col) => {
                  const column = table.getColumn(col.id);
                  if (!column) return null;
                  return (
                    <label className="columns-item" key={col.id}>
                      <Checkbox.Root
                        checked={column.getIsVisible()}
                        className="columns-checkbox"
                        onCheckedChange={(checked) =>
                          column.toggleVisibility(!!checked)
                        }
                      >
                        <Checkbox.Indicator className="columns-checkbox-indicator">
                          &#10003;
                        </Checkbox.Indicator>
                      </Checkbox.Root>
                      {col.label}
                    </label>
                  );
                })}
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        </Popover.Root>
        {importButton}
        {onShareList && <ShareLinkButton onShareList={onShareList} />}
      </div>
      <div className="word-list-container" ref={scrollRef}>
        <div className="word-table" role="table">
          <div className="word-table-header" role="rowgroup">
            {table.getHeaderGroups().map((headerGroup) => (
              <div
                className="word-table-row"
                key={headerGroup.id}
                role="row"
                style={{ gridTemplateColumns }}
              >
                {headerGroup.headers.map((header) => {
                  const meta = header.column.columnDef.meta as
                    | { className?: string }
                    | undefined;
                  return (
                    <div
                      className={`word-table-th ${meta?.className ?? ""}`}
                      key={header.id}
                      onClick={
                        header.column.id !== "track"
                          ? header.column.getToggleSortingHandler()
                          : undefined
                      }
                      onKeyDown={
                        header.column.id !== "track"
                          ? (e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                header.column.getToggleSortingHandler()?.(e);
                              }
                            }
                          : undefined
                      }
                      role="columnheader"
                      style={
                        header.column.getCanSort() &&
                        header.column.id !== "track"
                          ? { cursor: "pointer", userSelect: "none" }
                          : undefined
                      }
                      tabIndex={header.column.id !== "track" ? 0 : undefined}
                    >
                      <span className="th-content">
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                        {header.column.getCanSort() &&
                          header.column.id !== "track" && (
                            <span className="sort-indicator">
                              {header.column.getIsSorted() === "asc" ? (
                                <ArrowUp size={14} />
                              ) : header.column.getIsSorted() === "desc" ? (
                                <ArrowDown size={14} />
                              ) : (
                                <ArrowUpDown size={14} />
                              )}
                            </span>
                          )}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <div
            className="word-table-body"
            role="rowgroup"
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              position: "relative",
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const row = rows[virtualRow.index];
              const word = row.original;
              return (
                <div
                  className={`word-table-row ${word.isTracked ? "tracked" : ""}`}
                  data-index={virtualRow.index}
                  key={row.id}
                  ref={virtualizer.measureElement}
                  role="row"
                  style={{
                    gridTemplateColumns,
                    left: 0,
                    position: "absolute",
                    top: 0,
                    transform: `translateY(${virtualRow.start}px)`,
                    width: "100%",
                  }}
                >
                  {row.getVisibleCells().map((cell) => {
                    const meta = cell.column.columnDef.meta as
                      | { className?: string }
                      | undefined;
                    return (
                      <div
                        className={`word-table-td ${meta?.className ?? ""}`}
                        key={cell.id}
                        role="cell"
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
