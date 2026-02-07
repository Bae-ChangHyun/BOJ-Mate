import axios, { AxiosInstance } from 'axios';
import * as vscode from 'vscode';
import { Problem, HintLevel, HintResponse } from '../types';

export type AIProvider = 'openai' | 'anthropic' | 'google' | 'openrouter' | 'local';

interface AISettings {
  enabled: boolean;
  provider: AIProvider;
  baseUrl: string;
  model: string;
  hintLevel: HintLevel;
  timeout: number;
}

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
    authHeader: () => ({})
  },
  openrouter: {
    baseUrl: 'https://openrouter.ai/api/v1',
    modelsEndpoint: '/models',
    chatEndpoint: '/chat/completions',
    authHeader: (key) => ({ 'Authorization': `Bearer ${key}` })
  },
  local: {
    baseUrl: '',
    modelsEndpoint: '/models',
    chatEndpoint: '/chat/completions',
    authHeader: (key) => key ? { 'Authorization': `Bearer ${key}` } : {}
  }
};

const DEFAULT_SETTINGS: AISettings = {
  enabled: false,
  provider: 'openai',
  baseUrl: '',
  model: '',
  hintLevel: 'algorithm',
  timeout: 60000
};

const SETTINGS_KEY = 'bojmate.ai.settings';
const API_KEY_PREFIX = 'bojmate.ai.apiKey.';

export interface AIModel {
  id: string;
  name: string;
}

export class AIService {
  private client: AxiosInstance | null = null;
  private context: vscode.ExtensionContext;
  private settings: AISettings = { ...DEFAULT_SETTINGS };
  private cachedModels: AIModel[] = [];

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.loadSettings();
  }

  private async loadSettings(): Promise<void> {
    const saved = this.context.globalState.get<AISettings>(SETTINGS_KEY);
    if (saved) {
      this.settings = { ...DEFAULT_SETTINGS, ...saved };
    }
    await this.initClient();
  }

  async getSettings(): Promise<AISettings> {
    return { ...this.settings };
  }

  async updateSettings(updates: Partial<AISettings>): Promise<void> {
    this.settings = { ...this.settings, ...updates };
    await this.context.globalState.update(SETTINGS_KEY, this.settings);
    await this.initClient();
  }

  async getApiKey(): Promise<string> {
    const key = await this.context.secrets.get(API_KEY_PREFIX + this.settings.provider);
    return key || '';
  }

  async setApiKey(apiKey: string): Promise<void> {
    await this.context.secrets.store(API_KEY_PREFIX + this.settings.provider, apiKey);
    await this.initClient();
  }

  private async initClient(): Promise<void> {
    const apiKey = await this.getApiKey();
    const providerConfig = PROVIDER_CONFIGS[this.settings.provider];
    const baseUrl = this.settings.provider === 'local'
      ? this.settings.baseUrl
      : providerConfig.baseUrl;

    if (!baseUrl) {
      this.client = null;
      return;
    }

    this.client = axios.create({
      baseURL: baseUrl,
      timeout: this.settings.timeout,
      headers: {
        'Content-Type': 'application/json',
        ...providerConfig.authHeader(apiKey)
      }
    });
  }

  isEnabled(): boolean {
    return this.settings.enabled && this.client !== null;
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    if (!this.client) {
      return { success: false, message: 'API 클라이언트가 초기화되지 않았습니다.' };
    }

    const apiKey = await this.getApiKey();

    try {
      if (this.settings.provider === 'google') {
        const response = await this.client.get(`/models?key=${apiKey}`);
        return { success: true, message: `연결 성공! ${response.data.models?.length || 0}개 모델 발견` };
      } else {
        const providerConfig = PROVIDER_CONFIGS[this.settings.provider];
        const response = await this.client.get(providerConfig.modelsEndpoint);
        const modelCount = response.data.data?.length || response.data.models?.length || 0;
        return { success: true, message: `연결 성공! ${modelCount}개 모델 발견` };
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNABORTED') {
          return { success: false, message: `연결 시간 초과 (${this.settings.timeout / 1000}초)` };
        }
        return { success: false, message: `연결 실패: ${error.response?.data?.error?.message || error.message}` };
      }
      return { success: false, message: `연결 실패: ${String(error)}` };
    }
  }

  async fetchModels(): Promise<AIModel[]> {
    if (!this.client) {
      return [];
    }

    const apiKey = await this.getApiKey();

    try {
      let models: AIModel[] = [];

      if (this.settings.provider === 'google') {
        const response = await this.client.get(`/models?key=${apiKey}`);
        models = (response.data.models || [])
          .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
          .map((m: any) => ({
            id: m.name.replace('models/', ''),
            name: m.displayName || m.name
          }));
      } else if (this.settings.provider === 'anthropic') {
        models = [
          { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
          { id: 'claude-opus-4-20250514', name: 'Claude Opus 4' },
          { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
          { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku' },
          { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' }
        ];
      } else {
        const providerConfig = PROVIDER_CONFIGS[this.settings.provider];
        const response = await this.client.get(providerConfig.modelsEndpoint);
        const data = response.data.data || response.data.models || [];
        models = data.map((m: any) => ({
          id: m.id || m.name,
          name: m.id || m.name
        }));
      }

      if (this.settings.provider === 'openai') {
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

    const apiKey = await this.getApiKey();
    const hintLevel = level || this.settings.hintLevel;

    if (!this.settings.model) {
      throw new Error('모델이 선택되지 않았습니다. 설정에서 모델을 선택해주세요.');
    }

    const systemPrompt = this.getSystemPrompt(hintLevel);
    const userPrompt = this.buildPrompt(problem, hintLevel);
    const maxTokens = hintLevel === 'fullSolution' ? 2500 : 1500;

    try {
      let content: string;

      if (this.settings.provider === 'anthropic') {
        const response = await this.client!.post('/messages', {
          model: this.settings.model,
          max_tokens: maxTokens,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }]
        });
        content = response.data.content[0]?.text || '';
      } else if (this.settings.provider === 'google') {
        const response = await this.client!.post(
          `/models/${this.settings.model}:generateContent?key=${apiKey}`,
          {
            contents: [{
              parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }]
            }],
            generationConfig: { maxOutputTokens: maxTokens }
          }
        );
        content = response.data.candidates[0]?.content?.parts[0]?.text || '';
      } else {
        const response = await this.client!.post('/chat/completions', {
          model: this.settings.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.7,
          max_tokens: maxTokens
        });
        content = response.data.choices[0]?.message?.content || '';
      }

      return this.parseResponse(content, hintLevel);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNABORTED') {
          throw new Error(`AI API 시간 초과 (${this.settings.timeout / 1000}초)`);
        }
        throw new Error(`AI API 호출 실패: ${error.response?.data?.error?.message || error.message}`);
      }
      throw error;
    }
  }

  private getSystemPrompt(level: HintLevel): string {
    const base = '알고리즘 문제 힌트를 마크다운으로 간결하게 답변하세요. 불필요한 서론/맺음말 없이 핵심만 작성하세요.';
    switch (level) {
      case 'algorithm':
        return `${base}\n사용할 알고리즘/자료구조 분류와 간단한 이유만 답변하세요. 코드나 풀이 과정은 제공하지 마세요.`;
      case 'stepByStep':
        return `${base}\n풀이 과정을 3~5단계로 나눠 설명하세요. 코드는 제공하지 마세요.`;
      case 'fullSolution':
        return `${base}\n핵심 아이디어, 복잡도, Python 코드를 포함하여 답변하세요.`;
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
    return { level, content };
  }

  async refreshClient(): Promise<void> {
    await this.initClient();
  }

  async getFeedback(problem: Problem, code: string, language: string): Promise<string> {
    if (!this.isEnabled()) {
      throw new Error('AI 기능이 비활성화되어 있습니다. 설정에서 활성화해주세요.');
    }

    const apiKey = await this.getApiKey();

    if (!this.settings.model) {
      throw new Error('모델이 선택되지 않았습니다. 설정에서 모델을 선택해주세요.');
    }

    const systemPrompt = this.getFeedbackSystemPrompt();
    const userPrompt = this.buildFeedbackPrompt(problem, code, language);

    try {
      let content: string;

      if (this.settings.provider === 'anthropic') {
        const response = await this.client!.post('/messages', {
          model: this.settings.model,
          max_tokens: 1500,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }]
        });
        content = response.data.content[0]?.text || '';
      } else if (this.settings.provider === 'google') {
        const response = await this.client!.post(
          `/models/${this.settings.model}:generateContent?key=${apiKey}`,
          {
            contents: [{
              parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }]
            }],
            generationConfig: { maxOutputTokens: 1500 }
          }
        );
        content = response.data.candidates[0]?.content?.parts[0]?.text || '';
      } else {
        const response = await this.client!.post('/chat/completions', {
          model: this.settings.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.7,
          max_tokens: 1500
        });
        content = response.data.choices[0]?.message?.content || '';
      }

      return content;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNABORTED') {
          throw new Error(`AI API 시간 초과 (${this.settings.timeout / 1000}초)`);
        }
        throw new Error(`AI API 호출 실패: ${error.response?.data?.error?.message || error.message}`);
      }
      throw error;
    }
  }

  private getFeedbackSystemPrompt(): string {
    return `코드 리뷰를 마크다운으로 간결하게 작성하세요. 불필요한 서론/맺음말 없이 핵심만.
다음 항목만 짧게 답변: 정확성, 복잡도(시간/공간), 개선 제안.
엣지 케이스가 있으면 언급하세요.`;
  }

  private buildFeedbackPrompt(problem: Problem, code: string, language: string): string {
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
      prompt += `### 문제 태그: ${problem.tags.join(', ')}\n\n`;
    }

    prompt += `---\n\n`;
    prompt += `## 제출 코드 (${language})\n\`\`\`${language.toLowerCase()}\n${code}\n\`\`\`\n\n`;
    prompt += `위 코드에 대해 상세한 피드백을 제공해주세요.`;

    return prompt;
  }
}
