import * as vscode from 'vscode';
import * as fs from 'fs';
import { TemplateService } from '../services/TemplateService';
import { TimerService } from '../services/TimerService';
import { detectLanguage } from '../utils/compiler';

export class SubmitCodeCommand {
  private templateService: TemplateService;
  private timerService: TimerService;

  constructor(
    templateService: TemplateService,
    timerService: TimerService
  ) {
    this.templateService = templateService;
    this.timerService = timerService;
  }

  async execute(filePath?: string): Promise<void> {
    // 현재 열린 파일 사용
    if (!filePath) {
      const activeEditor = vscode.window.activeTextEditor;
      if (!activeEditor) {
        vscode.window.showErrorMessage('열린 파일이 없습니다.');
        return;
      }
      filePath = activeEditor.document.uri.fsPath;

      // 파일 저장
      if (activeEditor.document.isDirty) {
        await activeEditor.document.save();
      }
    }

    // 문제 번호 추출
    let problemId = this.templateService.findProblemIdFromPath(filePath);
    if (!problemId) {
      const input = await vscode.window.showInputBox({
        prompt: '문제 번호를 입력하세요',
        placeHolder: '예: 1000'
      });
      if (!input) {
        return;
      }
      problemId = input;
    }

    // 언어 감지
    const language = detectLanguage(filePath);
    if (!language) {
      vscode.window.showErrorMessage('지원하지 않는 언어입니다.');
      return;
    }

    // 코드를 클립보드에 복사
    const code = fs.readFileSync(filePath, 'utf-8');
    await vscode.env.clipboard.writeText(code);

    // 브라우저에서 제출 페이지 열기
    const submitUrl = `https://www.acmicpc.net/submit/${problemId}`;
    await vscode.env.openExternal(vscode.Uri.parse(submitUrl));

    vscode.window.showInformationMessage(
      `코드가 클립보드에 복사되었습니다. 브라우저에서 붙여넣기(Cmd+V) 후 제출해주세요.`,
      '제출 결과 확인'
    ).then(async (selection) => {
      if (selection === '제출 결과 확인') {
        const statusUrl = `https://www.acmicpc.net/status?from_mine=1&problem_id=${problemId}`;
        await vscode.env.openExternal(vscode.Uri.parse(statusUrl));

        // 타이머 종료 확인
        const currentRecord = this.timerService.getCurrentRecord();
        if (currentRecord && currentRecord.problemId === problemId) {
          const stopTimer = await vscode.window.showInformationMessage(
            '문제를 해결하셨나요?',
            '해결 완료',
            '계속 풀기'
          );

          if (stopTimer === '해결 완료') {
            await this.timerService.stopTimer('solved');
          }
        }
      }
    });
  }
}
