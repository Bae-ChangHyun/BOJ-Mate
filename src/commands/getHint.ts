import * as vscode from 'vscode';
import { BojService } from '../services/BojService';
import { SolvedAcService } from '../services/SolvedAcService';
import { AIService } from '../services/AIService';
import { TemplateService } from '../services/TemplateService';
import { HintLevel, HintResponse, getTierName } from '../types';

export class GetHintCommand {
  private bojService: BojService;
  private solvedAcService: SolvedAcService;
  private aiService: AIService;
  private templateService: TemplateService;

  constructor(
    bojService: BojService,
    solvedAcService: SolvedAcService,
    aiService: AIService,
    templateService: TemplateService
  ) {
    this.bojService = bojService;
    this.solvedAcService = solvedAcService;
    this.aiService = aiService;
    this.templateService = templateService;
  }

  async execute(problemId?: string): Promise<void> {
    // AI 기능 확인
    if (!this.aiService.isEnabled()) {
      const action = await vscode.window.showWarningMessage(
        'AI 힌트 기능이 비활성화되어 있습니다. 설정에서 활성화해주세요.',
        '설정 열기'
      );

      if (action === '설정 열기') {
        vscode.commands.executeCommand(
          'workbench.action.openSettings',
          'bojmate.ai'
        );
      }
      return;
    }

    // 문제 번호 추출
    if (!problemId) {
      // 현재 파일에서 추출 시도
      const activeEditor = vscode.window.activeTextEditor;
      if (activeEditor) {
        problemId = this.templateService.findProblemIdFromPath(
          activeEditor.document.uri.fsPath
        );
      }

      // 직접 입력
      if (!problemId) {
        problemId = await vscode.window.showInputBox({
          prompt: '문제 번호를 입력하세요',
          placeHolder: '예: 1000'
        });
      }
    }

    if (!problemId) {
      return;
    }

    // 힌트 레벨 선택
    const levelItems: { label: string; description: string; value: HintLevel }[] = [
      {
        label: '🏷️ 알고리즘 분류',
        description: '어떤 알고리즘을 사용해야 하는지만 알려줍니다',
        value: 'algorithm'
      },
      {
        label: '📝 단계별 힌트',
        description: '풀이 과정을 단계별로 안내합니다 (코드 없음)',
        value: 'stepByStep'
      },
      {
        label: '💡 전체 풀이',
        description: '완전한 풀이와 코드를 제공합니다',
        value: 'fullSolution'
      }
    ];

    const selectedLevel = await vscode.window.showQuickPick(levelItems, {
      placeHolder: '원하는 힌트 레벨을 선택하세요',
      title: 'AI 힌트 레벨'
    });

    if (!selectedLevel) {
      return;
    }

    // 힌트 가져오기
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'AI 힌트 생성 중...',
        cancellable: false
      },
      async (progress) => {
        try {
          progress.report({ message: '문제 정보 가져오는 중...' });

          // 문제 정보 가져오기
          const problem = await this.bojService.getProblem(problemId!);
          const solvedInfo = await this.solvedAcService.getProblemInfo(problemId!);

          if (solvedInfo) {
            problem.tier = solvedInfo.level;
            problem.tierName = getTierName(solvedInfo.level);
            problem.tags = this.solvedAcService.getTagsKorean(solvedInfo);
          }

          progress.report({ message: 'AI 힌트 생성 중...' });

          // 힌트 요청
          const hint = await this.aiService.getHint(problem, selectedLevel.value);

          // 결과 표시
          this.showHintPanel(problemId!, problem.title, hint);
        } catch (error) {
          vscode.window.showErrorMessage(`힌트 생성 실패: ${error}`);
        }
      }
    );
  }

  private showHintPanel(problemId: string, title: string, hint: HintResponse): void {
    const panel = vscode.window.createWebviewPanel(
      'bojmateHint',
      `💡 힌트: ${problemId}번`,
      vscode.ViewColumn.Beside,
      {
        enableScripts: true
      }
    );

    panel.webview.html = this.getWebviewContent(problemId, title, hint);
  }

  private getWebviewContent(problemId: string, title: string, hint: HintResponse): string {
    const levelLabels: Record<HintLevel, string> = {
      algorithm: '🏷️ 알고리즘 분류',
      stepByStep: '📝 단계별 힌트',
      fullSolution: '💡 전체 풀이'
    };

    const algorithmHtml = hint.algorithm
      ? `
        <div class="section">
          <h3>알고리즘</h3>
          <div class="tags">
            ${hint.algorithm.map((a) => `<span class="tag">${a}</span>`).join('')}
          </div>
        </div>
      `
      : '';

    const stepsHtml = hint.steps
      ? `
        <div class="section">
          <h3>풀이 단계</h3>
          <ol class="steps">
            ${hint.steps.map((s) => `<li>${this.escapeHtml(s)}</li>`).join('')}
          </ol>
        </div>
      `
      : '';

    const codeHtml = hint.code
      ? `
        <div class="section">
          <h3>코드</h3>
          <pre class="code"><code>${this.escapeHtml(hint.code)}</code></pre>
          <button onclick="copyCode()">📋 코드 복사</button>
        </div>
      `
      : '';

    return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI 힌트</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      padding: 20px;
      color: var(--vscode-editor-foreground);
      background: var(--vscode-editor-background);
      line-height: 1.6;
    }
    .header {
      margin-bottom: 20px;
      padding-bottom: 15px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    .header h1 {
      margin: 0 0 8px 0;
      font-size: 20px;
    }
    .level-badge {
      display: inline-block;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 12px;
    }
    .section {
      margin-bottom: 24px;
    }
    .section h3 {
      margin-bottom: 12px;
      color: var(--vscode-textLink-foreground);
    }
    .tags {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .tag {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      padding: 4px 12px;
      border-radius: 4px;
      font-size: 13px;
    }
    .steps {
      padding-left: 20px;
    }
    .steps li {
      margin: 8px 0;
    }
    .content {
      white-space: pre-wrap;
      background: var(--vscode-textCodeBlock-background);
      padding: 15px;
      border-radius: 6px;
    }
    .code {
      background: var(--vscode-textCodeBlock-background);
      padding: 15px;
      border-radius: 6px;
      overflow-x: auto;
      font-family: var(--vscode-editor-font-family);
      font-size: 13px;
    }
    button {
      margin-top: 10px;
      padding: 8px 16px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }
    button:hover {
      background: var(--vscode-button-hoverBackground);
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>#${problemId} ${this.escapeHtml(title)}</h1>
    <span class="level-badge">${levelLabels[hint.level]}</span>
  </div>

  ${algorithmHtml}
  ${stepsHtml}

  <div class="section">
    <h3>상세 설명</h3>
    <div class="content">${this.escapeHtml(hint.content)}</div>
  </div>

  ${codeHtml}

  <script>
    const vscode = acquireVsCodeApi();

    function copyCode() {
      const code = document.querySelector('.code code')?.textContent;
      if (code) {
        navigator.clipboard.writeText(code).then(() => {
          vscode.postMessage({ type: 'copied' });
        });
      }
    }
  </script>
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
