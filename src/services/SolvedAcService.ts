import axios, { AxiosInstance } from 'axios';
import * as vscode from 'vscode';
import { SolvedAcProblem, getTierName } from '../types';
import { CacheManager } from '../utils/cache';

export interface SearchResult {
  count: number;
  items: SolvedAcProblem[];
}

export class SolvedAcService {
  private client: AxiosInstance;
  private cache: CacheManager;
  private readonly baseUrl = 'https://solved.ac/api/v3';

  constructor(context: vscode.ExtensionContext, cache: CacheManager) {
    this.cache = cache;
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000,
      headers: {
        'Accept': 'application/json'
      }
    });
  }

  async getProblemInfo(problemId: string): Promise<SolvedAcProblem | null> {
    const cacheKey = CacheManager.tierKey(problemId);
    const cached = await this.cache.get<SolvedAcProblem>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const response = await this.client.get<SolvedAcProblem>('/problem/show', {
        params: { problemId }
      });

      const data = response.data;

      // 캐시에 저장 (24시간)
      await this.cache.set(cacheKey, data, 24 * 60 * 60 * 1000);

      return data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null;
      }
      console.error('solved.ac API 에러:', error);
      return null;
    }
  }

  async searchProblems(query: string, page: number = 1): Promise<SearchResult> {
    const cacheKey = `cache:search:${query}:${page}`;
    const cached = await this.cache.get<SearchResult>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const response = await this.client.get<SearchResult>('/search/problem', {
        params: { query, page }
      });

      const data = response.data;

      // 캐시에 저장 (10분)
      await this.cache.set(cacheKey, data, 10 * 60 * 1000);

      return data;
    } catch (error) {
      console.error('검색 에러:', error);
      return { count: 0, items: [] };
    }
  }

  async getProblemsByTier(tierMin: number, tierMax: number, page: number = 1): Promise<SearchResult> {
    // solved.ac 쿼리 문법 사용
    const query = `tier:${tierMin}..${tierMax}`;
    return this.searchProblems(query, page);
  }

  async getRandomProblem(tierMin: number, tierMax: number): Promise<SolvedAcProblem | null> {
    try {
      const query = `tier:${tierMin}..${tierMax} solvable:true`;
      const response = await this.client.get<SearchResult>('/search/problem', {
        params: { query, sort: 'random', page: 1 }
      });

      if (response.data.items.length > 0) {
        return response.data.items[0];
      }
      return null;
    } catch (error) {
      console.error('랜덤 문제 가져오기 실패:', error);
      return null;
    }
  }

  async getUserStats(username: string): Promise<{
    tier: number;
    tierName: string;
    solvedCount: number;
    rating: number;
  } | null> {
    try {
      const response = await this.client.get('/user/show', {
        params: { handle: username }
      });

      const data = response.data;
      return {
        tier: data.tier,
        tierName: getTierName(data.tier),
        solvedCount: data.solvedCount,
        rating: data.rating
      };
    } catch (error) {
      console.error('사용자 정보 가져오기 실패:', error);
      return null;
    }
  }

  getTierFromLevel(level: number): {
    tier: string;
    name: string;
  } {
    return {
      tier: this.getTierCategory(level),
      name: getTierName(level)
    };
  }

  private getTierCategory(level: number): string {
    if (level === 0) return 'unrated';
    if (level <= 5) return 'bronze';
    if (level <= 10) return 'silver';
    if (level <= 15) return 'gold';
    if (level <= 20) return 'platinum';
    if (level <= 25) return 'diamond';
    return 'ruby';
  }

  getTagsKorean(problem: SolvedAcProblem): string[] {
    return problem.tags.map((tag) => {
      const korean = tag.displayNames.find((d) => d.language === 'ko');
      return korean?.name || tag.key;
    });
  }

  async getAllTags(): Promise<Array<{ key: string; name: string; problemCount: number }>> {
    const cacheKey = 'cache:tags:all';
    const cached = await this.cache.get<Array<{ key: string; name: string; problemCount: number }>>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const response = await this.client.get('/tag/list', {
        params: { sort: 'problemCount', direction: 'desc' }
      });

      const tags = (response.data.items || []).map((tag: any) => {
        const korean = tag.displayNames?.find((d: any) => d.language === 'ko');
        return {
          key: tag.key,
          name: korean?.name || tag.key,
          problemCount: tag.problemCount
        };
      });

      // 캐시에 저장 (24시간)
      await this.cache.set(cacheKey, tags, 24 * 60 * 60 * 1000);

      return tags;
    } catch (error) {
      console.error('태그 목록 가져오기 실패:', error);
      return [];
    }
  }

  async searchByTierAndTag(
    tierMin?: number,
    tierMax?: number,
    tag?: string,
    page: number = 1
  ): Promise<SearchResult> {
    const queryParts: string[] = [];

    if (tierMin !== undefined && tierMax !== undefined) {
      queryParts.push(`tier:${tierMin}..${tierMax}`);
    }

    if (tag) {
      queryParts.push(`tag:${tag}`);
    }

    queryParts.push('solvable:true');

    const query = queryParts.join(' ');
    return this.searchProblems(query, page);
  }
}
