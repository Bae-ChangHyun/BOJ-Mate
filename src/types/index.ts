// BOJ Mate 타입 정의

export interface Problem {
  id: string;
  title: string;
  description: string;
  input: string;
  output: string;
  testCases: TestCase[];
  timeLimit: string;
  memoryLimit: string;
  tier?: number;
  tierName?: string;
  tags?: string[];
  source?: string;
}

export interface TestCase {
  input: string;
  output: string;
}

export interface TestResult {
  testCaseIndex: number;
  input: string;
  expected: string;
  actual: string;
  passed: boolean;
  executionTime: number;
  error?: string;
}

export interface SolveRecord {
  problemId: string;
  title: string;
  tier: number;
  tierName: string;
  startTime: number;
  endTime?: number;
  attempts: number;
  status: 'solving' | 'solved' | 'failed';
  language: string;
}

export interface SubmitResult {
  success: boolean;
  submissionId?: string;
  message?: string;
  error?: string;
}

export type HintLevel = 'algorithm' | 'stepByStep' | 'fullSolution';

export interface HintResponse {
  level: HintLevel;
  content: string;
  algorithm?: string[];
  steps?: string[];
  code?: string;
}

export interface SolvedAcProblem {
  problemId: number;
  titleKo: string;
  titles: { language: string; title: string }[];
  isSolvable: boolean;
  isPartial: boolean;
  acceptedUserCount: number;
  level: number;
  votedUserCount: number;
  sprout: boolean;
  givesNoRating: boolean;
  isLevelLocked: boolean;
  averageTries: number;
  official: boolean;
  tags: SolvedAcTag[];
}

export interface SolvedAcTag {
  key: string;
  isMeta: boolean;
  bojTagId: number;
  problemCount: number;
  displayNames: { language: string; name: string; short: string }[];
}

export interface ProblemMetadata {
  problemId: string;
  title: string;
  tier: number;
  tierName: string;
  language: string;
  createdAt: number;
  tags: string[];
  codePath?: string;
  testCases?: TestCase[];
  timeLimit?: string;
}

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

export type SupportedLanguage = 'cpp' | 'py' | 'java' | 'js' | 'rs';

export const LANGUAGE_CONFIG: Record<SupportedLanguage, {
  extension: string;
  bojLanguageId: number;
  name: string;
  compileArgs?: string[];
  runArgs: string[];
}> = {
  cpp: {
    extension: '.cpp',
    bojLanguageId: 1001, // C++17
    name: 'C++',
    compileArgs: ['g++', '-std=c++17', '-O2', '-o', '{output}', '{file}'],
    runArgs: ['{output}']
  },
  py: {
    extension: '.py',
    bojLanguageId: 28, // Python 3
    name: 'Python',
    runArgs: ['python3', '{file}']
  },
  java: {
    extension: '.java',
    bojLanguageId: 93, // Java 11
    name: 'Java',
    compileArgs: ['javac', '{file}'],
    runArgs: ['java', '-cp', '{dir}', 'Main']
  },
  js: {
    extension: '.js',
    bojLanguageId: 17, // Node.js
    name: 'JavaScript',
    runArgs: ['node', '{file}']
  },
  rs: {
    extension: '.rs',
    bojLanguageId: 94, // Rust 2021
    name: 'Rust',
    compileArgs: ['rustc', '-O', '-o', '{output}', '{file}'],
    runArgs: ['{output}']
  }
};

export const TIER_NAMES: Record<number, string> = {
  0: 'Unrated',
  1: 'Bronze V',
  2: 'Bronze IV',
  3: 'Bronze III',
  4: 'Bronze II',
  5: 'Bronze I',
  6: 'Silver V',
  7: 'Silver IV',
  8: 'Silver III',
  9: 'Silver II',
  10: 'Silver I',
  11: 'Gold V',
  12: 'Gold IV',
  13: 'Gold III',
  14: 'Gold II',
  15: 'Gold I',
  16: 'Platinum V',
  17: 'Platinum IV',
  18: 'Platinum III',
  19: 'Platinum II',
  20: 'Platinum I',
  21: 'Diamond V',
  22: 'Diamond IV',
  23: 'Diamond III',
  24: 'Diamond II',
  25: 'Diamond I',
  26: 'Ruby V',
  27: 'Ruby IV',
  28: 'Ruby III',
  29: 'Ruby II',
  30: 'Ruby I'
};

export function getTierName(level: number): string {
  return TIER_NAMES[level] || 'Unknown';
}

export function getTierColor(level: number): string {
  if (level === 0) return '#2d2d2d';
  if (level <= 5) return '#ad5600'; // Bronze
  if (level <= 10) return '#435f7a'; // Silver
  if (level <= 15) return '#ec9a00'; // Gold
  if (level <= 20) return '#27e2a4'; // Platinum
  if (level <= 25) return '#00b4fc'; // Diamond
  return '#ff0062'; // Ruby
}
