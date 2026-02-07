import axios, { AxiosInstance } from 'axios';
import * as vscode from 'vscode';
import { Problem, HintLevel, HintResponse } from '../types';

export type AIProvider = 'openai' | 'anthropic' | 'google' | 'openrouter' | 'local';

interface ProviderConfig {
  baseUrl: string;
  modelsEndpoint: string;
  chatEndpoint: string;
  authHeader: (apiKey: string) => Record<string, string>;
}

const PROVIDER_CONFIGS: Record<AIProvider, ProviderConfig> = {
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    modelsEndpoint: '/models',
    chatEndpoint: '/chat/completions',
    authHeader: (key) => ({ 'Authorization': `Bearer ${key}` })
  },
  anthropic: {
    baseUrl: 'https://api.anthropic.com/v1',
    modelsEndpoint: '/models',
    chatEndpoint: '/messages',
    authHeader: (key) => ({ 'x-api-key': key, 'anthropic-version': '2023-06-01' })
  },
  google: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    modelsEndpoint: '/models',
    chatEndpoint: '/models/{model}:generateContent',
    authHeader: () => ({}) // API key is passed as query param
  },
  openrouter: {
    baseUrl: 'https://openrouter.ai/api/v1',
    modelsEndpoint: '/models',
    chatEndpoint: '/chat/completions',
    authHeader: (key) => ({ 'Authorization': `Bearer ${key}` })
  },
  local: {
    baseUrl: '', // User must provide
    modelsEndpoint: '/models',
    chatEndpoint: '/chat/completions',
    authHeader: (key) => key ? { 'Authorization': `Bearer ${key}` } : {}
  }
};

export interface AIModel {
  id: string;
  name: string;
}

export class AIService {
  private client: AxiosInstance | null = null;
  private context: vscode.ExtensionContext;
  private cachedModels: AIModel[] = [];

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.initClient();
  }

  private getConfig() {
    return vscode.workspace.getConfiguration('bojmate.ai');
  }

  private initClient(): void {
    const config = this.getConfig();
    const provider = config.get<AIProvider>('provider', 'openai');
    const apiKey = config.get<string>('apiKey', '');
    const customBaseUrl = config.get<string>('baseUrl', '');

    const providerConfig = PROVIDER_CONFIGS[provider];
    const baseUrl = provider === 'local' ? customBaseUrl : providerConfig.baseUrl;

    if (!baseUrl) {
      this.client = null;
      return;
    }

    this.client = axios.create({
      baseURL: baseUrl,
      timeout: 60000,
      headers: {
        'Content-Type': 'application/json',
        ...providerConfig.authHeader(apiKey)
      }
    });
  }

  isEnabled(): boolean {
    const config = this.getConfig();
    return config.get<boolean>('enabled', false) && this.client !== null;
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    if (!this.client) {
      return { success: false, message: 'API 클라이언트가 초기화되지 않았습니다.' };
    }

    const config = this.getConfig();
    const provider = config.get<AIProvider>('provider', 'openai');
    const apiKey = config.get<string>('apiKey', '');

    try {
      if (provider === 'google') {
        const response = await this.client.get(`/models?key=${apiKey}`);
        return { success: true, message: `연결 성공! ${response.data.models?.length || 0}개 모델 발견` };
      } else {
        const providerConfig = PROVIDER_CONFIGS[provider];
        const response = await this.client.get(providerConfig.modelsEndpoint);
        const modelCount = response.data.data?.length || response.data.models?.length || 0;
        return { success: true, message: `연결 성공! ${modelCount}개 모델 발견` };
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        return { success: false, message: `연결 실패: ${error.response?.data?.error?.message || error.message}` };
      }
      return { success: false, message: `연결 실패: ${String(error)}` };
    }
  }

  async fetchModels(): Promise<AIModel[]> {
    if (!this.client) {
      return [];
    }

    const config = this.getConfig();
    const provider = config.get<AIProvider>('provider', 'openai');
    const apiKey = config.get<string>('apiKey', '');

    try {
      let models: AIModel[] = [];

      if (provider === 'google') {
        const response = await this.client.get(`/models?key=${apiKey}`);
        models = (response.data.models || [])
          .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
          .map((m: any) => ({
            id: m.name.replace('models/', ''),
            name: m.displayName || m.name
          }));
      } else if (provider === 'anthropic') {
        // Anthropic doesn't have a models endpoint, use predefined list
        models = [
          { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
          { id: 'claude-opus-4-20250514', name: 'Claude Opus 4' },
          { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
          { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku' },
          { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' }
        ];
      } else {
        const providerConfig = PROVIDER_CONFIGS[provider];
        const response = await this.client.get(providerConfig.modelsEndpoint);
        const data = response.data.data || response.data.models || [];
        models = data.map((m: any) => ({
          id: m.id || m.name,
          name: m.id || m.name
        }));
      }

      // Filter for chat models
      if (provider === 'openai') {
        models = models.filter(m =>
          m.id.includes('gpt') || m.id.includes('o1') || m.id.includes('o3')
        );
      }

      this.cachedModels = models;
      return models;
    } catch (error) {
      console.error('Failed to fetch models:', error);
      return this.cachedModels;
    }
  }

  getCachedModels(): AIModel[] {
    return this.cachedModels;
  }

  async getHint(problem: Problem, level?: HintLevel): Promise<HintResponse> {
    if (!this.isEnabled()) {
      throw new Error('AI 힌트 기능이 비활성화되어 있습니다. 설정에서 활성화해주세요.');
    }

    const config = this.getConfig();
    const provider = config.get<AIProvider>('provider', 'openai');
    const model = config.get<string>('model', '');
    const apiKey = config.get<string>('apiKey', '');
    const hintLevel = level || config.get<HintLevel>('hintLevel', 'algorithm');

    if (!model) {
      throw new Error('모델이 선택되지 않았습니다. 설정에서 모델을 선택해주세요.');
    }

    const systemPrompt = this.getSystemPrompt(hintLevel);
    const userPrompt = this.buildPrompt(problem, hintLevel);

    try {
      let content: string;

      if (provider === 'anthropic') {
        const response = await this.client!.post('/messages', {
          model,
          max_tokens: 4096,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }]
        });
        content = response.data.content[0]?.text || '';
      } else if (provider === 'google') {
        const response = await this.client!.post(
          `/models/${model}:generateContent?key=${apiKey}`,
          {
            contents: [{
              parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }]
            }]
          }
        );
        content = response.data.candidates[0]?.content?.parts[0]?.text || '';
      } else {
        // OpenAI-compatible (openai, openrouter, local)
        const response = await this.client!.post('/chat/completions', {
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.7,
          max_tokens: 4096
        });
        content = response.data.choices[0]?.message?.content || '';
      }

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

    const algorithmMatch = content.match(/알고리즘[:\s]*([^\n]+)/i);
    if (algorithmMatch) {
      response.algorithm = algorithmMatch[1]
        .split(/[,、]/)
        .map((s) => s.trim())
        .filter((s) => s);
    }

    if (level === 'stepByStep' || level === 'fullSolution') {
      const steps = content.match(/(?:^|\n)\d+\.\s*([^\n]+)/g);
      if (steps) {
        response.steps = steps.map((s) => s.replace(/^\n?\d+\.\s*/, '').trim());
      }
    }

    if (level === 'fullSolution') {
      const codeMatch = content.match(/```(?:python|py)?\n([\s\S]*?)```/);
      if (codeMatch) {
        response.code = codeMatch[1].trim();
      }
    }

    return response;
  }

  refreshClient(): void {
    this.initClient();
  }
}
