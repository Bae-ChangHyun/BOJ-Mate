import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { CodeRunner, detectLanguage } from '../utils/compiler';
import { TestCase, TestResult, SupportedLanguage } from '../types';
import { TimerService } from '../services/TimerService';

export class RunTestsCommand {
  private codeRunner: CodeRunner;
  private timerService: TimerService;
  private outputChannel: vscode.OutputChannel;

  constructor(timerService: TimerService) {
    this.codeRunner = new CodeRunner();
    this.timerService = timerService;
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

    // 테스트 케이스 로드
    const testCases = this.loadTestCases(filePath);
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
          }
        );

        this.showResults(results, filePath!);
      }
    );
  }

  private loadTestCases(filePath: string): TestCase[] {
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

  private showResults(results: TestResult[], filePath: string): void {
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
