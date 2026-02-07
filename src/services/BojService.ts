import axios, { AxiosInstance } from 'axios';
import * as vscode from 'vscode';
import { Problem, SubmitResult } from '../types';
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
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
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

      // 캐시에 저장 (1시간)
      await this.cache.set(cacheKey, problem, 60 * 60 * 1000);

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

  async submitCode(
    problemId: string,
    code: string,
    languageId: number,
    cookies: string
  ): Promise<SubmitResult> {
    try {
      // CSRF 토큰 가져오기
      const submitPageResponse = await this.client.get(`/submit/${problemId}`, {
        headers: { Cookie: cookies }
      });

      const csrfMatch = submitPageResponse.data.match(/name="csrf_key"\s+value="([^"]+)"/);
      if (!csrfMatch) {
        return { success: false, error: 'CSRF 토큰을 찾을 수 없습니다. 다시 로그인해주세요.' };
      }

      const csrfKey = csrfMatch[1];

      // 코드 제출
      const formData = new URLSearchParams();
      formData.append('problem_id', problemId);
      formData.append('language', languageId.toString());
      formData.append('code_open', 'open');
      formData.append('source', code);
      formData.append('csrf_key', csrfKey);

      const submitResponse = await this.client.post(`/submit/${problemId}`, formData, {
        headers: {
          'Cookie': cookies,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Referer': `${this.baseUrl}/submit/${problemId}`
        },
        maxRedirects: 0,
        validateStatus: (status) => status >= 200 && status < 400
      });

      // 제출 성공 시 리다이렉트됨
      if (submitResponse.status === 302 || submitResponse.status === 303) {
        const location = submitResponse.headers.location;
        const submissionIdMatch = location?.match(/solution_id=(\d+)/);
        return {
          success: true,
          submissionId: submissionIdMatch?.[1],
          message: '코드가 제출되었습니다.'
        };
      }

      // 에러 메시지 파싱
      const errorMatch = submitResponse.data.match(/class="error-message"[^>]*>([^<]+)/);
      if (errorMatch) {
        return { success: false, error: errorMatch[1] };
      }

      return { success: true, message: '코드가 제출되었습니다.' };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 302 || error.response?.status === 303) {
          const location = error.response.headers.location;
          const submissionIdMatch = location?.match(/solution_id=(\d+)/);
          return {
            success: true,
            submissionId: submissionIdMatch?.[1],
            message: '코드가 제출되었습니다.'
          };
        }
        return { success: false, error: `제출 실패: ${error.message}` };
      }
      return { success: false, error: `제출 실패: ${String(error)}` };
    }
  }

  async checkSubmissionStatus(submissionId: string, cookies: string): Promise<{
    status: string;
    memory?: string;
    time?: string;
  }> {
    try {
      const response = await this.client.get(`/status?solution_id=${submissionId}`, {
        headers: { Cookie: cookies }
      });

      // 결과 파싱 로직
      const statusMatch = response.data.match(/class="result[^"]*"[^>]*>([^<]+)/);
      const status = statusMatch?.[1]?.trim() || 'Unknown';

      return { status };
    } catch {
      return { status: 'Error' };
    }
  }

  isValidProblemId(problemId: string): boolean {
    return /^\d+$/.test(problemId) && parseInt(problemId) > 0;
  }
}
