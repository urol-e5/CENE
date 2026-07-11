import { describe, it, expect } from 'vitest';
import { edgePasses, csvEscape, toCSV, safeNum, type EdgeLike } from '../src/lib/filters';

const edge = (over: Partial<EdgeLike> = {}): EdgeLike => ({
  source: 'apul-mir-100', target: 'FUN_000001', targetType: 'gene',
  interactionClass: 'miRNA-mRNA', region: 'CDS', direction: 'negative',
  isEpiMiRNA: false, isCeRNA: false, epiCategory: null, conservedMiRNA: true, ...over,
});

describe('edgePasses (Evidence-Table filtering logic)', () => {
  it('passes with no filters', () => {
    expect(edgePasses(edge(), {})).toBe(true);
  });
  it('filters by interaction class', () => {
    expect(edgePasses(edge({ interactionClass: 'miRNA-lncRNA' }), { interactionClass: 'miRNA-mRNA' })).toBe(false);
    expect(edgePasses(edge(), { interactionClass: 'miRNA-mRNA' })).toBe(true);
  });
  it('filters by direction', () => {
    expect(edgePasses(edge({ direction: 'positive' }), { direction: 'negative' })).toBe(false);
    expect(edgePasses(edge({ direction: 'negative' }), { direction: 'negative' })).toBe(true);
  });
  it('filters epi-miRNA only and ceRNA only', () => {
    expect(edgePasses(edge({ isEpiMiRNA: false }), { epiOnly: true })).toBe(false);
    expect(edgePasses(edge({ isEpiMiRNA: true }), { epiOnly: true })).toBe(true);
    expect(edgePasses(edge({ isCeRNA: false }), { ceOnly: true })).toBe(false);
    expect(edgePasses(edge({ isCeRNA: true }), { ceOnly: true })).toBe(true);
  });
  it('searches across source, target, epi category, and extra label text', () => {
    expect(edgePasses(edge(), { search: 'mir-100' })).toBe(true);
    expect(edgePasses(edge(), { search: 'FUN_000001' })).toBe(true);
    expect(edgePasses(edge({ epiCategory: 'Ubiquitin signaling' }), { search: 'ubiquitin' })).toBe(true);
    expect(edgePasses(edge(), { search: 'TNRC6', extraText: 'TNRC6' })).toBe(true);
    expect(edgePasses(edge(), { search: 'nonexistent-token' })).toBe(false);
  });
  it('combines filters (AND semantics)', () => {
    expect(edgePasses(edge({ direction: 'negative', isEpiMiRNA: true }), { direction: 'negative', epiOnly: true })).toBe(true);
    expect(edgePasses(edge({ direction: 'positive', isEpiMiRNA: true }), { direction: 'negative', epiOnly: true })).toBe(false);
  });
});

describe('CSV helpers', () => {
  it('escapes fields containing commas, quotes, and newlines', () => {
    expect(csvEscape('plain')).toBe('plain');
    expect(csvEscape('a,b')).toBe('"a,b"');
    expect(csvEscape('she said "hi"')).toBe('"she said ""hi"""');
    expect(csvEscape('line1\nline2')).toBe('"line1\nline2"');
    expect(csvEscape(null)).toBe('');
    expect(csvEscape(0.947)).toBe('0.947');
  });
  it('builds a well-formed CSV', () => {
    const csv = toCSV(['a', 'b'], [[1, 'x,y'], [2, 'z']]);
    expect(csv).toBe('a,b\n1,"x,y"\n2,z');
  });
});

describe('safeNum (malformed / missing data handling)', () => {
  it('returns null for NA, empty, and non-numeric', () => {
    for (const v of ['NA', '', null, undefined, 'abc']) expect(safeNum(v)).toBeNull();
  });
  it('parses numeric strings and numbers', () => {
    expect(safeNum('0.5')).toBe(0.5);
    expect(safeNum(-1)).toBe(-1);
  });
});
