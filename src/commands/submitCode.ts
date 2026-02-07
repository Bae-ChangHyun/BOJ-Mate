import * as vscode from 'vscode';
import * as fs from 'fs';
import { BojService } from '../services/BojService';
import { AuthService } from '../services/AuthService';
import { TemplateService } from '../services/TemplateService';
import { TimerService } from '../services/TimerService';
import { detectLanguage } from '../utils/compiler';
import { LANGUAGE_CONFIG } from '../types';

export class SubmitCodeCommand {
  private bojService: BojService;
  private authService: AuthService;
  private templateService: TemplateService;
  private timerService: TimerService;

  constructor(
    bojService: BojService,
    authService: AuthService,
    templateService: TemplateService,
    timerService: TimerService
  ) {
    this.bojService = bojService;
    this.authService = authService;
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
    const problemId = this.templateService.findProblemIdFromPath(filePath);
    if (!problemId) {
      const input = await vscode.window.showInputBox({
        prompt: '문제 번호를 입력하세요',
        placeHolder: '예: 1000'
      });
      if (!input) {
        return;
      }
    }

    // 언어 감지
    const language = detectLanguage(filePath);
    if (!language) {
      vscode.window.showErrorMessage('지원하지 않는 언어입니다.');
      return;
    }

    // 로그인 확인
    const isLoggedIn = await this.authService.isLoggedIn();
    if (!isLoggedIn) {
      const action = await vscode.window.showWarningMessage(
        '로그인이 필요합니다.',
        '로그인',
        '취소'
      );

      if (action === '로그인') {
        await this.authService.openLoginPage();
      }
      return;
    }

    // 쿠키 가져오기
    const cookies = await this.authService.getCookies();
    if (!cookies) {
      vscode.window.showErrorMessage('저장된 쿠키를 찾을 수 없습니다. 다시 로그인해주세요.');
      return;
    }

    // 코드 읽기
    const code = fs.readFileSync(filePath, 'utf-8');
    const languageId = LANGUAGE_CONFIG[language].bojLanguageId;

    // 제출 확인
    const confirm = await vscode.window.showWarningMessage(
      `${problemId}번 문제에 ${LANGUAGE_CONFIG[language].name} 코드를 제출할까요?`,
      '제출',
      '취소'
    );

    if (confirm !== '제출') {
      return;
    }

    // 제출
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: '코드 제출 중...',
        cancellable: false
      },
      async (progress) => {
        try {
          progress.report({ message: '제출 중...' });

          const result = await this.bojService.submitCode(
            problemId!,
            code,
            languageId,
            cookies
          );

          if (result.success) {
            vscode.window.showInformationMessage(
              `✅ 제출 완료! ${result.submissionId ? `(제출 번호: ${result.submissionId})` : ''}`
            );

            // 제출 결과 확인 링크
            if (result.submissionId) {
              const viewResult = await vscode.window.showInformationMessage(
                '제출 결과를 확인하시겠습니까?',
                '확인하기'
              );

              if (viewResult === '확인하기') {
                const uri = vscode.Uri.parse(
                  `https://www.acmicpc.net/status?from_mine=1&problem_id=${problemId}`
                );
                vscode.env.openExternal(uri);
              }
            }

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
          } else {
            vscode.window.showErrorMessage(`❌ 제출 실패: ${result.error}`);
          }
        } catch (error) {
          vscode.window.showErrorMessage(`제출 오류: ${error}`);
        }
      }
    );
  }
}
