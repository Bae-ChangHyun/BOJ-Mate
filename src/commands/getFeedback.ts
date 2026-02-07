import * as vscode from 'vscode';
import { BojService } from '../services/BojService';
import { SolvedAcService } from '../services/SolvedAcService';
import { AIService } from '../services/AIService';
import { TemplateService } from '../services/TemplateService';
import { getTierName } from '../types';
import { markdownToHtml, webviewStyles } from '../utils/markdown';

export class GetFeedbackCommand {
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

  async execute(filePath?: string): Promise<void> {
    if (!this.aiService.isEnabled()) {
      const action = await vscode.window.showWarningMessage(
        'AI 기능이 비활성화되어 있습니다.',
        'AI 설정 열기'
      );
      if (action) {
        vscode.commands.executeCommand('bojmate.configureAI');
      }
      return;
    }

    if (!filePath) {
      const activeEditor = vscode.window.activeTextEditor;
      if (activeEditor) {
        filePath = activeEditor.document.uri.fsPath;
      }
    }

    if (!filePath) {
      vscode.window.showWarningMessage('피드백을 받을 코드 파일을 열어주세요.');
      return;
    }

    const problemId = this.templateService.findProblemIdFromPath(filePath);
    if (!problemId) {
      vscode.window.showWarningMessage('문제 번호를 파일 경로에서 찾을 수 없습니다.');
      return;
    }

    const document = await vscode.workspace.openTextDocument(filePath);
    const code = document.getText();
    if (!code.trim()) {
      vscode.window.showWarningMessage('코드가 비어있습니다.');
      return;
    }

    const language = this.detectLanguage(filePath);

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'AI 피드백 생성 중...',
        cancellable: false
      },
      async () => {
        try {
          const problem = await this.bojService.getProblem(problemId);
          const solvedInfo = await this.solvedAcService.getProblemInfo(problemId);
          if (solvedInfo) {
            problem.tier = solvedInfo.level;
            problem.tierName = getTierName(solvedInfo.level);
            problem.tags = this.solvedAcService.getTagsKorean(solvedInfo);
          }

          const feedback = await this.aiService.getFeedback(problem, code, language);

          // Webview에 표시
          const panel = vscode.window.createWebviewPanel(
            'bojmateFeedback',
            `피드백: ${problemId}번`,
            vscode.ViewColumn.Beside,
            {}
          );

          const feedbackHtml = markdownToHtml(feedback);
          panel.webview.html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <style>${webviewStyles()}</style>
</head>
<body>
  <h1>#${problemId} ${this.escapeHtml(problem.title)}</h1>
  <span class="badge">${language}</span>
  <div class="markdown-body">${feedbackHtml}</div>
</body>
</html>`;

          // 코드 파일에 주석으로 추가
          await this.appendFeedbackToCode(filePath!, feedback, language);
        } catch (error) {
          vscode.window.showErrorMessage(`피드백 생성 실패: ${error}`);
        }
      }
    );
  }

  private detectLanguage(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase();
    const langMap: Record<string, string> = {
      py: 'Python', cpp: 'C++', cc: 'C++', c: 'C',
      java: 'Java', js: 'JavaScript', rs: 'Rust'
    };
    return langMap[ext || ''] || ext || 'Unknown';
  }

  private escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  private async appendFeedbackToCode(filePath: string, feedback: string, language: string): Promise<void> {
    const cs = this.getCommentStyle(language);
    const timestamp = new Date().toLocaleString('ko-KR');
    const lines = feedback.split('\n');

    let comment = '\n\n';
    comment += `${cs.start}\n`;
    comment += `${cs.line} AI 피드백 (${timestamp})\n`;
    comment += `${cs.line} ${'─'.repeat(30)}\n`;
    for (const line of lines) {
      comment += `${cs.line} ${line}\n`;
    }
    if (cs.end) {
      comment += `${cs.end}\n`;
    }

    const doc = await vscode.workspace.openTextDocument(filePath);
    const edit = new vscode.WorkspaceEdit();
    const lastLine = doc.lineAt(doc.lineCount - 1);
    edit.insert(doc.uri, lastLine.range.end, comment);
    await vscode.workspace.applyEdit(edit);
    await doc.save();
  }

  private getCommentStyle(language: string): { start: string; line: string; end?: string } {
    if (language === 'Python') {
      return { start: '"""', line: '', end: '"""' };
    }
    return { start: '/*', line: ' *', end: ' */' };
  }
}
