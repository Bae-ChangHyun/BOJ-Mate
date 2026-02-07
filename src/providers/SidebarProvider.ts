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

    this.tags = await this.solvedAcService.getAllTags();
    webviewView.webview.html = this.getHtmlContent();

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
        case 'getFeedback':
          vscode.commands.executeCommand('bojmate.getFeedback');
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
          await this.handleSearch(message.query, message.tierMin, message.tierMax, message.tag);
          break;
        case 'refresh':
          this.refresh();
          break;
      }
    });

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

  private async handleSearch(query?: string, tierMin?: number, tierMax?: number, tag?: string): Promise<void> {
    if (!this._view) return;

    // 로딩 표시
    this._view.webview.postMessage({ command: 'searchLoading' });

    try {
      // 쿼리 조합: 텍스트 + 필터
      const queryParts: string[] = [];

      if (query && query.trim()) {
        // 숫자만이면 문제번호 검색, 아니면 텍스트 검색
        if (/^\d+$/.test(query.trim())) {
          queryParts.push(`id:${query.trim()}`);
        } else {
          queryParts.push(query.trim());
        }
      }

      if (tierMin !== undefined && tierMax !== undefined) {
        queryParts.push(`tier:${tierMin}..${tierMax}`);
      } else if (tierMin !== undefined) {
        queryParts.push(`tier:${tierMin}..30`);
      } else if (tierMax !== undefined) {
        queryParts.push(`tier:0..${tierMax}`);
      }

      if (tag) {
        queryParts.push(`tag:${tag}`);
      }

      if (queryParts.length === 0) {
        queryParts.push('solvable:true');
      } else {
        queryParts.push('solvable:true');
      }

      const result = await this.solvedAcService.searchProblems(queryParts.join(' '));

      this._view.webview.postMessage({
        command: 'searchResults',
        problems: result.items.slice(0, 30).map((p) => ({
          id: p.problemId.toString(),
          title: p.titleKo,
          tier: p.level,
          tierName: getTierName(p.level),
          tierColor: getTierColor(p.level)
        })),
        total: result.count
      });
    } catch {
      this._view.webview.postMessage({
        command: 'searchResults',
        problems: [],
        total: 0
      });
    }
  }

  private getHtmlContent(): string {
    // 티어를 그룹별로 묶기
    const tierGroups = [
      { label: 'Bronze', tiers: [1, 2, 3, 4, 5] },
      { label: 'Silver', tiers: [6, 7, 8, 9, 10] },
      { label: 'Gold', tiers: [11, 12, 13, 14, 15] },
      { label: 'Platinum', tiers: [16, 17, 18, 19, 20] },
      { label: 'Diamond', tiers: [21, 22, 23, 24, 25] },
      { label: 'Ruby', tiers: [26, 27, 28, 29, 30] }
    ];

    const tierOptions = tierGroups.map(g =>
      `<optgroup label="${g.label}">` +
      g.tiers.map(t => `<option value="${t}">${TIER_NAMES[t]}</option>`).join('') +
      `</optgroup>`
    ).join('');

    const tagOptions = this.tags
      .slice(0, 50)
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
      font-size: 12px;
      text-transform: uppercase;
      color: var(--vscode-descriptionForeground);
      letter-spacing: 0.5px;
    }

    /* 검색 */
    .search-input {
      width: 100%;
      padding: 7px 10px;
      border: 1px solid var(--vscode-input-border);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border-radius: 4px;
      font-size: 13px;
      margin-bottom: 8px;
    }
    .search-input:focus { outline: 1px solid var(--vscode-focusBorder); }
    .filter-row {
      display: flex;
      gap: 6px;
      margin-bottom: 6px;
    }
    .filter-row select {
      flex: 1;
      padding: 5px;
      background: var(--vscode-dropdown-background);
      color: var(--vscode-dropdown-foreground);
      border: 1px solid var(--vscode-dropdown-border);
      border-radius: 4px;
      font-size: 12px;
    }
    .filter-row span { font-size: 12px; line-height: 28px; }
    .btn-row { display: flex; gap: 6px; }
    .btn {
      flex: 1;
      padding: 6px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    }
    .btn-primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .btn-primary:hover { background: var(--vscode-button-hoverBackground); }
    .btn-secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    .btn-secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }

    /* 결과 */
    .result-header {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      margin: 8px 0 4px;
    }
    .problem-list { max-height: 300px; overflow-y: auto; }
    .problem-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 5px 8px;
      border-radius: 4px;
      cursor: pointer;
    }
    .problem-item:hover { background: var(--vscode-list-hoverBackground); }
    .tier-dot {
      width: 8px; height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .problem-item .pid {
      color: var(--vscode-descriptionForeground);
      min-width: 45px;
      font-size: 12px;
    }
    .problem-item .pname {
      flex: 1;
      font-size: 12px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .problem-item .ptier {
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
      flex-shrink: 0;
    }
    .empty-msg {
      color: var(--vscode-descriptionForeground);
      text-align: center;
      padding: 16px;
      font-size: 12px;
    }
    .loading { text-align: center; padding: 16px; font-size: 12px; color: var(--vscode-descriptionForeground); }

    /* 타이머 */
    .current-problem {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      padding: 10px;
    }
    .current-problem .title { font-weight: bold; margin-bottom: 4px; font-size: 13px; }
    .current-problem .timer { font-size: 18px; font-family: monospace; margin: 6px 0; }
    .current-problem .meta { font-size: 11px; color: var(--vscode-descriptionForeground); }
    .current-problem .actions { display: flex; gap: 6px; margin-top: 8px; }
    .current-problem .actions button {
      flex: 1; padding: 5px; font-size: 12px;
      border: none; border-radius: 4px; cursor: pointer;
    }
    .btn-success { background: #28a745; color: white; }
    .btn-danger { background: #dc3545; color: white; }

    /* AI */
    .ai-status {
      font-size: 11px; padding: 6px 8px;
      background: var(--vscode-editor-background);
      border-radius: 4px;
      display: flex; justify-content: space-between; align-items: center;
    }
    .status-dot {
      display: inline-block; width: 7px; height: 7px;
      border-radius: 50%; margin-right: 5px;
    }
    .enabled { background: #28a745; }
    .disabled { background: #6c757d; }
    .ai-status button {
      padding: 2px 8px; font-size: 11px;
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border: none; border-radius: 3px; cursor: pointer;
    }

    /* 빠른실행 */
    .quick-actions {
      display: grid; grid-template-columns: 1fr 1fr 1fr;
      gap: 6px;
    }
    .quick-actions button {
      padding: 8px 4px;
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border: none; border-radius: 4px; cursor: pointer;
      font-size: 11px; text-align: center;
    }
    .quick-actions button:hover { background: var(--vscode-button-secondaryHoverBackground); }
    .quick-actions .icon { display: block; font-size: 16px; margin-bottom: 2px; }

    hr {
      border: none;
      border-top: 1px solid var(--vscode-panel-border);
      margin: 12px 0;
    }
  </style>
</head>
<body>
  <!-- 문제 검색 -->
  <div class="section">
    <div class="section-title">문제 검색</div>
    <input type="text" class="search-input" id="searchQuery"
           placeholder="번호, 제목, 또는 키워드 검색" />
    <div class="filter-row">
      <select id="tierMin">
        <option value="">최소 난이도</option>
        ${tierOptions}
      </select>
      <span>~</span>
      <select id="tierMax">
        <option value="">최대 난이도</option>
        ${tierOptions}
      </select>
    </div>
    <div class="filter-row">
      <select id="tagFilter">
        <option value="">알고리즘 분류</option>
        ${tagOptions}
      </select>
    </div>
    <div class="btn-row">
      <button class="btn btn-primary" onclick="doSearch()">검색</button>
      <button class="btn btn-secondary" onclick="directCreate()">바로 생성</button>
      <button class="btn btn-secondary" onclick="directView()">보기</button>
    </div>
    <div id="searchResults"></div>
  </div>

  <hr>

  <!-- 현재 진행 중 -->
  <div class="section">
    <div class="section-title">현재 진행 중</div>
    <div id="currentProblem" class="empty-msg">진행 중인 문제가 없습니다</div>
  </div>

  <hr>

  <!-- AI 상태 -->
  <div class="section">
    <div class="section-title">AI</div>
    <div id="aiStatus" class="ai-status">
      <span><span class="status-dot disabled"></span>설정 필요</span>
      <button onclick="openAISettings()">설정</button>
    </div>
  </div>

  <hr>

  <!-- 빠른 실행 -->
  <div class="section">
    <div class="section-title">빠른 실행</div>
    <div class="quick-actions">
      <button onclick="cmd('runTests')"><span class="icon">▶</span>테스트</button>
      <button onclick="cmd('submitCode')"><span class="icon">↗</span>제출</button>
      <button onclick="cmd('getHint')"><span class="icon">?</span>힌트</button>
      <button onclick="cmd('getFeedback')"><span class="icon">✎</span>피드백</button>
      <button onclick="cmd('showStats')"><span class="icon">≡</span>통계</button>
      <button onclick="openAISettings()"><span class="icon">⚙</span>AI 설정</button>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    let currentProblem = null;
    let timerInterval = null;

    function cmd(name) { vscode.postMessage({ command: name }); }
    function openAISettings() { cmd('openAISettings'); }

    // === 검색 ===
    function doSearch() {
      const query = document.getElementById('searchQuery').value.trim();
      const tierMin = document.getElementById('tierMin').value;
      const tierMax = document.getElementById('tierMax').value;
      const tag = document.getElementById('tagFilter').value;

      if (!query && !tierMin && !tierMax && !tag) return;

      vscode.postMessage({
        command: 'search',
        query: query || undefined,
        tierMin: tierMin ? parseInt(tierMin) : undefined,
        tierMax: tierMax ? parseInt(tierMax) : undefined,
        tag: tag || undefined
      });
    }

    function directCreate() {
      const q = document.getElementById('searchQuery').value.trim();
      if (q && /^\\d+$/.test(q)) {
        vscode.postMessage({ command: 'createProblem', problemId: q });
      }
    }

    function directView() {
      const q = document.getElementById('searchQuery').value.trim();
      if (q && /^\\d+$/.test(q)) {
        vscode.postMessage({ command: 'viewProblem', problemId: q });
      }
    }

    function selectProblem(id, action) {
      vscode.postMessage({ command: action, problemId: id });
    }

    // 검색 결과 렌더링
    function renderResults(problems, total) {
      const el = document.getElementById('searchResults');
      if (!problems || problems.length === 0) {
        el.innerHTML = '<div class="empty-msg">결과 없음</div>';
        return;
      }

      let html = '<div class="result-header">' + total + '개 중 ' + problems.length + '개 표시</div>';
      html += '<div class="problem-list">';
      for (const p of problems) {
        html += '<div class="problem-item" onclick="selectProblem(\\'' + p.id + '\\', \\'createProblem\\')" title="클릭하여 생성">' +
          '<span class="tier-dot" style="background:' + p.tierColor + '"></span>' +
          '<span class="pid">' + p.id + '</span>' +
          '<span class="pname">' + p.title + '</span>' +
          '<span class="ptier">' + p.tierName + '</span>' +
          '</div>';
      }
      html += '</div>';
      el.innerHTML = html;
    }

    // === 타이머 ===
    function formatTime(ms) {
      const s = Math.floor(ms / 1000);
      const m = Math.floor(s / 60);
      const h = Math.floor(m / 60);
      if (h > 0) return h + ':' + String(m % 60).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
      return m + ':' + String(s % 60).padStart(2, '0');
    }

    function updateCurrentProblem() {
      const el = document.getElementById('currentProblem');
      if (!currentProblem) {
        el.className = 'empty-msg';
        el.innerHTML = '진행 중인 문제가 없습니다';
        return;
      }
      const elapsed = Date.now() - currentProblem.startTime;
      el.className = 'current-problem';
      el.innerHTML =
        '<div class="title">' + currentProblem.problemId + '번: ' + currentProblem.title + '</div>' +
        '<div class="timer">' + formatTime(elapsed) + '</div>' +
        '<div class="meta">시도 ' + currentProblem.attempts + '회 · ' + currentProblem.tierName + '</div>' +
        '<div class="actions">' +
          '<button class="btn-success" onclick="vscode.postMessage({command:\\'stopTimer\\',status:\\'solved\\'})">완료</button>' +
          '<button class="btn-danger" onclick="vscode.postMessage({command:\\'stopTimer\\',status:\\'failed\\'})">포기</button>' +
        '</div>';
    }

    function updateAIStatus(ai) {
      const el = document.getElementById('aiStatus');
      if (ai.enabled) {
        el.innerHTML = '<span><span class="status-dot enabled"></span>' +
          ai.provider + ' / ' + (ai.model || '모델 미선택') + '</span>' +
          '<button onclick="openAISettings()">설정</button>';
      } else {
        el.innerHTML = '<span><span class="status-dot disabled"></span>설정 필요</span>' +
          '<button onclick="openAISettings()">설정</button>';
      }
    }

    // === 메시지 수신 ===
    window.addEventListener('message', e => {
      const msg = e.data;
      switch (msg.command) {
        case 'update':
          currentProblem = msg.currentProblem;
          if (timerInterval) clearInterval(timerInterval);
          if (currentProblem && currentProblem.status === 'solving') {
            timerInterval = setInterval(updateCurrentProblem, 1000);
          }
          updateCurrentProblem();
          if (msg.aiStatus) updateAIStatus(msg.aiStatus);
          break;
        case 'searchLoading':
          document.getElementById('searchResults').innerHTML = '<div class="loading">검색 중...</div>';
          break;
        case 'searchResults':
          renderResults(msg.problems, msg.total);
          break;
      }
    });

    // Enter 키로 검색
    document.getElementById('searchQuery').addEventListener('keypress', e => {
      if (e.key === 'Enter') doSearch();
    });

    vscode.postMessage({ command: 'refresh' });
  </script>
</body>
</html>`;
  }
}
