import * as vscode from 'vscode';
import { BojService } from '../services/BojService';
import { SolvedAcService } from '../services/SolvedAcService';
import { AIService } from '../services/AIService';
import { TemplateService } from '../services/TemplateService';
import { HintLevel, getTierName } from '../types';
import { markdownToHtml, webviewStyles } from '../utils/markdown';

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
    if (!this.aiService.isEnabled()) {
      const action = await vscode.window.showWarningMessage(
        'AI 힌트 기능이 비활성화되어 있습니다.',
        'AI 설정 열기'
      );
      if (action) {
        vscode.commands.executeCommand('bojmate.configureAI');
      }
      return;
    }

    if (!problemId) {
      const activeEditor = vscode.window.activeTextEditor;
      if (activeEditor) {
        problemId = this.templateService.findProblemIdFromPath(
          activeEditor.document.uri.fsPath
        );
      }
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

    const levelItems: { label: string; description: string; value: HintLevel | 'custom' }[] = [
      { label: '알고리즘 분류', description: '어떤 알고리즘인지만', value: 'algorithm' },
      { label: '단계별 힌트', description: '풀이 과정 안내 (코드 없음)', value: 'stepByStep' },
      { label: '전체 풀이', description: '풀이 + 코드', value: 'fullSolution' },
      { label: '직접 질문', description: '원하는 질문을 직접 입력', value: 'custom' }
    ];

    const selectedLevel = await vscode.window.showQuickPick(levelItems, {
      placeHolder: '힌트 레벨 선택'
    });

    if (!selectedLevel) {
      return;
    }

    let customPrompt: string | undefined;
    if (selectedLevel.value === 'custom') {
      customPrompt = await vscode.window.showInputBox({
        prompt: '질문을 입력하세요 (문제 정보와 현재 코드가 함께 전달됩니다)',
        placeHolder: '예: 이 문제에서 DP 테이블을 어떻게 정의해야 하나요?'
      });
      if (!customPrompt) {
        return;
      }
    }

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'AI 힌트 생성 중...',
        cancellable: false
      },
      async () => {
        try {
          const problem = await this.bojService.getProblem(problemId!);
          const solvedInfo = await this.solvedAcService.getProblemInfo(problemId!);
          if (solvedInfo) {
            problem.tier = solvedInfo.level;
            problem.tierName = getTierName(solvedInfo.level);
            problem.tags = this.solvedAcService.getTagsKorean(solvedInfo);
          }

          // 현재 열린 파일의 코드를 가져옴 (작성 중인 코드가 있으면 맞춤 힌트)
          let userCode: string | undefined;
          const activeEditor = vscode.window.activeTextEditor;
          if (activeEditor) {
            const code = activeEditor.document.getText().trim();
            // 템플릿만 있는 수준(5줄 이하)이면 코드 없는 것으로 취급
            if (code && code.split('\n').length > 5) {
              userCode = code;
            }
          }

          const hintLevel: HintLevel = selectedLevel.value === 'custom' ? 'stepByStep' : selectedLevel.value;
          const hint = await this.aiService.getHint(problem, hintLevel, userCode, customPrompt);

          const panel = vscode.window.createWebviewPanel(
            'bojmateHint',
            `힌트: ${problemId}번`,
            vscode.ViewColumn.Beside,
            {}
          );

          const contentHtml = markdownToHtml(hint.content);
          panel.webview.html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
  <style>${webviewStyles()}</style>
</head>
<body>
  <h1>#${this.escapeHtml(problemId!)} ${this.escapeHtml(problem.title)}</h1>
  <div class="markdown-body">${contentHtml}</div>
</body>
</html>`;
        } catch (error) {
          vscode.window.showErrorMessage(`힌트 생성 실패: ${error}`);
        }
      }
    );
  }

  private escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}
