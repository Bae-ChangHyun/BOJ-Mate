import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { CodeRunner, detectLanguage } from '../utils/compiler';
import { TestCase, TestResult, SupportedLanguage } from '../types';
import { TimerService } from '../services/TimerService';
import { TemplateService } from '../services/TemplateService';

export class RunTestsCommand {
  private codeRunner: CodeRunner;
  private timerService: TimerService;
  private templateService: TemplateService;
  private outputChannel: vscode.OutputChannel;

  constructor(timerService: TimerService, templateService: TemplateService) {
    this.codeRunner = new CodeRunner();
    this.timerService = timerService;
    this.templateService = templateService;
    this.outputChannel = vscode.window.createOutputChannel('BOJ Mate - 테스트');
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
    }

    // 언어 감지
    const language = detectLanguage(filePath);
    if (!language) {
      vscode.window.showErrorMessage('지원하지 않는 언어입니다.');
      return;
    }

    // 테스트 케이스 및 제한시간 로드
    const { testCases, timeLimitMs } = this.loadTestData(filePath);
    if (testCases.length === 0) {
      vscode.window.showWarningMessage('테스트 케이스를 찾을 수 없습니다.');
      return;
    }

    // 파일 저장
    const document = vscode.workspace.textDocuments.find(
      (doc) => doc.uri.fsPath === filePath
    );
    if (document?.isDirty) {
      await document.save();
    }

    // 시도 횟수 증가
    await this.timerService.incrementAttempt();

    // 테스트 실행
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: '테스트 실행 중...',
        cancellable: false
      },
      async (progress) => {
        const results = await this.codeRunner.runTests(
          filePath!,
          language,
          testCases,
          (current, total) => {
            progress.report({
              message: `테스트 ${current}/${total}`,
              increment: (1 / total) * 100
            });
          },
          timeLimitMs
        );

        this.showResults(results, filePath!, timeLimitMs);
      }
    );
  }

  private loadTestData(filePath: string): { testCases: TestCase[]; timeLimitMs?: number } {
    // 문제 번호 추출
    const problemId = this.templateService.findProblemIdFromPath(filePath);
    if (problemId) {
      // globalState에서 메타데이터 조회
      const metadata = this.templateService.getMetadataById(problemId);
      if (metadata?.testCases && metadata.testCases.length > 0) {
        const timeLimitMs = metadata.timeLimit ? this.parseTimeLimit(metadata.timeLimit) : undefined;
        return { testCases: metadata.testCases, timeLimitMs };
      }
    }

    // 메타데이터가 없으면 기존 방식으로 파일에서 로드 (하위 호환성)
    return { testCases: this.loadTestCasesFromFiles(filePath) };
  }

  private parseTimeLimit(timeLimit: string): number {
    // "1 초" → 1000ms, "2 초" → 2000ms, "0.5 초" → 500ms
    // 로컬 실행은 BOJ 서버보다 느릴 수 있으므로 여유분(x2) 추가
    const match = timeLimit.match(/([\d.]+)\s*초/);
    if (match) {
      const seconds = parseFloat(match[1]);
      return Math.ceil(seconds * 2 * 1000); // x2 여유분
    }
    return 5000; // 파싱 실패 시 기본 5초
  }

  private loadTestCasesFromFiles(filePath: string): TestCase[] {
    const dir = path.dirname(filePath);
    const testCases: TestCase[] = [];
    let i = 1;

    while (true) {
      const inputPath = path.join(dir, `input${i}.txt`);
      const outputPath = path.join(dir, `output${i}.txt`);

      if (!fs.existsSync(inputPath) || !fs.existsSync(outputPath)) {
        break;
      }

      testCases.push({
        input: fs.readFileSync(inputPath, 'utf-8'),
        output: fs.readFileSync(outputPath, 'utf-8')
      });
      i++;
    }

    return testCases;
  }

  private showResults(results: TestResult[], filePath: string, timeLimitMs?: number): void {
    this.outputChannel.clear();
    this.outputChannel.show(true);

    const passed = results.filter((r) => r.passed).length;
    const total = results.length;
    const allPassed = passed === total;

    this.outputChannel.appendLine('═'.repeat(60));
    this.outputChannel.appendLine(
      allPassed
        ? '  ✅ 모든 테스트 통과!'
        : `  ❌ 테스트 결과: ${passed}/${total} 통과`
    );
    if (timeLimitMs) {
      this.outputChannel.appendLine(`  ⏱️ 제한시간: ${timeLimitMs / 2}ms (로컬 여유분 x2 = ${timeLimitMs}ms)`);
    }
    this.outputChannel.appendLine('═'.repeat(60));
    this.outputChannel.appendLine('');

    for (const result of results) {
      const icon = result.passed ? '✅' : '❌';
      this.outputChannel.appendLine(
        `${icon} 테스트 ${result.testCaseIndex + 1} (${result.executionTime}ms)`
      );
      this.outputChannel.appendLine('─'.repeat(40));

      this.outputChannel.appendLine('📥 입력:');
      this.outputChannel.appendLine(this.indent(result.input));
      this.outputChannel.appendLine('');

      this.outputChannel.appendLine('📤 예상 출력:');
      this.outputChannel.appendLine(this.indent(result.expected));
      this.outputChannel.appendLine('');

      this.outputChannel.appendLine('📝 실제 출력:');
      this.outputChannel.appendLine(this.indent(result.actual));

      if (result.error) {
        this.outputChannel.appendLine('');
        this.outputChannel.appendLine('⚠️ 오류:');
        this.outputChannel.appendLine(this.indent(result.error));
      }

      if (!result.passed) {
        this.outputChannel.appendLine('');
        this.outputChannel.appendLine('🔍 차이점:');
        this.showDiff(result.expected, result.actual);
      }

      this.outputChannel.appendLine('');
    }

    // 결과 요약 메시지
    if (allPassed) {
      vscode.window
        .showInformationMessage(
          `✅ 모든 테스트 통과! (${total}개)`,
          '제출하기',
          '닫기'
        )
        .then((selection) => {
          if (selection === '제출하기') {
            vscode.commands.executeCommand('bojmate.submitCode');
          }
        });
    } else {
      vscode.window.showWarningMessage(
        `❌ 테스트 실패: ${passed}/${total} 통과`
      );
    }
  }

  private indent(text: string): string {
    return text
      .split('\n')
      .map((line) => '    ' + line)
      .join('\n');
  }

  private showDiff(expected: string, actual: string): void {
    const expectedLines = expected.split('\n');
    const actualLines = actual.split('\n');
    const maxLines = Math.max(expectedLines.length, actualLines.length);

    for (let i = 0; i < maxLines; i++) {
      const exp = expectedLines[i] ?? '(없음)';
      const act = actualLines[i] ?? '(없음)';

      if (exp !== act) {
        this.outputChannel.appendLine(`    라인 ${i + 1}:`);
        this.outputChannel.appendLine(`      예상: "${exp}"`);
        this.outputChannel.appendLine(`      실제: "${act}"`);
      }
    }
  }

  dispose(): void {
    this.outputChannel.dispose();
  }
}
