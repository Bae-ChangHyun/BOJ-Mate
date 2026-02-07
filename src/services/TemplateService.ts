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
  ): Promise<{ codePath: string; metadataPath: string }> {
    const config = vscode.workspace.getConfiguration('bojmate');
    let workspacePath = config.get<string>('workspacePath', '');

    // 워크스페이스 경로가 설정되지 않은 경우
    if (!workspacePath) {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (workspaceFolders && workspaceFolders.length > 0) {
        workspacePath = workspaceFolders[0].uri.fsPath;
      } else {
        // 사용자에게 폴더 선택 요청
        const uri = await vscode.window.showOpenDialog({
          canSelectFiles: false,
          canSelectFolders: true,
          canSelectMany: false,
          openLabel: '문제 저장 폴더 선택'
        });

        if (!uri || uri.length === 0) {
          throw new Error('폴더를 선택해주세요.');
        }
        workspacePath = uri[0].fsPath;
      }
    }

    // 문제 폴더 생성
    const problemFolder = path.join(workspacePath, problem.id);
    if (!fs.existsSync(problemFolder)) {
      fs.mkdirSync(problemFolder, { recursive: true });
    }

    // 코드 파일 생성
    const langConfig = LANGUAGE_CONFIG[language];
    const codeFileName = language === 'java' ? 'Main.java' : `${problem.id}${langConfig.extension}`;
    const codePath = path.join(problemFolder, codeFileName);

    if (!fs.existsSync(codePath)) {
      const template = this.getTemplate(language);
      const code = this.applyTemplate(template, problem, tierName);
      fs.writeFileSync(codePath, code, 'utf-8');
    }

    // 메타데이터 파일 생성
    const metadata: ProblemMetadata = {
      problemId: problem.id,
      title: problem.title,
      tier,
      tierName,
      language,
      createdAt: Date.now(),
      tags
    };

    const metadataPath = path.join(problemFolder, 'problem.json');
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');

    // 테스트 케이스 파일 생성
    for (let i = 0; i < problem.testCases.length; i++) {
      const tc = problem.testCases[i];
      fs.writeFileSync(
        path.join(problemFolder, `input${i + 1}.txt`),
        tc.input,
        'utf-8'
      );
      fs.writeFileSync(
        path.join(problemFolder, `output${i + 1}.txt`),
        tc.output,
        'utf-8'
      );
    }

    return { codePath, metadataPath };
  }

  async getMetadata(problemFolder: string): Promise<ProblemMetadata | null> {
    const metadataPath = path.join(problemFolder, 'problem.json');
    if (!fs.existsSync(metadataPath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(metadataPath, 'utf-8');
      return JSON.parse(content) as ProblemMetadata;
    } catch {
      return null;
    }
  }

  async updateMetadata(
    problemFolder: string,
    updates: Partial<ProblemMetadata>
  ): Promise<void> {
    const metadata = await this.getMetadata(problemFolder);
    if (metadata) {
      const updated = { ...metadata, ...updates };
      const metadataPath = path.join(problemFolder, 'problem.json');
      fs.writeFileSync(metadataPath, JSON.stringify(updated, null, 2), 'utf-8');
    }
  }

  findProblemIdFromPath(filePath: string): string | null {
    // 파일 경로에서 문제 번호 추출 시도
    const dir = path.dirname(filePath);
    const dirName = path.basename(dir);

    // 디렉토리 이름이 숫자인 경우
    if (/^\d+$/.test(dirName)) {
      return dirName;
    }

    // 파일 이름에서 추출 시도 (예: 1000.py, 1000.cpp)
    const fileName = path.basename(filePath);
    const match = fileName.match(/^(\d+)\./);
    if (match) {
      return match[1];
    }

    return null;
  }
}
