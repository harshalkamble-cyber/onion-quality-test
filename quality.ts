export const QUALITY_LABELS: Readonly<Record<number, string>> = Object.freeze({
  1: 'Very Poor Quality',
  2: 'Poor Quality',
  3: 'Average Quality',
  4: 'Good Quality',
  5: 'Premium Quality'
});

export type GradeDistribution = { stars: number; label: string; count: number; percent: number };

export function qualityLabel(stars: number): string {
  return QUALITY_LABELS[stars] ?? 'Unknown Quality';
}

/** counts must be an index-by-star array; element 0 is intentionally unused. */
export function buildGradeDistribution(counts: readonly number[]): GradeDistribution[] {
  const total = [1, 2, 3, 4, 5].reduce((sum, star) => sum + Math.max(0, Number(counts[star] ?? 0)), 0);
  return [1, 2, 3, 4, 5].map((stars) => {
    const count = Math.max(0, Number(counts[stars] ?? 0));
    return { stars, label: qualityLabel(stars), count, percent: total ? Number((count * 100 / total).toFixed(2)) : 0 };
  });
}
