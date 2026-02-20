import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { SupportedLanguage, LANGUAGE_CONFIG, ProblemMetadata, Problem } from '../types';

export class TemplateService {
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  getTemplate(language: SupportedLanguage): string {
    const config = vscode.workspace.getConfiguration('bojmate');
    const templates = config.get<Record<string, string>>('templates', {});
    return templates[language] || this.getDefaultTemplate(language);
  }

  private getDefaultTemplate(language: SupportedLanguage): string {
    const defaults: Record<SupportedLanguage, string> = {
      cpp: `// \${problemId}번: \${title}
#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(0);
    cin.tie(0);

    return 0;
}`,
      py: `# \${problemId}번: \${title}
import sys
input = sys.stdin.readline

`,
      java: `// \${problemId}번: \${title}
import java.io.*;
import java.util.*;

public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));

    }
}`,
      js: `// \${problemId}번: \${title}
const readline = require('readline');
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

let input = [];
rl.on('line', (line) => {
    input.push(line);
}).on('close', () => {

});`,
      rs: `// \${problemId}번: \${title}
use std::io::{self, BufRead, Write, BufWriter};

fn main() {
    let stdin = io::stdin();
    let stdout = io::stdout();
    let mut out = BufWriter::new(stdout.lock());

}`
    };
    return defaults[language];
  }

  applyTemplate(
    template: string,
    problem: Problem,
    tierName?: string
  ): string {
    return template
      .replace(/\$\{problemId\}/g, problem.id)
      .replace(/\$\{title\}/g, problem.title)
      .replace(/\$\{tier\}/g, tierName || 'Unknown')
      .replace(/\$\{timeLimit\}/g, problem.timeLimit)
      .replace(/\$\{memoryLimit\}/g, problem.memoryLimit);
  }

  async createProblemFiles(
    problem: Problem,
    language: SupportedLanguage,
    tierName: string,
    tier: number,
    tags: string[]
  ): Promise<{ codePath: string }> {
    const config = vscode.workspace.getConfiguration('bojmate');
    const organizeByDate = config.get<boolean>('organizeByDate', false);
    const organizeByLevel = config.get<boolean>('organizeByLevel', false);

    // 현재 워크스페이스 폴더 사용
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      // 폴더를 선택하여 워크스페이스로 열기
      const uri = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: '코테 연습 폴더 선택'
      });

      if (uri && uri.length > 0) {
        await vscode.commands.executeCommand('vscode.openFolder', uri[0]);
      }
      throw new Error('폴더를 열고 다시 시도해주세요.');
    }

    const outputDir = workspaceFolders[0].uri.fsPath;

    // .vscode/settings.json 자동 생성 (Copilot 비활성화)
    await this.ensureWorkspaceSettings(outputDir);

    // 폴더 구조 생성
    let targetDir = outputDir;

    if (organizeByDate) {
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      targetDir = path.join(targetDir, today);
    }

    if (organizeByLevel) {
      // 티어 그룹 추출 (Bronze, Silver, Gold, Platinum, Diamond, Ruby, Unrated)
      const tierGroup = this.getTierGroup(tier);
      targetDir = path.join(targetDir, tierGroup);
    }

    // 폴더 생성
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // 코드 파일 생성 (번호_문제명.확장자)
    const langConfig = LANGUAGE_CONFIG[language];
    const safeName = this.sanitizeFileName(problem.title);
    const baseFileName = `${problem.id}_${safeName}`;
    let codeFileName = `${baseFileName}${langConfig.extension}`;
    let codePath = path.join(targetDir, codeFileName);

    // 파일이 이미 존재하는 경우
    if (fs.existsSync(codePath)) {
      const action = await vscode.window.showWarningMessage(
        `파일이 이미 존재합니다: ${codeFileName}`,
        '덮어쓰기',
        '새로 만들기',
        '취소'
      );

      if (action === '취소' || !action) {
        throw new Error('파일 생성이 취소되었습니다.');
      }

      if (action === '새로 만들기') {
        // 고유한 파일명 찾기 (문제번호_(n).확장자)
        let suffix = 1;
        while (fs.existsSync(codePath)) {
          codeFileName = `${baseFileName}_(${suffix})${langConfig.extension}`;
          codePath = path.join(targetDir, codeFileName);
          suffix++;
        }
      }
      // '덮어쓰기'인 경우 그대로 진행
    }

    // 파일 생성
    const template = this.getTemplate(language);
    const code = this.applyTemplate(template, problem, tierName);
    fs.writeFileSync(codePath, code, 'utf-8');

    // 메타데이터를 globalState에 저장
    const metadata: ProblemMetadata = {
      problemId: problem.id,
      title: problem.title,
      tier,
      tierName,
      language,
      createdAt: Date.now(),
      tags,
      codePath,
      testCases: problem.testCases,
      timeLimit: problem.timeLimit
    };

    await this.saveMetadata(problem.id, metadata);

    return { codePath };
  }

  private async ensureWorkspaceSettings(workspaceDir: string): Promise<void> {
    const vscodeDir = path.join(workspaceDir, '.vscode');
    const settingsPath = path.join(vscodeDir, 'settings.json');

    // 이미 있으면 건너뛰기
    if (fs.existsSync(settingsPath)) {
      return;
    }

    if (!fs.existsSync(vscodeDir)) {
      fs.mkdirSync(vscodeDir, { recursive: true });
    }

    const settings = {
      "github.copilot.enable": {
        "*": false,
        "plaintext": false,
        "markdown": false,
        "scminput": false
      },
      "github.copilot.editor.enableAutoCompletions": false,
      "editor.inlineSuggest.enabled": false
    };

    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
  }

  private sanitizeFileName(name: string): string {
    if (!name) { return 'unnamed'; }
    let sanitized = name;
    sanitized = sanitized.replace(/[\x00-\x1F]/g, '');
    sanitized = sanitized.replace(/[\/\\:*?"<>|]/g, '');
    // 재귀적으로 .. 제거 (.... → .. 방지)
    while (sanitized.includes('..')) {
      sanitized = sanitized.replace(/\.\./g, '');
    }
    sanitized = sanitized.replace(/\s+/g, '_');
    sanitized = sanitized.replace(/_+/g, '_');
    sanitized = sanitized.replace(/^[._]+|[._]+$/g, '');
    if (sanitized.length > 200) { sanitized = sanitized.substring(0, 200); }
    return sanitized || 'unnamed';
  }

  private getTierGroup(tier: number): string {
    if (tier === 0) return 'Unrated';
    if (tier <= 5) return 'Bronze';
    if (tier <= 10) return 'Silver';
    if (tier <= 15) return 'Gold';
    if (tier <= 20) return 'Platinum';
    if (tier <= 25) return 'Diamond';
    if (tier <= 30) return 'Ruby';
    return 'Unknown';
  }

  async saveMetadata(problemId: string, metadata: ProblemMetadata): Promise<void> {
    await this.context.globalState.update(`bojmate.metadata:${problemId}`, metadata);
  }

  getMetadataById(problemId: string): ProblemMetadata | undefined {
    return this.context.globalState.get<ProblemMetadata>(`bojmate.metadata:${problemId}`);
  }

  async updateMetadata(
    problemId: string,
    updates: Partial<ProblemMetadata>
  ): Promise<void> {
    const metadata = this.getMetadataById(problemId);
    if (metadata) {
      const updated = { ...metadata, ...updates };
      await this.saveMetadata(problemId, updated);
    }
  }

  findProblemIdFromPath(filePath: string): string | null {
    // 파일명 맨 앞 숫자가 문제번호
    // 1000_A+B.py, 1000_A+B_(1).py, 1000.py 등
    const fileName = path.basename(filePath);
    const match = fileName.match(/^(\d+)/);
    return match ? match[1] : null;
  }
}
