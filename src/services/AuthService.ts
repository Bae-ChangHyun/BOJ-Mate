import * as vscode from 'vscode';

const COOKIES_KEY = 'bojmate.cookies';
const SESSION_KEY = 'bojmate.session';

export class AuthService {
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  async openLoginPage(): Promise<void> {
    // VS Code의 Simple Browser를 사용하여 로그인 페이지 열기
    const loginUrl = 'https://www.acmicpc.net/login';

    await vscode.commands.executeCommand('simpleBrowser.show', loginUrl);

    vscode.window.showInformationMessage(
      '백준 로그인 페이지가 열렸습니다. 로그인 후 "BOJ Mate: 쿠키 저장" 명령을 실행해주세요.',
      '쿠키 저장 방법'
    ).then((selection) => {
      if (selection === '쿠키 저장 방법') {
        this.showCookieInstructions();
      }
    });
  }

  private showCookieInstructions(): void {
    const panel = vscode.window.createWebviewPanel(
      'bojmateCookieHelp',
      'BOJ Mate - 쿠키 저장 방법',
      vscode.ViewColumn.One,
      {}
    );

    panel.webview.html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            line-height: 1.6;
          }
          h1 { color: var(--vscode-textLink-foreground); }
          ol { padding-left: 20px; }
          li { margin: 10px 0; }
          code {
            background: var(--vscode-textCodeBlock-background);
            padding: 2px 6px;
            border-radius: 3px;
          }
          .warning {
            background: var(--vscode-inputValidation-warningBackground);
            border: 1px solid var(--vscode-inputValidation-warningBorder);
            padding: 10px;
            border-radius: 5px;
            margin: 20px 0;
          }
        </style>
      </head>
      <body>
        <h1>🍪 쿠키 저장 방법</h1>
        <ol>
          <li>백준 사이트에 로그인합니다.</li>
          <li>개발자 도구를 엽니다 (F12 또는 Cmd+Option+I)</li>
          <li><strong>Application</strong> 탭 → <strong>Cookies</strong> → <strong>https://www.acmicpc.net</strong></li>
          <li><code>OnlineJudge</code> 쿠키의 값을 복사합니다.</li>
          <li>VS Code에서 <code>Cmd+Shift+P</code> → "BOJ Mate: 쿠키 저장"</li>
          <li>복사한 쿠키 값을 붙여넣기합니다.</li>
        </ol>
        <div class="warning">
          ⚠️ <strong>주의:</strong> 쿠키는 암호화되어 로컬에 저장됩니다.
          절대 다른 사람과 공유하지 마세요.
        </div>
      </body>
      </html>
    `;
  }

  async saveCookies(cookieValue: string): Promise<boolean> {
    if (!cookieValue || cookieValue.trim() === '') {
      vscode.window.showErrorMessage('쿠키 값이 비어있습니다.');
      return false;
    }

    try {
      // 쿠키 형식 정규화
      const normalizedCookie = this.normalizeCookie(cookieValue);

      // 암호화하여 저장 (VS Code의 SecretStorage 사용)
      await this.context.secrets.store(COOKIES_KEY, normalizedCookie);

      // 세션 정보 저장
      await this.context.globalState.update(SESSION_KEY, {
        savedAt: Date.now(),
        valid: true
      });

      vscode.window.showInformationMessage('쿠키가 저장되었습니다. 이제 코드를 제출할 수 있습니다.');
      return true;
    } catch (error) {
      vscode.window.showErrorMessage(`쿠키 저장 실패: ${error}`);
      return false;
    }
  }

  private normalizeCookie(cookieValue: string): string {
    // "OnlineJudge=xxx" 형식 또는 단순 값 모두 처리
    if (cookieValue.includes('OnlineJudge=')) {
      return cookieValue;
    }
    return `OnlineJudge=${cookieValue}`;
  }

  async getCookies(): Promise<string | undefined> {
    return await this.context.secrets.get(COOKIES_KEY);
  }

  async clearCookies(): Promise<void> {
    await this.context.secrets.delete(COOKIES_KEY);
    await this.context.globalState.update(SESSION_KEY, undefined);
    vscode.window.showInformationMessage('저장된 쿠키가 삭제되었습니다.');
  }

  async isLoggedIn(): Promise<boolean> {
    const cookies = await this.getCookies();
    return cookies !== undefined && cookies.length > 0;
  }

  async getSessionInfo(): Promise<{ savedAt: number; valid: boolean } | undefined> {
    return this.context.globalState.get(SESSION_KEY);
  }

  async promptForCookie(): Promise<string | undefined> {
    const cookie = await vscode.window.showInputBox({
      prompt: 'OnlineJudge 쿠키 값을 입력하세요',
      password: true,
      placeHolder: '개발자 도구에서 복사한 쿠키 값',
      ignoreFocusOut: true
    });

    if (cookie) {
      const saved = await this.saveCookies(cookie);
      if (saved) {
        return await this.getCookies();
      }
    }
    return undefined;
  }
}
