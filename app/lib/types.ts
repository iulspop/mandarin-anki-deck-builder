export interface HskWord {
  id: string;
  character: string;
  pinyin: string;
  meaning: string;
  hskLevel: number | null;
  frequency: number | null;
  source: string;
}

export interface FrequencyBucket {
  rangeLabel: string;
  min: number;
  max: number;
  hskCount: number;
  trackedCount: number;
}

export interface FrequencyStats {
  buckets: FrequencyBucket[];
  totalWords: number;
  totalTracked: number;
  topNTotal: number;
  topNTracked: number;
  coveragePercent: number;
  levelWords?: number;
  levelTracked?: number;
}

export interface HskWordWithDeck extends HskWord {
  hasIndex: boolean;
}

export interface WordIndexEntry {
  simplified: string;
  pinyin: string;
  meaning: string;
  partOfSpeech: string;
  audio: string;
  sentence: string;
  sentencePinyin: string;
  sentenceMeaning: string;
  sentenceAudio: string;
  sentenceImage: string;
  source: string;
}

export interface WordWithTracking extends HskWord {
  isTracked: boolean;
  hasIndex: boolean;
}

export interface CoveragePoint {
  rank: number;
  zipfPercent: number;
  hsk16Percent: number;
  hskAllPercent: number;
  trackedPercent: number;
}

export interface CoverageCurveData {
  points: CoveragePoint[];
  totalTrackedPercent: number;
  totalHsk16Percent: number;
  totalHskAllPercent: number;
}
