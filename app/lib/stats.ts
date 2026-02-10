import type { CoverageCurveData, FrequencyStats, HskWord } from "./types";

const BUCKET_SIZE = 500;
const NUM_BUCKETS = 20;
const R = 10_000;

function harmonicNumber(n: number): number {
  let sum = 0;
  for (let k = 1; k <= n; k++) {
    sum += 1 / k;
  }
  return sum;
}

const H_R = harmonicNumber(R);

export function computeFrequencyStats(
  words: HskWord[],
  trackedSet: Set<string>,
  level?: number,
): FrequencyStats {
  const filtered =
    level === 7
      ? words.filter((w) => w.frequency !== null)
      : words.filter((w) => w.hskLevel !== null && w.hskLevel <= 6);

  const buckets = Array.from({ length: NUM_BUCKETS }, (_, i) => ({
    hskCount: 0,
    max: (i + 1) * BUCKET_SIZE,
    min: i * BUCKET_SIZE + 1,
    rangeLabel: `${i * BUCKET_SIZE + 1}-${(i + 1) * BUCKET_SIZE}`,
    trackedCount: 0,
  }));

  let totalTracked = 0;
  let topNTotal = 0;
  let topNTracked = 0;
  let levelWords = 0;
  let levelTracked = 0;
  const TOP_N = 5000;

  for (const word of filtered) {
    if (trackedSet.has(word.id)) totalTracked++;
    if (level === 7 && word.hskLevel === 7) {
      levelWords++;
      if (trackedSet.has(word.id)) levelTracked++;
    }
    const freq = word.frequency as number;
    const bucketIndex = Math.min(
      Math.floor((freq - 1) / BUCKET_SIZE),
      NUM_BUCKETS - 1,
    );
    if (bucketIndex >= 0 && bucketIndex < NUM_BUCKETS) {
      buckets[bucketIndex].hskCount++;
      if (trackedSet.has(word.id)) buckets[bucketIndex].trackedCount++;
    }
    if (freq <= TOP_N) {
      topNTotal++;
      if (trackedSet.has(word.id)) topNTracked++;
    }
  }

  const coveragePercent =
    topNTotal > 0 ? Math.round((topNTracked / topNTotal) * 100) : 0;

  return {
    buckets,
    coveragePercent,
    topNTotal,
    topNTracked,
    totalTracked,
    totalWords: filtered.length,
    ...(level === 7 ? { levelTracked, levelWords } : {}),
  };
}

function buildPrefixSums(ranks: number[]): {
  sorted: number[];
  prefix: number[];
} {
  const sorted = ranks.slice().sort((a, b) => a - b);
  const prefix: number[] = new Array(sorted.length);
  let sum = 0;
  for (let i = 0; i < sorted.length; i++) {
    sum += 1 / sorted[i];
    prefix[i] = sum;
  }
  return { prefix, sorted };
}

function cumulativeAt(sorted: number[], prefix: number[], n: number): number {
  if (n <= 0 || sorted.length === 0) return 0;
  let lo = 0,
    hi = sorted.length - 1,
    result = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= n) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return result >= 0 ? prefix[result] : 0;
}

export function computeCoverageCurve(
  words: HskWord[],
  trackedSet: Set<string>,
): CoverageCurveData {
  const hsk16Ranks: number[] = [];
  const hsk79Ranks: number[] = [];
  const trackedRanks: number[] = [];

  for (const word of words) {
    if (word.frequency !== null && word.frequency >= 1 && word.frequency <= R) {
      if (word.hskLevel !== null && word.hskLevel <= 6) {
        hsk16Ranks.push(word.frequency);
      } else {
        hsk79Ranks.push(word.frequency);
      }
      if (trackedSet.has(word.id)) {
        trackedRanks.push(word.frequency);
      }
    }
  }

  const hsk16 = buildPrefixSums(hsk16Ranks);
  const hsk79 = buildPrefixSums(hsk79Ranks);
  const tracked = buildPrefixSums(trackedRanks);

  const sampleRanks: number[] = [];
  for (let r = 0; r <= 1000; r += 50) sampleRanks.push(r);
  for (let r = 1100; r <= 3000; r += 100) sampleRanks.push(r);
  for (let r = 3250; r <= 5000; r += 250) sampleRanks.push(r);
  for (let r = 5500; r <= R; r += 500) sampleRanks.push(r);

  const points = sampleRanks.map((n) => {
    const zipfPercent = n === 0 ? 0 : (harmonicNumber(n) / H_R) * 100;
    const h16 = cumulativeAt(hsk16.sorted, hsk16.prefix, n);
    const h79 = cumulativeAt(hsk79.sorted, hsk79.prefix, n);
    const ht = cumulativeAt(tracked.sorted, tracked.prefix, n);
    return {
      hsk16Percent: (h16 / H_R) * 100,
      hskAllPercent: ((h16 + h79) / H_R) * 100,
      rank: n,
      trackedPercent: (ht / H_R) * 100,
      zipfPercent,
    };
  });

  const totalHsk16 =
    hsk16.prefix.length > 0 ? hsk16.prefix[hsk16.prefix.length - 1] : 0;
  const totalHsk79 =
    hsk79.prefix.length > 0 ? hsk79.prefix[hsk79.prefix.length - 1] : 0;
  const totalTracked =
    tracked.prefix.length > 0 ? tracked.prefix[tracked.prefix.length - 1] : 0;

  return {
    points,
    totalHsk16Percent: Math.round((totalHsk16 / H_R) * 1000) / 10,
    totalHskAllPercent:
      Math.round(((totalHsk16 + totalHsk79) / H_R) * 1000) / 10,
    totalTrackedPercent: Math.round((totalTracked / H_R) * 1000) / 10,
  };
}
