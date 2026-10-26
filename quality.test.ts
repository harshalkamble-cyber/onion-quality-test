import { describe, expect, it } from 'vitest';
import { buildGradeDistribution, qualityLabel } from '../src/services/quality.js';

describe('onion quality reporting helpers', () => {
  it('maps the five grades to stable farmer-facing labels', () => {
    expect([1, 2, 3, 4, 5].map(qualityLabel)).toEqual([
      'Very Poor Quality', 'Poor Quality', 'Average Quality', 'Good Quality', 'Premium Quality'
    ]);
  });

  it('produces a distribution that reconciles to the number of onions', () => {
    const distribution = buildGradeDistribution([0, 2, 3, 5, 0, 10]);
    expect(distribution.reduce((sum, grade) => sum + grade.count, 0)).toBe(20);
    expect(distribution.reduce((sum, grade) => sum + grade.percent, 0)).toBe(100);
    expect(distribution[4]).toMatchObject({ stars: 5, count: 10, percent: 50 });
  });

  it('returns zero percentages for an empty batch and never creates negative counts', () => {
    expect(buildGradeDistribution([0, -2, 0, 0, 0, 0]).map((x) => x.percent)).toEqual([0, 0, 0, 0, 0]);
    expect(buildGradeDistribution([0, -2, 0, 0, 0, 0])[0].count).toBe(0);
    expect(qualityLabel(0)).toBe('Unknown Quality');
  });
});
