import * as vscode from 'vscode';
import { BojService } from '../services/BojService';
import { SolvedAcService } from '../services/SolvedAcService';
import { getTierColor, getTierName, Problem } from '../types';

export class ViewProblemCommand {
  private bojService: BojService;
  private solvedAcService: SolvedAcService;

  constructor(bojService: BojService, solvedAcService: SolvedAcService) {
    this.bojService = bojService;
    this.solvedAcService = solvedAcService;
  }

  async execute(problemId?: string): Promise<void> {
    // 문제 번호 입력받기
    if (!problemId) {
      problemId = await vscode.window.showInputBox({
        prompt: '문제 번호를 입력하세요',
        placeHolder: '예: 1000',
        validateInput: (value) => {
          if (!value || !/^\d+$/.test(value)) {
            return '올바른 문제 번호를 입력하세요';
          }
          return null;
        }
      });
    }

    if (!problemId) {
      return;
    }

    // 진행 표시
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `문제 ${problemId} 로딩 중...`,
        cancellable: false
      },
      async () => {
        try {
          // 문제 정보 가져오기
          const problem = await this.bojService.getProblem(problemId!);
          const solvedInfo = await this.solvedAcService.getProblemInfo(problemId!);

          // 태그 정보 추가
          if (solvedInfo) {
            problem.tier = solvedInfo.level;
            problem.tierName = getTierName(solvedInfo.level);
            problem.tags = this.solvedAcService.getTagsKorean(solvedInfo);
          }

          // 웹뷰 패널 생성
          this.showProblemPanel(problem);
        } catch (error) {
          vscode.window.showErrorMessage(`문제 로딩 실패: ${error}`);
        }
      }
    );
  }

  private showProblemPanel(problem: Problem): void {
    const panel = vscode.window.createWebviewPanel(
      'bojmateProblem',
      `[${problem.id}] ${problem.title}`,
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    panel.webview.html = this.getWebviewContent(problem);
  }

  private getWebviewContent(problem: Problem): string {
    const tierColor = problem.tier ? getTierColor(problem.tier) : '#888';
    const tierBadge = problem.tierName
      ? `<span class="tier-badge" style="background: ${tierColor}">${problem.tierName}</span>`
      : '';

    const tags = problem.tags?.map((t) => `<span class="tag">${t}</span>`).join('') || '';

    const testCasesHtml = problem.testCases
      .map(
        (tc, i) => `
        <div class="test-case">
          <div class="test-header">예제 ${i + 1}</div>
          <div class="test-content">
            <div class="test-section">
              <div class="test-label">입력</div>
              <pre class="test-data">${this.escapeHtml(tc.input)}</pre>
            </div>
            <div class="test-section">
              <div class="test-label">출력</div>
              <pre class="test-data">${this.escapeHtml(tc.output)}</pre>
            </div>
          </div>
        </div>
      `
      )
      .join('');

    return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'unsafe-inline';">
  <title>${this.escapeHtml(problem.title)}</title>
  <style>
    :root {
      --bg-color: var(--vscode-editor-background);
      --text-color: var(--vscode-editor-foreground);
      --border-color: var(--vscode-panel-border);
      --link-color: var(--vscode-textLink-foreground);
    }
    body {
      font-family: var(--vscode-font-family);
      padding: 20px;
      max-width: 900px;
      margin: 0 auto;
      color: var(--text-color);
      background: var(--bg-color);
      line-height: 1.6;
    }
    .header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 20px;
      flex-wrap: wrap;
    }
    .problem-id {
      font-size: 14px;
      color: var(--vscode-descriptionForeground);
    }
    h1 {
      margin: 0;
      font-size: 24px;
    }
    .tier-badge {
      padding: 4px 12px;
      border-radius: 12px;
      color: white;
      font-size: 12px;
      font-weight: bold;
    }
    .meta {
      display: flex;
      gap: 20px;
      margin-bottom: 20px;
      font-size: 14px;
      color: var(--vscode-descriptionForeground);
    }
    .tags {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-bottom: 20px;
    }
    .tag {
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 12px;
    }
    .section {
      margin-bottom: 24px;
    }
    .section h2 {
      font-size: 18px;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--border-color);
    }
    .section-content {
      white-space: pre-wrap;
    }
    .section-content img {
      max-width: 100%;
    }
    .test-case {
      margin-bottom: 16px;
      border: 1px solid var(--border-color);
      border-radius: 8px;
      overflow: hidden;
    }
    .test-header {
      background: var(--vscode-sideBar-background);
      padding: 8px 12px;
      font-weight: bold;
    }
    .test-content {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1px;
      background: var(--border-color);
    }
    .test-section {
      background: var(--bg-color);
      padding: 12px;
    }
    .test-label {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 8px;
    }
    .test-data {
      background: var(--vscode-textCodeBlock-background);
      padding: 8px;
      border-radius: 4px;
      margin: 0;
      font-family: var(--vscode-editor-font-family);
      font-size: 13px;
      overflow-x: auto;
    }
    a {
      color: var(--link-color);
    }
    pre, code {
      font-family: var(--vscode-editor-font-family);
    }
  </style>
</head>
<body>
  <div class="header">
    <span class="problem-id">#${problem.id}</span>
    <h1>${this.escapeHtml(problem.title)}</h1>
    ${tierBadge}
  </div>

  <div class="meta">
    <span>⏱️ 시간 제한: ${problem.timeLimit}</span>
    <span>💾 메모리 제한: ${problem.memoryLimit}</span>
  </div>

  ${tags ? `<div class="tags">${tags}</div>` : ''}

  <div class="section">
    <h2>문제</h2>
    <div class="section-content">${problem.description}</div>
  </div>

  <div class="section">
    <h2>입력</h2>
    <div class="section-content">${problem.input}</div>
  </div>

  <div class="section">
    <h2>출력</h2>
    <div class="section-content">${problem.output}</div>
  </div>

  <div class="section">
    <h2>예제</h2>
    ${testCasesHtml}
  </div>
</body>
</html>`;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
