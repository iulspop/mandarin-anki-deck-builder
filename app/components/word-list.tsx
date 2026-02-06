import { useMemo, useRef, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
  type VisibilityState,
  type ColumnFiltersState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowUp, ArrowDown, ArrowUpDown, Settings2, Search, ChevronDown, Check, Filter, Pin, Share2 } from "lucide-react";
import { Popover } from "@base-ui/react/popover";
import { Tooltip } from "@base-ui/react/tooltip";
import { Checkbox } from "@base-ui/react/checkbox";
import { Select } from "@base-ui/react/select";
import { Input } from "@base-ui/react/input";
import uFuzzy from "@leeoniya/ufuzzy";
import type { WordWithTracking } from "~/lib/types";
import { TrackCell } from "./word-list-item";

const columnHelper = createColumnHelper<WordWithTracking>();

const columns = [
  columnHelper.accessor("isTracked", {
    id: "track",
    header: "Track",
    cell: ({ row, table }) => <TrackCell word={row.original} onToggle={(table.options.meta as { onToggle: (id: string) => void }).onToggle} />,
    enableSorting: true,
    filterFn: (row, _columnId, filterValue: string) => {
      if (filterValue === "all") return true;
      return filterValue === "tracked" ? row.original.isTracked : !row.original.isTracked;
    },
    meta: { className: "col-track", gridWidth: "minmax(75px, 7%)" },
  }),
  columnHelper.accessor("character", {
    header: "Character",
    enableSorting: false,
    meta: { className: "col-character", gridWidth: "minmax(105px, 10%)" },
  }),
  columnHelper.accessor("pinyin", {
    header: "Pinyin",
    enableSorting: false,
    meta: { className: "col-pinyin", gridWidth: "minmax(100px, 15%)" },
  }),
  columnHelper.accessor("meaning", {
    header: "Meaning",
    enableSorting: false,
    meta: { className: "col-meaning", gridWidth: "1fr" },
  }),
  columnHelper.accessor("hasIndex", {
    id: "hasIndex",
    header: "Deck",
    cell: ({ getValue }) => (getValue() ? "✓" : "—"),
    enableSorting: false,
    filterFn: (row, _columnId, filterValue: string) => {
      if (filterValue === "all") return true;
      return filterValue === "has" ? row.original.hasIndex : !row.original.hasIndex;
    },
    meta: { className: "col-deck", gridWidth: "minmax(50px, 6%)" },
  }),
  columnHelper.accessor("hskLevel", {
    header: "HSK",
    cell: ({ getValue }) => getValue() ?? "—",
    sortingFn: (rowA, rowB) => {
      const a = rowA.original.hskLevel;
      const b = rowB.original.hskLevel;
      if (a === null && b === null) return 0;
      if (a === null) return 1;
      if (b === null) return -1;
      return a - b;
    },
    meta: { className: "col-level", gridWidth: "minmax(50px, 7%)" },
  }),
  columnHelper.accessor("frequency", {
    header: "Freq",
    cell: ({ getValue }) => {
      const v = getValue();
      if (v === null) return "—";
      return v > 9999 ? "10k+" : v.toLocaleString();
    },
    sortingFn: (rowA, rowB) => {
      const a = rowA.original.frequency;
      const b = rowB.original.frequency;
      if (a === null && b === null) return 0;
      if (a === null) return 1;
      if (b === null) return -1;
      return a - b;
    },
    meta: { className: "col-freq", gridWidth: "minmax(55px, 7%)" },
  }),
];

const ROW_HEIGHT = 41;

const TOGGLEABLE_COLUMNS: { id: string; label: string }[] = [
  { id: "hasIndex", label: "Deck" },
  { id: "hskLevel", label: "HSK" },
  { id: "frequency", label: "Freq" },
];

function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

const uf = new uFuzzy({ intraMode: 1, intraIns: 1 });

function isChinese(s: string): boolean {
  return /[\u4e00-\u9fff]/.test(s);
}

type SearchField = "all" | "character" | "pinyin" | "meaning" | "pinyin+character";

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

function ShareLinkButton({ onShareList }: { onShareList: () => Promise<boolean> }) {
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
          render={<button type="button" className="share-list-btn" onClick={handleClick} aria-label="Copy share link" />}
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

export function WordList({ words, prefs = {}, onToggle, onShareList, importButton }: {
  words: WordWithTracking[];
  prefs?: WordListPrefs;
  onToggle: (wordId: string) => void;
  onShareList?: () => Promise<boolean>;
  importButton?: React.ReactNode;
}) {
  const [sorting, setSorting] = useState<SortingState>(
    prefs.sorting ?? [{ id: "frequency", desc: false }],
  );
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(prefs.columnVisibility ?? { hskLevel: false, frequency: false });
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(prefs.columnFilters ?? []);
  const [globalFilter, setGlobalFilter] = useState("");
  const [searchField, setSearchField] = useState<SearchField>(prefs.searchField ?? "all");
  const [pinTracked, setPinTracked] = useState(prefs.pinTracked ?? true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleSortingChange = (updater: SortingState | ((old: SortingState) => SortingState)) => {
    setSorting((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      saveCookie("wl-sorting", next);
      return next;
    });
  };

  const handleColumnVisibilityChange = (updater: VisibilityState | ((old: VisibilityState) => VisibilityState)) => {
    setColumnVisibility((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      saveCookie("wl-col-visibility", next);
      return next;
    });
  };

  const handleColumnFiltersChange = (updater: ColumnFiltersState | ((old: ColumnFiltersState) => ColumnFiltersState)) => {
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
    () => pinTracked
      ? [{ id: "track", desc: true }, ...sorting.filter((s) => s.id !== "track")]
      : sorting.filter((s) => s.id !== "track"),
    [sorting, pinTracked],
  );

  // Build haystack for uFuzzy: one string per word combining searchable text
  const haystack = useMemo(
    () => words.map((w) => {
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
    data: words,
    columns,
    state: { sorting: effectiveSorting, columnVisibility, columnFilters, globalFilter: `${searchField}:${globalFilter}` },
    onSortingChange: handleSortingChange,
    onColumnVisibilityChange: handleColumnVisibilityChange,
    onColumnFiltersChange: handleColumnFiltersChange,
    onGlobalFilterChange: (value: string) => {
      const colonIdx = value.indexOf(":");
      if (colonIdx !== -1) {
        setGlobalFilter(value.slice(colonIdx + 1));
      }
    },
    globalFilterFn: (row, _columnId, filterValue: string) => {
      const colonIdx = filterValue.indexOf(":");
      const field = colonIdx !== -1 ? filterValue.slice(0, colonIdx) : "all";
      const q = (colonIdx !== -1 ? filterValue.slice(colonIdx + 1) : filterValue).toLowerCase();
      if (!q) return true;

      const w = row.original;

      // Chinese queries: exact substring match (fuzzy doesn't help)
      if (isChinese(q)) {
        const matchChar = w.character.includes(q) || (w.traditional?.includes(q) ?? false);
        switch (field) {
          case "character": return matchChar;
          case "meaning": return w.meaning.toLowerCase().includes(q);
          case "pinyin": return false;
          case "pinyin+character": return matchChar;
          default: return matchChar || w.meaning.toLowerCase().includes(q);
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
      const matchPinyin = pinyinLower.includes(q) || pinyinNorm.includes(q) || pinyinNoSpaces.includes(q.replace(/\s+/g, ""));
      const matchChar = w.character.includes(q) || (w.traditional?.includes(q) ?? false);
      switch (field) {
        case "character": return matchChar;
        case "pinyin": return matchPinyin;
        case "pinyin+character": return matchPinyin || matchChar;
        case "meaning": return w.meaning.toLowerCase().includes(q);
        default: return matchChar || matchPinyin || w.meaning.toLowerCase().includes(q);
      }
    },
    meta: { onToggle },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const { rows } = table.getRowModel();

  const gridTemplateColumns = table
    .getVisibleFlatColumns()
    .map((col) => (col.columnDef.meta as { gridWidth?: string } | undefined)?.gridWidth ?? "1fr")
    .join(" ");

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 20,
    getItemKey: (index) => rows[index].id,
    measureElement: (el) => el.getBoundingClientRect().height,
  });

  return (
    <>
    <div className="table-toolbar">
      <span className="table-row-count">{rows.length.toLocaleString()} words</span>
      <div className="toolbar-spacer" />
      <div className="search-box">
        <Search size={14} className="search-icon" />
        <Select.Root
          value={searchField}
          onValueChange={handleSearchFieldChange}
        >
          <Select.Trigger className="search-field-trigger">
            <Select.Value />
            <Select.Icon className="search-field-icon">
              <ChevronDown size={12} />
            </Select.Icon>
          </Select.Trigger>
          <Select.Portal>
            <Select.Positioner side="bottom" align="start" sideOffset={4} className="search-field-positioner">
              <Select.Popup className="search-field-popup">
                {[
                  { value: "all", label: "All" },
                  { value: "pinyin+character", label: "Pinyin + Character" },
                  { value: "character", label: "Character" },
                  { value: "pinyin", label: "Pinyin" },
                  { value: "meaning", label: "Meaning" },
                ].map((opt) => (
                  <Select.Item key={opt.value} value={opt.value} className="search-field-item">
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
          placeholder={searchField === "all" ? "Search words..." : searchField === "pinyin+character" ? "Search pinyin or character..." : `Search ${searchField}...`}
          value={globalFilter}
          onChange={(e) => setGlobalFilter((e.target as HTMLInputElement).value)}
        />
      </div>
      <Select.Root
        value={(columnFilters.find((f) => f.id === "track")?.value as string) ?? "all"}
        onValueChange={(val) => {
          handleColumnFiltersChange((prev) => {
            const next = prev.filter((f) => f.id !== "track");
            if (val !== "all") next.push({ id: "track", value: val });
            return next;
          });
        }}
      >
        <Select.Trigger className="filter-pill">
          <Filter size={12} />
          <Select.Value placeholder="Tracked" />
          <Select.Icon className="search-field-icon">
            <ChevronDown size={12} />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Positioner side="bottom" align="start" sideOffset={4} className="search-field-positioner">
            <Select.Popup className="search-field-popup">
              {[
                { value: "all", label: "All" },
                { value: "tracked", label: "Tracked" },
                { value: "untracked", label: "Untracked" },
              ].map((opt) => (
                <Select.Item key={opt.value} value={opt.value} className="search-field-item">
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
        value={(columnFilters.find((f) => f.id === "hasIndex")?.value as string) ?? "all"}
        onValueChange={(val) => {
          handleColumnFiltersChange((prev) => {
            const next = prev.filter((f) => f.id !== "hasIndex");
            if (val !== "all") next.push({ id: "hasIndex", value: val });
            return next;
          });
        }}
      >
        <Select.Trigger className="filter-pill">
          <Filter size={12} />
          <Select.Value placeholder="Deck" />
          <Select.Icon className="search-field-icon">
            <ChevronDown size={12} />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Positioner side="bottom" align="start" sideOffset={4} className="search-field-positioner">
            <Select.Popup className="search-field-popup">
              {[
                { value: "all", label: "All" },
                { value: "has", label: "Has card" },
                { value: "missing", label: "No card" },
              ].map((opt) => (
                <Select.Item key={opt.value} value={opt.value} className="search-field-item">
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
        type="button"
        className={`pin-tracked-btn ${pinTracked ? "active" : ""}`}
        onClick={handlePinTrackedToggle}
        title={pinTracked ? "Tracked words pinned to top" : "Pin tracked words to top"}
      >
        <Pin size={14} />
      </button>
      <Popover.Root>
        <Popover.Trigger className="columns-pill">
          <Settings2 size={14} />
          Columns
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner side="bottom" align="center" sideOffset={4} className="columns-positioner">
            <Popover.Popup className="columns-popup">
              {TOGGLEABLE_COLUMNS.map((col) => {
                const column = table.getColumn(col.id);
                if (!column) return null;
                return (
                  <label key={col.id} className="columns-item">
                    <Checkbox.Root
                      className="columns-checkbox"
                      checked={column.getIsVisible()}
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
      {onShareList && (
        <ShareLinkButton onShareList={onShareList} />
      )}
    </div>
    <div className="word-list-container" ref={scrollRef}>
      <div className="word-table" role="table">
        <div className="word-table-header" role="rowgroup">
          {table.getHeaderGroups().map((headerGroup) => (
            <div className="word-table-row" role="row" key={headerGroup.id} style={{ gridTemplateColumns }}>
              {headerGroup.headers.map((header) => {
                const meta = header.column.columnDef.meta as
                  | { className?: string }
                  | undefined;
                return (
                  <div
                    key={header.id}
                    role="columnheader"
                    className={`word-table-th ${meta?.className ?? ""}`}
                    onClick={header.column.id !== "track" ? header.column.getToggleSortingHandler() : undefined}
                    style={
                      header.column.getCanSort() && header.column.id !== "track"
                        ? { cursor: "pointer", userSelect: "none" }
                        : undefined
                    }
                  >
                    <span className="th-content">
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                      {header.column.getCanSort() && header.column.id !== "track" && (
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
                key={row.id}
                role="row"
                ref={virtualizer.measureElement}
                data-index={virtualRow.index}
                className={`word-table-row ${word.isTracked ? "tracked" : ""}`}
                style={{
                  gridTemplateColumns,
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                {row.getVisibleCells().map((cell) => {
                  const meta = cell.column.columnDef.meta as
                    | { className?: string }
                    | undefined;
                  return (
                    <div key={cell.id} role="cell" className={`word-table-td ${meta?.className ?? ""}`}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
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
