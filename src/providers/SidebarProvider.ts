import * as vscode from 'vscode';
import { TimerService } from '../services/TimerService';
import { SolvedAcService } from '../services/SolvedAcService';
import { AIService } from '../services/AIService';
import { getTierColor, getTierName, TIER_NAMES } from '../types';

export class SidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'bojmate.sidebarView';

  private _view?: vscode.WebviewView;
  private timerService: TimerService;
  private solvedAcService: SolvedAcService;
  private aiService: AIService;
  private extensionUri: vscode.Uri;
  private tags: Array<{ key: string; name: string; problemCount: number }> = [];

  constructor(
    extensionUri: vscode.Uri,
    timerService: TimerService,
    solvedAcService: SolvedAcService,
    aiService: AIService
  ) {
    this.extensionUri = extensionUri;
    this.timerService = timerService;
    this.solvedAcService = solvedAcService;
    this.aiService = aiService;
  }

  public async resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri]
    };

    // 태그 목록 로드
    this.tags = await this.solvedAcService.getAllTags();

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
        case 'openAISettings':
          vscode.commands.executeCommand('bojmate.configureAI');
          break;
        case 'stopTimer':
          await this.timerService.stopTimer(message.status);
          this.refresh();
          break;
        case 'search':
          await this.search(message.tierMin, message.tierMax, message.tag);
          break;
        case 'refresh':
          this.refresh();
          break;
      }
    });

    // 초기 데이터 전송
    this.refresh();
  }

  public async refresh() {
    if (this._view) {
      const currentRecord = this.timerService.getCurrentRecord();
      const aiEnabled = this.aiService.isEnabled();
      const settings = await this.aiService.getSettings();

      this._view.webview.postMessage({
        command: 'update',
        currentProblem: currentRecord,
        aiStatus: {
          enabled: aiEnabled,
          provider: settings.provider,
          model: settings.model
        }
      });
    }
  }

  private async search(tierMin?: number, tierMax?: number, tag?: string): Promise<void> {
    const result = await this.solvedAcService.searchByTierAndTag(tierMin, tierMax, tag);

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

    const tagOptions = this.tags
      .slice(0, 50) // 상위 50개 태그만
      .map(tag => `<option value="${tag.key}">${tag.name} (${tag.problemCount})</option>`)
      .join('');

    return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BOJ Mate</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family);
      font-size: 13px;
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      padding: 12px;
    }
    .section { margin-bottom: 16px; }
    .section-title {
      font-weight: bold;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .search-box { display: flex; gap: 6px; }
    .search-box input {
      flex: 1;
      padding: 6px 10px;
      border: 1px solid var(--vscode-input-border);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border-radius: 4px;
      font-size: 13px;
    }
    .search-box input:focus { outline: 1px solid var(--vscode-focusBorder); }
    .search-box button, .filter-row button {
      padding: 6px 12px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }
    .search-box button:hover, .filter-row button:hover {
      background: var(--vscode-button-hoverBackground);
    }
    .current-problem {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      padding: 12px;
    }
    .current-problem .title { font-weight: bold; margin-bottom: 6px; }
    .current-problem .timer { font-size: 18px; font-family: monospace; margin: 8px 0; }
    .current-problem .actions { display: flex; gap: 8px; margin-top: 10px; }
    .current-problem .actions button {
      flex: 1;
      padding: 6px;
      font-size: 12px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }
    .btn-success { background: #28a745; color: white; }
    .btn-danger { background: #dc3545; color: white; }
    .filter-row {
      display: flex;
      gap: 6px;
      margin-bottom: 8px;
      align-items: center;
    }
    .filter-row select {
      flex: 1;
      padding: 6px;
      background: var(--vscode-dropdown-background);
      color: var(--vscode-dropdown-foreground);
      border: 1px solid var(--vscode-dropdown-border);
      border-radius: 4px;
      font-size: 12px;
    }
    .filter-row span { font-size: 12px; }
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
    .quick-actions .icon { font-size: 18px; }
    .problem-list { max-height: 200px; overflow-y: auto; margin-top: 8px; }
    .problem-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 8px;
      border-radius: 4px;
      cursor: pointer;
    }
    .problem-item:hover { background: var(--vscode-list-hoverBackground); }
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
    .ai-status {
      font-size: 11px;
      padding: 6px 8px;
      background: var(--vscode-editor-background);
      border-radius: 4px;
      margin-bottom: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .ai-status .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      margin-right: 6px;
    }
    .ai-status .enabled { background: #28a745; }
    .ai-status .disabled { background: #dc3545; }
    .ai-status button {
      padding: 2px 8px;
      font-size: 11px;
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border: none;
      border-radius: 3px;
      cursor: pointer;
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
    <div class="section-title">🏷️ 필터 검색</div>
    <div class="filter-row">
      <select id="tierMin">
        <option value="">난이도 (최소)</option>
        ${tierOptions}
      </select>
      <span>~</span>
      <select id="tierMax">
        <option value="">난이도 (최대)</option>
        ${tierOptions}
      </select>
    </div>
    <div class="filter-row">
      <select id="tagFilter">
        <option value="">알고리즘 분류</option>
        ${tagOptions}
      </select>
      <button onclick="search()">검색</button>
    </div>
    <div id="searchResults" class="problem-list"></div>
  </div>

  <div class="section">
    <div class="section-title">💡 AI 힌트</div>
    <div id="aiStatus" class="ai-status">
      <span>
        <span class="status-dot disabled"></span>
        설정 필요
      </span>
      <button onclick="openAISettings()">설정</button>
    </div>
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

    function runTests() { vscode.postMessage({ command: 'runTests' }); }
    function submitCode() { vscode.postMessage({ command: 'submitCode' }); }
    function getHint() { vscode.postMessage({ command: 'getHint' }); }
    function showStats() { vscode.postMessage({ command: 'showStats' }); }
    function openAISettings() { vscode.postMessage({ command: 'openAISettings' }); }

    function search() {
      const tierMin = document.getElementById('tierMin').value;
      const tierMax = document.getElementById('tierMax').value;
      const tag = document.getElementById('tagFilter').value;

      if (!tierMin && !tierMax && !tag) {
        return;
      }

      vscode.postMessage({
        command: 'search',
        tierMin: tierMin ? parseInt(tierMin) : undefined,
        tierMax: tierMax ? parseInt(tierMax) : undefined,
        tag: tag || undefined
      });
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

    function updateAIStatus(aiStatus) {
      const container = document.getElementById('aiStatus');
      if (aiStatus.enabled) {
        container.innerHTML = \`
          <span>
            <span class="status-dot enabled"></span>
            \${aiStatus.provider} / \${aiStatus.model || '모델 미선택'}
          </span>
          <button onclick="openAISettings()">설정</button>
        \`;
      } else {
        container.innerHTML = \`
          <span>
            <span class="status-dot disabled"></span>
            설정 필요
          </span>
          <button onclick="openAISettings()">설정</button>
        \`;
      }
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
          if (message.aiStatus) {
            updateAIStatus(message.aiStatus);
          }
          break;
        case 'searchResults':
          renderSearchResults(message.problems);
          break;
      }
    });

    document.getElementById('problemId').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') viewProblem();
    });

    vscode.postMessage({ command: 'refresh' });
  </script>
</body>
</html>`;
  }
}
