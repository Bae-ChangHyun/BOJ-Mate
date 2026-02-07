import axios, { AxiosInstance } from 'axios';
import * as vscode from 'vscode';
import { Problem, HintLevel, HintResponse } from '../types';

export class AIService {
  private client: AxiosInstance | null = null;

  constructor() {
    this.initClient();
  }

  private initClient(): void {
    const config = vscode.workspace.getConfiguration('bojmate.ai');
    const baseUrl = config.get<string>('baseUrl');
    const apiKey = config.get<string>('apiKey');

    if (baseUrl && apiKey) {
      this.client = axios.create({
        baseURL: baseUrl,
        timeout: 30000,
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });
    }
  }

  isEnabled(): boolean {
    const config = vscode.workspace.getConfiguration('bojmate.ai');
    return config.get<boolean>('enabled', false) && this.client !== null;
  }

  async getHint(problem: Problem, level?: HintLevel): Promise<HintResponse> {
    if (!this.isEnabled()) {
      throw new Error('AI 힌트 기능이 비활성화되어 있습니다. 설정에서 활성화해주세요.');
    }

    const config = vscode.workspace.getConfiguration('bojmate.ai');
    const hintLevel = level || config.get<HintLevel>('hintLevel', 'algorithm');

    const prompt = this.buildPrompt(problem, hintLevel);

    try {
      const response = await this.client!.post('/chat/completions', {
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: this.getSystemPrompt(hintLevel)
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 2000
      });

      const content = response.data.choices[0]?.message?.content || '';
      return this.parseResponse(content, hintLevel);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`AI API 호출 실패: ${error.response?.data?.error?.message || error.message}`);
      }
      throw error;
    }
  }

  private getSystemPrompt(level: HintLevel): string {
    switch (level) {
      case 'algorithm':
        return `당신은 알고리즘 문제 해결 전문가입니다.
사용자가 제시한 문제에 대해 어떤 알고리즘이나 자료구조를 사용해야 하는지만 힌트를 주세요.
구체적인 풀이 방법이나 코드는 제공하지 마세요.
간결하게 알고리즘 분류와 간단한 이유만 설명해주세요.`;

      case 'stepByStep':
        return `당신은 알고리즘 문제 해결 전문가입니다.
사용자가 제시한 문제에 대해 단계별 힌트를 제공해주세요.
코드는 제공하지 말고, 문제 해결 과정을 논리적 단계로 나누어 설명해주세요.
각 단계는 명확하고 실행 가능해야 합니다.`;

      case 'fullSolution':
        return `당신은 알고리즘 문제 해결 전문가입니다.
사용자가 제시한 문제에 대해 완전한 풀이를 제공해주세요.
1. 문제 분석
2. 알고리즘 선택 이유
3. 시간/공간 복잡도
4. Python 코드 (주석 포함)
5. 주의할 점이나 엣지 케이스`;
    }
  }

  private buildPrompt(problem: Problem, level: HintLevel): string {
    let prompt = `## 문제: ${problem.id}번 - ${problem.title}\n\n`;
    prompt += `### 시간 제한: ${problem.timeLimit}\n`;
    prompt += `### 메모리 제한: ${problem.memoryLimit}\n\n`;
    prompt += `### 문제 설명\n${this.stripHtml(problem.description)}\n\n`;
    prompt += `### 입력\n${this.stripHtml(problem.input)}\n\n`;
    prompt += `### 출력\n${this.stripHtml(problem.output)}\n\n`;

    if (problem.testCases.length > 0) {
      prompt += `### 예제\n`;
      problem.testCases.forEach((tc, i) => {
        prompt += `입력 ${i + 1}:\n${tc.input}\n\n`;
        prompt += `출력 ${i + 1}:\n${tc.output}\n\n`;
      });
    }

    if (problem.tags && problem.tags.length > 0) {
      prompt += `### 태그 (참고용): ${problem.tags.join(', ')}\n`;
    }

    return prompt;
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]+>/g, '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private parseResponse(content: string, level: HintLevel): HintResponse {
    const response: HintResponse = {
      level,
      content
    };

    // 알고리즘 태그 추출 시도
    const algorithmMatch = content.match(/알고리즘[:\s]*([^\n]+)/i);
    if (algorithmMatch) {
      response.algorithm = algorithmMatch[1]
        .split(/[,、]/)
        .map((s) => s.trim())
        .filter((s) => s);
    }

    // 단계 추출 시도
    if (level === 'stepByStep' || level === 'fullSolution') {
      const steps = content.match(/(?:^|\n)\d+\.\s*([^\n]+)/g);
      if (steps) {
        response.steps = steps.map((s) => s.replace(/^\n?\d+\.\s*/, '').trim());
      }
    }

    // 코드 블록 추출
    if (level === 'fullSolution') {
      const codeMatch = content.match(/```(?:python|py)?\n([\s\S]*?)```/);
      if (codeMatch) {
        response.code = codeMatch[1].trim();
      }
    }

    return response;
  }

  // 설정 변경 시 클라이언트 재초기화
  refreshClient(): void {
    this.initClient();
  }
}
