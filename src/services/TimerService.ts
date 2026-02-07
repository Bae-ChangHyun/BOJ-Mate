import * as vscode from 'vscode';
import { SolveRecord } from '../types';

const SOLVE_RECORDS_KEY = 'bojmate.solveRecords';
const CURRENT_PROBLEM_KEY = 'bojmate.currentProblem';

export class TimerService {
  private context: vscode.ExtensionContext;
  private statusBarItem: vscode.StatusBarItem;
  private timerInterval: NodeJS.Timeout | null = null;
  private currentRecord: SolveRecord | null = null;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.statusBarItem.command = 'bojmate.showTimerMenu';
    context.subscriptions.push(this.statusBarItem);

    // 이전 세션에서 진행 중이던 문제 복구
    this.restoreCurrentProblem();
  }

  private async restoreCurrentProblem(): Promise<void> {
    const current = this.context.globalState.get<SolveRecord>(CURRENT_PROBLEM_KEY);
    if (current && current.status === 'solving') {
      this.currentRecord = current;
      this.startTimerDisplay();
    }
  }

  async startTimer(problemId: string, title: string, tier: number, tierName: string, language: string): Promise<void> {
    // 이미 같은 문제를 풀고 있으면 무시
    if (this.currentRecord?.problemId === problemId && this.currentRecord.status === 'solving') {
      return;
    }

    // 기존 문제가 있으면 일시정지
    if (this.currentRecord && this.currentRecord.status === 'solving') {
      await this.pauseTimer();
    }

    // 새 기록 생성 또는 기존 기록 재시작
    const records = await this.getAllRecords();
    const existingRecord = records.find(
      (r) => r.problemId === problemId && r.status === 'solving'
    );

    if (existingRecord) {
      this.currentRecord = existingRecord;
    } else {
      this.currentRecord = {
        problemId,
        title,
        tier,
        tierName,
        startTime: Date.now(),
        attempts: 0,
        status: 'solving',
        language
      };
    }

    await this.context.globalState.update(CURRENT_PROBLEM_KEY, this.currentRecord);
    this.startTimerDisplay();

    vscode.window.showInformationMessage(`⏱️ ${problemId}번: ${title} 풀이 시작!`);
  }

  private startTimerDisplay(): void {
    const config = vscode.workspace.getConfiguration('bojmate');
    if (!config.get<boolean>('showTimer', true)) {
      return;
    }

    this.updateStatusBar();
    this.statusBarItem.show();

    // 1초마다 업데이트
    this.timerInterval = setInterval(() => {
      this.updateStatusBar();
    }, 1000);
  }

  private updateStatusBar(): void {
    if (!this.currentRecord) {
      this.statusBarItem.hide();
      return;
    }

    const elapsed = Date.now() - this.currentRecord.startTime;
    const timeStr = this.formatTime(elapsed);
    const status = this.currentRecord.status === 'solving' ? '⏱️' : '⏸️';

    this.statusBarItem.text = `${status} ${this.currentRecord.problemId}번 ${timeStr}`;
    this.statusBarItem.tooltip = `${this.currentRecord.title}\n클릭하여 메뉴 열기`;
  }

  private formatTime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}:${String(minutes % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    }
    return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
  }

  async pauseTimer(): Promise<void> {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    this.updateStatusBar();
  }

  async resumeTimer(): Promise<void> {
    if (this.currentRecord && this.currentRecord.status === 'solving') {
      this.startTimerDisplay();
    }
  }

  async stopTimer(status: 'solved' | 'failed'): Promise<SolveRecord | null> {
    if (!this.currentRecord) {
      return null;
    }

    // 타이머 정지
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    // 기록 완료
    this.currentRecord.endTime = Date.now();
    this.currentRecord.status = status;

    // 저장
    await this.saveRecord(this.currentRecord);
    await this.context.globalState.update(CURRENT_PROBLEM_KEY, undefined);

    const record = this.currentRecord;
    this.currentRecord = null;
    this.statusBarItem.hide();

    const elapsed = record.endTime! - record.startTime;
    const timeStr = this.formatTime(elapsed);
    const emoji = status === 'solved' ? '🎉' : '😢';

    vscode.window.showInformationMessage(
      `${emoji} ${record.problemId}번 ${status === 'solved' ? '해결' : '포기'}! 소요 시간: ${timeStr}`
    );

    return record;
  }

  async incrementAttempt(): Promise<void> {
    if (this.currentRecord) {
      this.currentRecord.attempts++;
      await this.context.globalState.update(CURRENT_PROBLEM_KEY, this.currentRecord);
    }
  }

  async saveRecord(record: SolveRecord): Promise<void> {
    const records = await this.getAllRecords();

    // 같은 문제의 이전 'solving' 기록 제거
    const filteredRecords = records.filter(
      (r) => !(r.problemId === record.problemId && r.status === 'solving')
    );

    filteredRecords.push(record);
    await this.context.globalState.update(SOLVE_RECORDS_KEY, filteredRecords);
  }

  async getAllRecords(): Promise<SolveRecord[]> {
    return this.context.globalState.get<SolveRecord[]>(SOLVE_RECORDS_KEY, []);
  }

  async getRecordsByStatus(status: 'solving' | 'solved' | 'failed'): Promise<SolveRecord[]> {
    const records = await this.getAllRecords();
    return records.filter((r) => r.status === status);
  }

  async getStats(): Promise<{
    totalSolved: number;
    totalTime: number;
    averageTime: number;
    byTier: Record<string, { count: number; totalTime: number }>;
    recentRecords: SolveRecord[];
  }> {
    const records = await this.getAllRecords();
    const solved = records.filter((r) => r.status === 'solved' && r.endTime);

    const totalTime = solved.reduce(
      (sum, r) => sum + (r.endTime! - r.startTime),
      0
    );

    const byTier: Record<string, { count: number; totalTime: number }> = {};
    for (const record of solved) {
      if (!byTier[record.tierName]) {
        byTier[record.tierName] = { count: 0, totalTime: 0 };
      }
      byTier[record.tierName].count++;
      byTier[record.tierName].totalTime += record.endTime! - record.startTime;
    }

    return {
      totalSolved: solved.length,
      totalTime,
      averageTime: solved.length > 0 ? totalTime / solved.length : 0,
      byTier,
      recentRecords: solved.slice(-10).reverse()
    };
  }

  getCurrentRecord(): SolveRecord | null {
    return this.currentRecord;
  }

  dispose(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
    this.statusBarItem.dispose();
  }
}
