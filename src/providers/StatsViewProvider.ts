import * as vscode from 'vscode';
import { TimerService } from '../services/TimerService';
import { getTierColor } from '../types';

export class StatsViewProvider {
  private timerService: TimerService;

  constructor(timerService: TimerService) {
    this.timerService = timerService;
  }

  async show(): Promise<void> {
    const stats = await this.timerService.getStats();

    const panel = vscode.window.createWebviewPanel(
      'bojmateStats',
      '📊 BOJ Mate 통계',
      vscode.ViewColumn.One,
      {
        enableScripts: true
      }
    );

    panel.webview.html = this.getWebviewContent(stats);
  }

  private getWebviewContent(stats: {
    totalSolved: number;
    totalTime: number;
    averageTime: number;
    byTier: Record<string, { count: number; totalTime: number }>;
    recentRecords: Array<{
      problemId: string;
      title: string;
      tier: number;
      tierName: string;
      startTime: number;
      endTime?: number;
    }>;
  }): string {
    const formatTime = (ms: number): string => {
      const minutes = Math.floor(ms / 60000);
      const hours = Math.floor(minutes / 60);
      if (hours > 0) {
        return `${hours}시간 ${minutes % 60}분`;
      }
      return `${minutes}분`;
    };

    const tierStats = Object.entries(stats.byTier)
      .map(
        ([tierName, data]) => `
        <tr>
          <td>${tierName}</td>
          <td>${data.count}문제</td>
          <td>${formatTime(data.totalTime)}</td>
          <td>${formatTime(data.totalTime / data.count)}</td>
        </tr>
      `
      )
      .join('');

    const recentRecords = stats.recentRecords
      .map(
        (r) => `
        <tr>
          <td>${r.problemId}</td>
          <td>${r.title}</td>
          <td><span class="tier-badge" style="background: ${getTierColor(r.tier)}">${r.tierName}</span></td>
          <td>${r.endTime ? formatTime(r.endTime - r.startTime) : '-'}</td>
          <td>${new Date(r.startTime).toLocaleDateString()}</td>
        </tr>
      `
      )
      .join('');

    return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>통계</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      padding: 24px;
      color: var(--vscode-editor-foreground);
      background: var(--vscode-editor-background);
      max-width: 1000px;
      margin: 0 auto;
    }
    h1 {
      margin-bottom: 24px;
    }
    .summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 32px;
    }
    .stat-card {
      background: var(--vscode-sideBar-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 8px;
      padding: 16px;
      text-align: center;
    }
    .stat-card .value {
      font-size: 32px;
      font-weight: bold;
      color: var(--vscode-textLink-foreground);
    }
    .stat-card .label {
      font-size: 14px;
      color: var(--vscode-descriptionForeground);
      margin-top: 4px;
    }
    .section {
      margin-bottom: 32px;
    }
    .section h2 {
      margin-bottom: 16px;
      font-size: 18px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th, td {
      padding: 10px 12px;
      text-align: left;
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    th {
      background: var(--vscode-sideBar-background);
      font-weight: bold;
    }
    .tier-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 10px;
      color: white;
      font-size: 12px;
    }
    .empty-state {
      text-align: center;
      padding: 40px;
      color: var(--vscode-descriptionForeground);
    }
  </style>
</head>
<body>
  <h1>📊 풀이 통계</h1>

  <div class="summary">
    <div class="stat-card">
      <div class="value">${stats.totalSolved}</div>
      <div class="label">해결한 문제</div>
    </div>
    <div class="stat-card">
      <div class="value">${formatTime(stats.totalTime)}</div>
      <div class="label">총 풀이 시간</div>
    </div>
    <div class="stat-card">
      <div class="value">${stats.totalSolved > 0 ? formatTime(stats.averageTime) : '-'}</div>
      <div class="label">평균 풀이 시간</div>
    </div>
  </div>

  <div class="section">
    <h2>🏆 난이도별 통계</h2>
    ${
      Object.keys(stats.byTier).length > 0
        ? `
      <table>
        <thead>
          <tr>
            <th>난이도</th>
            <th>해결 수</th>
            <th>총 시간</th>
            <th>평균 시간</th>
          </tr>
        </thead>
        <tbody>
          ${tierStats}
        </tbody>
      </table>
    `
        : '<div class="empty-state">아직 데이터가 없습니다</div>'
    }
  </div>

  <div class="section">
    <h2>📋 최근 풀이 기록</h2>
    ${
      stats.recentRecords.length > 0
        ? `
      <table>
        <thead>
          <tr>
            <th>번호</th>
            <th>제목</th>
            <th>난이도</th>
            <th>풀이 시간</th>
            <th>날짜</th>
          </tr>
        </thead>
        <tbody>
          ${recentRecords}
        </tbody>
      </table>
    `
        : '<div class="empty-state">아직 풀이 기록이 없습니다</div>'
    }
  </div>
</body>
</html>`;
  }
}
