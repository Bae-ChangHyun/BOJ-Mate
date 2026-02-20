import axios, { AxiosInstance } from 'axios';
import * as vscode from 'vscode';
import { Problem } from '../types';
import { parseProblemPage } from '../utils/parser';
import { CacheManager } from '../utils/cache';

export class BojService {
  private client: AxiosInstance;
  private cache: CacheManager;
  private readonly baseUrl = 'https://www.acmicpc.net';

  constructor(context: vscode.ExtensionContext, cache: CacheManager) {
    this.cache = cache;
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000,
      headers: {
        'User-Agent': 'BOJ-Mate-VSCode/0.0.1'
      }
    });
  }

  async getProblem(problemId: string): Promise<Problem> {
    // 캐시 확인
    const cacheKey = CacheManager.problemKey(problemId);
    const cached = await this.cache.get<Problem>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const response = await this.client.get(`/problem/${problemId}`);
      const problem = parseProblemPage(response.data, problemId);

      // 캐시에 저장 (24시간)
      await this.cache.set(cacheKey, problem, 24 * 60 * 60 * 1000);

      return problem;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) {
          throw new Error(`문제 ${problemId}를 찾을 수 없습니다.`);
        }
        throw new Error(`문제를 가져오는데 실패했습니다: ${error.message}`);
      }
      throw error;
    }
  }

  isValidProblemId(problemId: string): boolean {
    return /^\d+$/.test(problemId) && parseInt(problemId) > 0;
  }
}
