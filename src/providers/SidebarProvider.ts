import * as vscode from 'vscode';
import { TimerService } from '../services/TimerService';
import { SolvedAcService } from '../services/SolvedAcService';
import { getTierColor, getTierName, TIER_NAMES } from '../types';

export class SidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'bojmate.sidebarView';

  private _view?: vscode.WebviewView;
  private timerService: TimerService;
  private solvedAcService: SolvedAcService;
  private extensionUri: vscode.Uri;

  constructor(
    extensionUri: vscode.Uri,
    timerService: TimerService,
    solvedAcService: SolvedAcService
  ) {
    this.extensionUri = extensionUri;
    this.timerService = timerService;
    this.solvedAcService = solvedAcService;
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri]
    };

    webviewView.webview.html = this.getHtmlContent();

    // 메시지 핸들러
    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case 'viewProblem':
          vscode.commands.executeCommand('bojmate.viewProblem', message.problemId);
          break;
        case 'createProblem':
          vscode.commands.executeCommand('bojmate.createProblem', message.problemId);
          break;
        case 'runTests':
          vscode.commands.executeCommand('bojmate.runTests');
          break;
        case 'submitCode':
          vscode.commands.executeCommand('bojmate.submitCode');
          break;
        case 'getHint':
          vscode.commands.executeCommand('bojmate.getHint');
          break;
        case 'showStats':
          vscode.commands.executeCommand('bojmate.showStats');
          break;
        case 'stopTimer':
          await this.timerService.stopTimer(message.status);
          this.refresh();
          break;
        case 'searchByTier':
          await this.searchByTier(message.tierMin, message.tierMax);
          break;
        case 'refresh':
          this.refresh();
          break;
      }
    });

    // 초기 데이터 전송
    this.refresh();
  }

  public refresh() {
    if (this._view) {
      const currentRecord = this.timerService.getCurrentRecord();
      this._view.webview.postMessage({
        command: 'update',
        currentProblem: currentRecord
      });
    }
  }

  private async searchByTier(tierMin: number, tierMax: number): Promise<void> {
    const result = await this.solvedAcService.getProblemsByTier(tierMin, tierMax);

    if (this._view) {
      this._view.webview.postMessage({
        command: 'searchResults',
        problems: result.items.slice(0, 20).map((p) => ({
          id: p.problemId.toString(),
          title: p.titleKo,
          tier: p.level,
          tierName: getTierName(p.level),
          tierColor: getTierColor(p.level)
        }))
      });
    }
  }

  private getHtmlContent(): string {
    const tierOptions = Object.entries(TIER_NAMES)
      .filter(([level]) => parseInt(level) > 0)
      .map(([level, name]) => `<option value="${level}">${name}</option>`)
      .join('');

    return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BOJ Mate</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: var(--vscode-font-family);
      font-size: 13px;
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      padding: 12px;
    }
    .section {
      margin-bottom: 16px;
    }
    .section-title {
      font-weight: bold;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .search-box {
      display: flex;
      gap: 6px;
    }
    .search-box input {
      flex: 1;
      padding: 6px 10px;
      border: 1px solid var(--vscode-input-border);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border-radius: 4px;
      font-size: 13px;
    }
    .search-box input:focus {
      outline: 1px solid var(--vscode-focusBorder);
    }
    .search-box button {
      padding: 6px 12px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }
    .search-box button:hover {
      background: var(--vscode-button-hoverBackground);
    }
    .current-problem {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      padding: 12px;
    }
    .current-problem .title {
      font-weight: bold;
      margin-bottom: 6px;
    }
    .current-problem .timer {
      font-size: 18px;
      font-family: monospace;
      margin: 8px 0;
    }
    .current-problem .actions {
      display: flex;
      gap: 8px;
      margin-top: 10px;
    }
    .current-problem .actions button {
      flex: 1;
      padding: 6px;
      font-size: 12px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }
    .btn-success {
      background: #28a745;
      color: white;
    }
    .btn-danger {
      background: #dc3545;
      color: white;
    }
    .tier-filter {
      display: flex;
      gap: 8px;
    }
    .tier-filter select {
      flex: 1;
      padding: 6px;
      background: var(--vscode-dropdown-background);
      color: var(--vscode-dropdown-foreground);
      border: 1px solid var(--vscode-dropdown-border);
      border-radius: 4px;
    }
    .quick-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    .quick-actions button {
      padding: 10px;
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 12px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
    }
    .quick-actions button:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }
    .quick-actions .icon {
      font-size: 18px;
    }
    .problem-list {
      max-height: 200px;
      overflow-y: auto;
    }
    .problem-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 8px;
      border-radius: 4px;
      cursor: pointer;
    }
    .problem-item:hover {
      background: var(--vscode-list-hoverBackground);
    }
    .problem-item .tier-badge {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }
    .problem-item .id {
      color: var(--vscode-descriptionForeground);
      min-width: 50px;
    }
    .no-problem {
      color: var(--vscode-descriptionForeground);
      text-align: center;
      padding: 20px;
    }
  </style>
</head>
<body>
  <div class="section">
    <div class="section-title">🔍 문제 검색</div>
    <div class="search-box">
      <input type="text" id="problemId" placeholder="문제 번호" />
      <button onclick="viewProblem()">보기</button>
      <button onclick="createProblem()">생성</button>
    </div>
  </div>

  <div class="section">
    <div class="section-title">📊 현재 진행 중</div>
    <div id="currentProblem" class="no-problem">
      진행 중인 문제가 없습니다
    </div>
  </div>

  <div class="section">
    <div class="section-title">🏷️ 난이도 필터</div>
    <div class="tier-filter">
      <select id="tierMin">
        <option value="1">Bronze V</option>
        ${tierOptions}
      </select>
      <span>~</span>
      <select id="tierMax">
        <option value="30">Ruby I</option>
        ${tierOptions}
      </select>
      <button onclick="searchByTier()">검색</button>
    </div>
    <div id="searchResults" class="problem-list"></div>
  </div>

  <div class="section">
    <div class="section-title">⚡ 빠른 실행</div>
    <div class="quick-actions">
      <button onclick="runTests()">
        <span class="icon">▶️</span>
        <span>테스트</span>
      </button>
      <button onclick="submitCode()">
        <span class="icon">📤</span>
        <span>제출</span>
      </button>
      <button onclick="getHint()">
        <span class="icon">💡</span>
        <span>AI 힌트</span>
      </button>
      <button onclick="showStats()">
        <span class="icon">📈</span>
        <span>통계</span>
      </button>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    let currentProblem = null;
    let timerInterval = null;

    function viewProblem() {
      const problemId = document.getElementById('problemId').value.trim();
      if (problemId) {
        vscode.postMessage({ command: 'viewProblem', problemId });
      }
    }

    function createProblem() {
      const problemId = document.getElementById('problemId').value.trim();
      if (problemId) {
        vscode.postMessage({ command: 'createProblem', problemId });
      }
    }

    function runTests() {
      vscode.postMessage({ command: 'runTests' });
    }

    function submitCode() {
      vscode.postMessage({ command: 'submitCode' });
    }

    function getHint() {
      vscode.postMessage({ command: 'getHint' });
    }

    function showStats() {
      vscode.postMessage({ command: 'showStats' });
    }

    function searchByTier() {
      const tierMin = parseInt(document.getElementById('tierMin').value);
      const tierMax = parseInt(document.getElementById('tierMax').value);
      vscode.postMessage({ command: 'searchByTier', tierMin, tierMax });
    }

    function stopTimer(status) {
      vscode.postMessage({ command: 'stopTimer', status });
    }

    function formatTime(ms) {
      const seconds = Math.floor(ms / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);

      if (hours > 0) {
        return hours + ':' + String(minutes % 60).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
      }
      return minutes + ':' + String(seconds % 60).padStart(2, '0');
    }

    function updateCurrentProblem() {
      const container = document.getElementById('currentProblem');

      if (!currentProblem) {
        container.className = 'no-problem';
        container.innerHTML = '진행 중인 문제가 없습니다';
        return;
      }

      const elapsed = Date.now() - currentProblem.startTime;
      container.className = 'current-problem';
      container.innerHTML = \`
        <div class="title">\${currentProblem.problemId}번: \${currentProblem.title}</div>
        <div class="timer">⏱️ \${formatTime(elapsed)}</div>
        <div style="font-size: 12px; color: var(--vscode-descriptionForeground);">
          시도: \${currentProblem.attempts}회 | \${currentProblem.tierName}
        </div>
        <div class="actions">
          <button class="btn-success" onclick="stopTimer('solved')">✅ 완료</button>
          <button class="btn-danger" onclick="stopTimer('failed')">❌ 포기</button>
        </div>
      \`;
    }

    function renderSearchResults(problems) {
      const container = document.getElementById('searchResults');
      if (!problems || problems.length === 0) {
        container.innerHTML = '<div class="no-problem">검색 결과가 없습니다</div>';
        return;
      }

      container.innerHTML = problems.map(p => \`
        <div class="problem-item" onclick="vscode.postMessage({ command: 'createProblem', problemId: '\${p.id}' })">
          <span class="tier-badge" style="background: \${p.tierColor}"></span>
          <span class="id">\${p.id}</span>
          <span>\${p.title}</span>
        </div>
      \`).join('');
    }

    window.addEventListener('message', event => {
      const message = event.data;
      switch (message.command) {
        case 'update':
          currentProblem = message.currentProblem;
          if (timerInterval) clearInterval(timerInterval);
          if (currentProblem && currentProblem.status === 'solving') {
            timerInterval = setInterval(updateCurrentProblem, 1000);
          }
          updateCurrentProblem();
          break;
        case 'searchResults':
          renderSearchResults(message.problems);
          break;
      }
    });

    // Enter 키로 검색
    document.getElementById('problemId').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        viewProblem();
      }
    });

    // 초기화
    vscode.postMessage({ command: 'refresh' });
  </script>
</body>
</html>`;
  }
}
