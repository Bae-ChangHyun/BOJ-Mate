import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { spawn, ChildProcess } from 'child_process';
import { SupportedLanguage, LANGUAGE_CONFIG, TestCase, TestResult } from '../types';

export interface CompileResult {
  success: boolean;
  error?: string;
  outputPath?: string;
}

export interface ExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  executionTime: number;
  timeout: boolean;
}

export class CodeRunner {
  private readonly timeoutMs: number = 5000; // 5초 타임아웃

  async compile(filePath: string, language: SupportedLanguage): Promise<CompileResult> {
    const config = LANGUAGE_CONFIG[language];

    // 컴파일이 필요 없는 언어
    if (!config.compileCommand) {
      return { success: true };
    }

    const dir = path.dirname(filePath);
    const fileName = path.basename(filePath, config.extension);
    const outputPath = path.join(dir, fileName);

    const command = config.compileCommand
      .replace('{file}', filePath)
      .replace('{output}', outputPath)
      .replace('{dir}', dir);

    return new Promise((resolve) => {
      const [cmd, ...args] = command.split(' ');
      const proc = spawn(cmd, args, { cwd: dir });

      let stderr = '';
      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true, outputPath });
        } else {
          resolve({ success: false, error: stderr || `컴파일 실패 (exit code: ${code})` });
        }
      });

      proc.on('error', (err) => {
        resolve({ success: false, error: `컴파일러 실행 실패: ${err.message}` });
      });
    });
  }

  async execute(
    filePath: string,
    language: SupportedLanguage,
    input: string,
    compiledPath?: string
  ): Promise<ExecutionResult> {
    const config = LANGUAGE_CONFIG[language];
    const dir = path.dirname(filePath);
    const fileName = path.basename(filePath, config.extension);

    let command = config.runCommand
      .replace('{file}', filePath)
      .replace('{output}', compiledPath || path.join(dir, fileName))
      .replace('{dir}', dir);

    const [cmd, ...args] = command.split(' ');

    return new Promise((resolve) => {
      const startTime = Date.now();
      let stdout = '';
      let stderr = '';
      let timeout = false;

      const proc = spawn(cmd, args, { cwd: dir });

      // 타임아웃 설정
      const timer = setTimeout(() => {
        timeout = true;
        proc.kill('SIGKILL');
      }, this.timeoutMs);

      // 입력 전달
      if (input) {
        proc.stdin.write(input);
        proc.stdin.end();
      }

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        clearTimeout(timer);
        const executionTime = Date.now() - startTime;
        resolve({
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: code,
          executionTime,
          timeout
        });
      });

      proc.on('error', (err) => {
        clearTimeout(timer);
        resolve({
          stdout: '',
          stderr: `실행 실패: ${err.message}`,
          exitCode: null,
          executionTime: Date.now() - startTime,
          timeout: false
        });
      });
    });
  }

  async runTests(
    filePath: string,
    language: SupportedLanguage,
    testCases: TestCase[],
    onProgress?: (current: number, total: number) => void
  ): Promise<TestResult[]> {
    const results: TestResult[] = [];

    // 먼저 컴파일 (필요한 경우)
    const compileResult = await this.compile(filePath, language);
    if (!compileResult.success) {
      return testCases.map((tc, i) => ({
        testCaseIndex: i,
        input: tc.input,
        expected: tc.output,
        actual: '',
        passed: false,
        executionTime: 0,
        error: compileResult.error
      }));
    }

    // 테스트 케이스 실행
    for (let i = 0; i < testCases.length; i++) {
      const tc = testCases[i];
      onProgress?.(i + 1, testCases.length);

      const execResult = await this.execute(
        filePath,
        language,
        tc.input,
        compileResult.outputPath
      );

      const expected = normalizeOutput(tc.output);
      const actual = normalizeOutput(execResult.stdout);
      const passed = expected === actual && !execResult.timeout && execResult.exitCode === 0;

      let error: string | undefined;
      if (execResult.timeout) {
        error = '시간 초과';
      } else if (execResult.stderr) {
        error = execResult.stderr;
      } else if (execResult.exitCode !== 0) {
        error = `런타임 에러 (exit code: ${execResult.exitCode})`;
      }

      results.push({
        testCaseIndex: i,
        input: tc.input,
        expected: tc.output,
        actual: execResult.stdout,
        passed,
        executionTime: execResult.executionTime,
        error
      });
    }

    // 컴파일된 파일 정리
    if (compileResult.outputPath && fs.existsSync(compileResult.outputPath)) {
      try {
        fs.unlinkSync(compileResult.outputPath);
      } catch {
        // 정리 실패는 무시
      }
    }

    return results;
  }
}

function normalizeOutput(output: string): string {
  return output
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
}

export function detectLanguage(filePath: string): SupportedLanguage | undefined {
  const ext = path.extname(filePath).toLowerCase();
  for (const [lang, config] of Object.entries(LANGUAGE_CONFIG)) {
    if (config.extension === ext) {
      return lang as SupportedLanguage;
    }
  }
  return undefined;
}
