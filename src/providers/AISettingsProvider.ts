import * as vscode from 'vscode';
import { AIService, AIProvider, AIModel } from '../services/AIService';

export class AISettingsProvider {
  private panel: vscode.WebviewPanel | undefined;
  private aiService: AIService;
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext, aiService: AIService) {
    this.context = context;
    this.aiService = aiService;
  }

  async show(): Promise<void> {
    if (this.panel) {
      this.panel.reveal();
      await this.sendCurrentSettings();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'bojmateAISettings',
      '🤖 BOJ Mate AI 설정',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    this.panel.webview.html = this.getHtmlContent();

    this.panel.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case 'getSettings':
          await this.sendCurrentSettings();
          break;
        case 'updateEnabled':
          await this.aiService.updateSettings({ enabled: message.value });
          break;
        case 'updateProvider':
          await this.aiService.updateSettings({ provider: message.value });
          await this.sendCurrentSettings();
          break;
        case 'updateBaseUrl':
          await this.aiService.updateSettings({ baseUrl: message.value });
          break;
        case 'updateApiKey':
          await this.aiService.setApiKey(message.value);
          break;
        case 'updateModel':
          await this.aiService.updateSettings({ model: message.value });
          break;
        case 'updateHintLevel':
          await this.aiService.updateSettings({ hintLevel: message.value });
          break;
        case 'updateTimeout':
          await this.aiService.updateSettings({ timeout: message.value });
          break;
        case 'testConnection':
          await this.testConnection();
          break;
        case 'fetchModels':
          await this.fetchModels();
          break;
        case 'save':
          this.saveAndClose();
          break;
      }
    });

    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });

    await this.sendCurrentSettings();
  }

  private async sendCurrentSettings(): Promise<void> {
    const settings = await this.aiService.getSettings();
    const apiKey = await this.aiService.getApiKey();

    this.panel?.webview.postMessage({
      command: 'settings',
      data: {
        ...settings,
        apiKey: apiKey ? '••••••••' : ''
      }
    });
  }

  private async testConnection(): Promise<void> {
    this.panel?.webview.postMessage({
      command: 'connectionStatus',
      status: 'testing'
    });

    await this.aiService.refreshClient();
    const result = await this.aiService.testConnection();

    this.panel?.webview.postMessage({
      command: 'connectionStatus',
      status: result.success ? 'success' : 'error',
      message: result.message
    });
  }

  private async fetchModels(): Promise<void> {
    this.panel?.webview.postMessage({
      command: 'modelsStatus',
      status: 'loading'
    });

    const models = await this.aiService.fetchModels();

    this.panel?.webview.postMessage({
      command: 'modelsStatus',
      status: 'loaded',
      models
    });
  }

  private saveAndClose(): void {
    vscode.window.showInformationMessage('✅ AI 설정이 저장되었습니다.');
    this.panel?.dispose();
  }

  private getHtmlContent(): string {
    return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI 설정</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family);
      font-size: 13px;
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 24px;
      max-width: 600px;
      margin: 0 auto;
    }
    h1 {
      font-size: 20px;
      margin-bottom: 24px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .section {
      margin-bottom: 24px;
      padding: 16px;
      background: var(--vscode-sideBar-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 8px;
    }
    .section.disabled {
      opacity: 0.5;
      pointer-events: none;
    }
    .section-title {
      font-weight: bold;
      margin-bottom: 16px;
      font-size: 14px;
    }
    .form-group {
      margin-bottom: 16px;
    }
    .form-group:last-child {
      margin-bottom: 0;
    }
    label {
      display: block;
      margin-bottom: 6px;
      font-weight: 500;
    }
    .description {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      margin-top: 4px;
    }
    input[type="text"], input[type="password"], input[type="number"], select {
      width: 100%;
      padding: 8px 12px;
      border: 1px solid var(--vscode-input-border);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border-radius: 4px;
      font-size: 13px;
    }
    input:focus, select:focus {
      outline: 1px solid var(--vscode-focusBorder);
    }
    .input-with-button {
      display: flex;
      gap: 8px;
    }
    .input-with-button input, .input-with-button select {
      flex: 1;
    }
    button {
      padding: 8px 16px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .btn-primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .btn-primary:hover {
      background: var(--vscode-button-hoverBackground);
    }
    .btn-secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    .btn-secondary:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }
    .btn-primary:disabled, .btn-secondary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .toggle-container {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .toggle {
      position: relative;
      width: 40px;
      height: 22px;
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border);
      border-radius: 11px;
      cursor: pointer;
      transition: background 0.2s;
    }
    .toggle.active {
      background: var(--vscode-button-background);
      border-color: var(--vscode-button-background);
    }
    .toggle::after {
      content: '';
      position: absolute;
      top: 2px;
      left: 2px;
      width: 16px;
      height: 16px;
      background: white;
      border-radius: 50%;
      transition: transform 0.2s;
    }
    .toggle.active::after {
      transform: translateX(18px);
    }
    .status {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 12px;
      margin-top: 8px;
    }
    .status.success {
      background: rgba(40, 167, 69, 0.2);
      color: #28a745;
    }
    .status.error {
      background: rgba(220, 53, 69, 0.2);
      color: #dc3545;
    }
    .status.loading {
      background: rgba(0, 123, 255, 0.2);
      color: #007bff;
    }
    .model-select-container {
      margin-top: 12px;
    }
    .hidden { display: none !important; }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      margin-top: 24px;
    }
    .spinner {
      width: 14px;
      height: 14px;
      border: 2px solid currentColor;
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .inline-group {
      display: flex;
      gap: 16px;
    }
    .inline-group .form-group {
      flex: 1;
    }
  </style>
</head>
<body>
  <h1>🤖 AI 힌트 설정</h1>

  <!-- Enable Toggle -->
  <div class="section">
    <div class="toggle-container">
      <div id="enableToggle" class="toggle" onclick="toggleEnabled()"></div>
      <div>
        <label style="margin: 0;">AI 힌트 기능 활성화</label>
        <div class="description">AI를 사용하여 문제 풀이 힌트를 받습니다</div>
      </div>
    </div>
  </div>

  <!-- AI Settings (shown when enabled) -->
  <div id="aiSettings" class="section disabled">
    <div class="section-title">API 설정</div>

    <!-- Provider -->
    <div class="form-group">
      <label>Provider</label>
      <select id="provider" onchange="onProviderChange()">
        <option value="openai">OpenAI (GPT-4, GPT-4o)</option>
        <option value="anthropic">Anthropic (Claude)</option>
        <option value="google">Google (Gemini)</option>
        <option value="openrouter">OpenRouter</option>
        <option value="local">Local / Custom</option>
      </select>
    </div>

    <!-- Base URL (for local) -->
    <div id="baseUrlGroup" class="form-group hidden">
      <label>Base URL</label>
      <input type="text" id="baseUrl" placeholder="http://localhost:11434/v1" onchange="onBaseUrlChange()">
      <div class="description">로컬 서버 또는 커스텀 API 엔드포인트 URL</div>
    </div>

    <!-- API Key -->
    <div class="form-group">
      <label>API Key</label>
      <input type="password" id="apiKey" placeholder="sk-..." onchange="onApiKeyChange()">
      <div class="description" id="apiKeyDesc">OpenAI API 키를 입력하세요</div>
    </div>

    <!-- Model Selection -->
    <div class="form-group">
      <label>Model</label>
      <div class="input-with-button">
        <select id="modelSelect" onchange="onModelSelect()">
          <option value="">연결 후 모델 선택</option>
        </select>
        <button id="connectBtn" class="btn-secondary" onclick="testAndFetchModels()">
          <span id="connectBtnText">연결</span>
        </button>
      </div>
      <div id="connectionStatus"></div>
    </div>

    <!-- Hint Level & Timeout -->
    <div class="inline-group">
      <div class="form-group">
        <label>힌트 레벨</label>
        <select id="hintLevel" onchange="onHintLevelChange()">
          <option value="algorithm">알고리즘 분류만</option>
          <option value="stepByStep">단계별 힌트</option>
          <option value="fullSolution">전체 풀이 + 코드</option>
        </select>
      </div>
      <div class="form-group">
        <label>Timeout (초)</label>
        <input type="number" id="timeout" min="10" max="300" value="60" onchange="onTimeoutChange()">
      </div>
    </div>
  </div>

  <div class="actions">
    <button class="btn-primary" onclick="save()">저장</button>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    let settings = {};
    let models = [];

    const providerDescriptions = {
      openai: 'OpenAI API 키를 입력하세요',
      anthropic: 'Anthropic API 키를 입력하세요',
      google: 'Google AI API 키를 입력하세요',
      openrouter: 'OpenRouter API 키를 입력하세요',
      local: 'API 키 (선택사항)'
    };

    function toggleEnabled() {
      const toggle = document.getElementById('enableToggle');
      const isEnabled = !toggle.classList.contains('active');
      toggle.classList.toggle('active', isEnabled);
      document.getElementById('aiSettings').classList.toggle('disabled', !isEnabled);
      vscode.postMessage({ command: 'updateEnabled', value: isEnabled });
    }

    function onProviderChange() {
      const provider = document.getElementById('provider').value;
      const baseUrlGroup = document.getElementById('baseUrlGroup');
      const apiKeyDesc = document.getElementById('apiKeyDesc');

      baseUrlGroup.classList.toggle('hidden', provider !== 'local');
      apiKeyDesc.textContent = providerDescriptions[provider];

      vscode.postMessage({ command: 'updateProvider', value: provider });
      resetModelSelection();
    }

    function onBaseUrlChange() {
      const baseUrl = document.getElementById('baseUrl').value;
      vscode.postMessage({ command: 'updateBaseUrl', value: baseUrl });
      resetModelSelection();
    }

    function onApiKeyChange() {
      const apiKey = document.getElementById('apiKey').value;
      vscode.postMessage({ command: 'updateApiKey', value: apiKey });
      resetModelSelection();
    }

    function onHintLevelChange() {
      const hintLevel = document.getElementById('hintLevel').value;
      vscode.postMessage({ command: 'updateHintLevel', value: hintLevel });
    }

    function onTimeoutChange() {
      const timeout = parseInt(document.getElementById('timeout').value) * 1000;
      vscode.postMessage({ command: 'updateTimeout', value: timeout });
    }

    function resetModelSelection() {
      const select = document.getElementById('modelSelect');
      select.innerHTML = '<option value="">연결 후 모델 선택</option>';
      document.getElementById('connectionStatus').innerHTML = '';
    }

    function testAndFetchModels() {
      const btn = document.getElementById('connectBtn');
      btn.disabled = true;
      document.getElementById('connectBtnText').innerHTML = '<span class="spinner"></span>';
      vscode.postMessage({ command: 'testConnection' });
    }

    function onModelSelect() {
      const select = document.getElementById('modelSelect');
      const modelId = select.value;
      if (modelId) {
        document.getElementById('modelInput').value = modelId;
        vscode.postMessage({ command: 'updateModel', value: modelId });
      }
    }

    function save() {
      vscode.postMessage({ command: 'save' });
    }

    function applySettings(data) {
      settings = data;

      // Enable toggle
      const toggle = document.getElementById('enableToggle');
      toggle.classList.toggle('active', data.enabled);
      document.getElementById('aiSettings').classList.toggle('disabled', !data.enabled);

      // Provider
      document.getElementById('provider').value = data.provider;
      document.getElementById('baseUrlGroup').classList.toggle('hidden', data.provider !== 'local');
      document.getElementById('apiKeyDesc').textContent = providerDescriptions[data.provider];

      // Base URL
      document.getElementById('baseUrl').value = data.baseUrl || '';

      // API Key
      document.getElementById('apiKey').value = data.apiKey || '';
      document.getElementById('apiKey').placeholder = data.apiKey ? '(설정됨)' : 'sk-...';

      // Model - 저장된 모델이 있으면 옵션에 추가
      const modelSelect = document.getElementById('modelSelect');
      if (data.model) {
        modelSelect.innerHTML = '<option value="">모델 선택...</option><option value="' + data.model + '" selected>' + data.model + '</option>';
      }

      // Hint Level
      document.getElementById('hintLevel').value = data.hintLevel || 'algorithm';

      // Timeout
      document.getElementById('timeout').value = (data.timeout || 60000) / 1000;
    }

    window.addEventListener('message', event => {
      const message = event.data;
      switch (message.command) {
        case 'settings':
          applySettings(message.data);
          break;
        case 'connectionStatus':
          const btn = document.getElementById('connectBtn');
          const statusDiv = document.getElementById('connectionStatus');
          btn.disabled = false;
          document.getElementById('connectBtnText').textContent = '연결';

          if (message.status === 'testing') {
            statusDiv.innerHTML = '<div class="status loading"><span class="spinner"></span> 연결 중...</div>';
          } else if (message.status === 'success') {
            statusDiv.innerHTML = '<div class="status success">✓ ' + message.message + '</div>';
            vscode.postMessage({ command: 'fetchModels' });
          } else {
            statusDiv.innerHTML = '<div class="status error">✕ ' + message.message + '</div>';
          }
          break;
        case 'modelsStatus':
          const modelSel = document.getElementById('modelSelect');

          if (message.status === 'loading') {
            modelSel.innerHTML = '<option value="">모델 로딩 중...</option>';
            modelSel.disabled = true;
          } else if (message.status === 'loaded') {
            models = message.models;
            modelSel.innerHTML = '<option value="">모델 선택...</option>';
            models.forEach(m => {
              const option = document.createElement('option');
              option.value = m.id;
              option.textContent = m.name;
              modelSel.appendChild(option);
            });
            modelSel.disabled = false;

            if (settings.model) {
              modelSel.value = settings.model;
            }
          }
          break;
      }
    });

    vscode.postMessage({ command: 'getSettings' });
  </script>
</body>
</html>`;
  }
}
