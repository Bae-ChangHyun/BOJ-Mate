import * as vscode from 'vscode';
import { CacheEntry } from '../types';

export class CacheManager {
  private memoryCache: Map<string, CacheEntry<unknown>> = new Map();
  private context: vscode.ExtensionContext;
  private readonly defaultTTL = 30 * 60 * 1000; // 30분

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  async get<T>(key: string): Promise<T | undefined> {
    // 먼저 메모리 캐시 확인
    const memEntry = this.memoryCache.get(key) as CacheEntry<T> | undefined;
    if (memEntry && !this.isExpired(memEntry)) {
      return memEntry.data;
    }

    // 메모리에 없으면 globalState 확인
    const stored = this.context.globalState.get<CacheEntry<T>>(key);
    if (stored && !this.isExpired(stored)) {
      // 메모리 캐시에도 저장
      this.memoryCache.set(key, stored);
      return stored.data;
    }

    return undefined;
  }

  async set<T>(key: string, data: T, ttl: number = this.defaultTTL): Promise<void> {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl
    };

    // 메모리 캐시에 저장
    this.memoryCache.set(key, entry);

    // globalState에도 저장 (영구 저장)
    await this.context.globalState.update(key, entry);
  }

  async delete(key: string): Promise<void> {
    this.memoryCache.delete(key);
    await this.context.globalState.update(key, undefined);
  }

  async clear(prefix?: string): Promise<void> {
    if (prefix) {
      // 특정 prefix로 시작하는 항목만 삭제
      for (const key of this.memoryCache.keys()) {
        if (key.startsWith(prefix)) {
          this.memoryCache.delete(key);
          await this.context.globalState.update(key, undefined);
        }
      }
    } else {
      // 전체 삭제
      this.memoryCache.clear();
    }
  }

  private isExpired<T>(entry: CacheEntry<T>): boolean {
    return Date.now() - entry.timestamp > entry.ttl;
  }

  // 캐시 키 생성 헬퍼
  static problemKey(problemId: string): string {
    return `cache:problem:${problemId}`;
  }

  static tierKey(problemId: string): string {
    return `cache:tier:${problemId}`;
  }

  static searchKey(query: string, tier?: number): string {
    return `cache:search:${query}:${tier ?? 'all'}`;
  }
}
