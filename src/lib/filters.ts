// Pure, testable filtering + CSV helpers shared by the interactive views.
// Keeping these framework-free lets the test suite exercise the exact logic the
// UI runs.

export interface EdgeLike {
  source: string; target: string; targetType?: string;
  interactionClass: string; region: string | null; direction: string | null;
  isEpiMiRNA: boolean; isCeRNA: boolean; epiCategory: string | null;
  conservedMiRNA?: boolean | null;
}

export interface EvidenceFilters {
  interactionClass?: string;
  direction?: string;
  epiOnly?: boolean;
  ceOnly?: boolean;
  search?: string;
  /** Extra text (e.g. resolved target label) folded into the search haystack. */
  extraText?: string;
}

/** Does an edge pass the Evidence-Table style filters? */
export function edgePasses(e: EdgeLike, f: EvidenceFilters): boolean {
  if (f.interactionClass && e.interactionClass !== f.interactionClass) return false;
  if (f.direction && e.direction !== f.direction) return false;
  if (f.epiOnly && !e.isEpiMiRNA) return false;
  if (f.ceOnly && !e.isCeRNA) return false;
  if (f.search) {
    const q = f.search.trim().toLowerCase();
    if (q) {
      const hay = `${e.source} ${e.target} ${f.extraText ?? ''} ${e.epiCategory ?? ''} ${e.interactionClass}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
  }
  return true;
}

/** Escape one CSV field per RFC 4180. */
export function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Build a CSV string from a header row and data rows. */
export function toCSV(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map((r) => r.map(csvEscape).join(',')).join('\n');
}

/** Parse and clamp a probability/correlation-ish numeric input; null if invalid. */
export function safeNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '' || v === 'NA') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
