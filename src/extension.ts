import * as vscode from 'vscode';

// Services
import { CacheManager } from './utils/cache';
import { BojService } from './services/BojService';
import { SolvedAcService } from './services/SolvedAcService';
import { AuthService } from './services/AuthService';
import { AIService, AIProvider } from './services/AIService';
import { TimerService } from './services/TimerService';
import { TemplateService } from './services/TemplateService';

// Commands
import { ViewProblemCommand } from './commands/viewProblem';
import { CreateProblemCommand } from './commands/createProblem';
import { RunTestsCommand } from './commands/runTests';
import { SubmitCodeCommand } from './commands/submitCode';
import { GetHintCommand } from './commands/getHint';
import { PushToGithubCommand } from './commands/pushToGithub';

// Providers
import { SidebarProvider } from './providers/SidebarProvider';
import { StatsViewProvider } from './providers/StatsViewProvider';
import { AISettingsProvider } from './providers/AISettingsProvider';

export function activate(context: vscode.ExtensionContext) {
  console.log('BOJ Mate is now active!');

  // Initialize services
  const cacheManager = new CacheManager(context);
  const bojService = new BojService(context, cacheManager);
  const solvedAcService = new SolvedAcService(context, cacheManager);
  const authService = new AuthService(context);
  const aiService = new AIService(context);
  const timerService = new TimerService(context);
  const templateService = new TemplateService(context);

  // Initialize commands
  const viewProblemCommand = new ViewProblemCommand(bojService, solvedAcService);
  const createProblemCommand = new CreateProblemCommand(
    bojService,
    solvedAcService,
    templateService,
    timerService
  );
  const runTestsCommand = new RunTestsCommand(timerService);
  const submitCodeCommand = new SubmitCodeCommand(
    bojService,
    authService,
    templateService,
    timerService
  );
  const getHintCommand = new GetHintCommand(
    bojService,
    solvedAcService,
    aiService,
    templateService
  );
  const pushToGithubCommand = new PushToGithubCommand(templateService);
  const statsViewProvider = new StatsViewProvider(timerService);
  const aiSettingsProvider = new AISettingsProvider(context, aiService);

  // Register sidebar provider
  const sidebarProvider = new SidebarProvider(
    context.extensionUri,
    timerService,
    solvedAcService,
    aiService
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      SidebarProvider.viewType,
      sidebarProvider
    )
  );

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('bojmate.viewProblem', (problemId?: string) => {
      viewProblemCommand.execute(problemId);
    }),

    vscode.commands.registerCommand('bojmate.createProblem', (problemId?: string) => {
      createProblemCommand.execute(problemId);
    }),

    vscode.commands.registerCommand('bojmate.runTests', (filePath?: string) => {
      runTestsCommand.execute(filePath);
    }),

    vscode.commands.registerCommand('bojmate.submitCode', (filePath?: string) => {
      submitCodeCommand.execute(filePath);
    }),

    vscode.commands.registerCommand('bojmate.getHint', (problemId?: string) => {
      getHintCommand.execute(problemId);
    }),

    vscode.commands.registerCommand('bojmate.pushToGithub', (filePath?: string) => {
      pushToGithubCommand.execute(filePath);
    }),

    vscode.commands.registerCommand('bojmate.login', async () => {
      await authService.openLoginPage();
    }),

    vscode.commands.registerCommand('bojmate.saveCookie', async () => {
      await authService.promptForCookie();
    }),

    vscode.commands.registerCommand('bojmate.logout', async () => {
      await authService.clearCookies();
    }),

    vscode.commands.registerCommand('bojmate.showStats', () => {
      statsViewProvider.show();
    }),

    // AI 설정 명령 - Webview 패널 열기
    vscode.commands.registerCommand('bojmate.configureAI', async () => {
      await aiSettingsProvider.show();
    }),

    vscode.commands.registerCommand('bojmate.testAIConnection', async () => {
      const result = await aiService.testConnection();
      if (result.success) {
        vscode.window.showInformationMessage(result.message);
      } else {
        vscode.window.showErrorMessage(result.message);
      }
    }),

    vscode.commands.registerCommand('bojmate.selectAIModel', async () => {
      const models = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: '모델 목록 가져오는 중...'
        },
        async () => {
          return await aiService.fetchModels();
        }
      );

      if (models.length === 0) {
        vscode.window.showWarningMessage('사용 가능한 모델이 없습니다. 먼저 AI를 설정해주세요.');
        return;
      }

      const modelItems = models.map((m) => ({
        label: m.name,
        description: m.id,
        value: m.id
      }));

      const selectedModel = await vscode.window.showQuickPick(modelItems, {
        placeHolder: '사용할 모델을 선택하세요'
      });

      if (selectedModel) {
        const config = vscode.workspace.getConfiguration('bojmate.ai');
        await config.update('model', selectedModel.value, vscode.ConfigurationTarget.Global);
        aiService.refreshClient();
        sidebarProvider.refresh();
        vscode.window.showInformationMessage(`모델 변경: ${selectedModel.label}`);
      }
    }),

    vscode.commands.registerCommand('bojmate.startTimer', async () => {
      const problemId = await vscode.window.showInputBox({
        prompt: '문제 번호를 입력하세요',
        placeHolder: '예: 1000'
      });

      if (problemId) {
        const problem = await bojService.getProblem(problemId);
        const solvedInfo = await solvedAcService.getProblemInfo(problemId);
        const tier = solvedInfo?.level || 0;
        const tierName = solvedInfo
          ? solvedAcService.getTierFromLevel(tier).name
          : 'Unknown';

        const config = vscode.workspace.getConfiguration('bojmate');
        const language = config.get<string>('language', 'py');

        await timerService.startTimer(problemId, problem.title, tier, tierName, language);
        sidebarProvider.refresh();
      }
    }),

    vscode.commands.registerCommand('bojmate.stopTimer', async () => {
      const action = await vscode.window.showQuickPick(
        [
          { label: '✅ 해결 완료', value: 'solved' as const },
          { label: '❌ 포기', value: 'failed' as const }
        ],
        { placeHolder: '풀이 상태를 선택하세요' }
      );

      if (action) {
        await timerService.stopTimer(action.value);
        sidebarProvider.refresh();
      }
    }),

    vscode.commands.registerCommand('bojmate.showTimerMenu', async () => {
      const currentRecord = timerService.getCurrentRecord();

      if (!currentRecord) {
        vscode.window.showInformationMessage('진행 중인 문제가 없습니다.');
        return;
      }

      const action = await vscode.window.showQuickPick(
        [
          { label: '📋 문제 보기', value: 'view' },
          { label: '▶️ 테스트 실행', value: 'test' },
          { label: '📤 코드 제출', value: 'submit' },
          { label: '✅ 해결 완료', value: 'solved' },
          { label: '❌ 포기', value: 'failed' }
        ],
        { placeHolder: `${currentRecord.problemId}번: ${currentRecord.title}` }
      );

      if (action) {
        switch (action.value) {
          case 'view':
            vscode.commands.executeCommand('bojmate.viewProblem', currentRecord.problemId);
            break;
          case 'test':
            vscode.commands.executeCommand('bojmate.runTests');
            break;
          case 'submit':
            vscode.commands.executeCommand('bojmate.submitCode');
            break;
          case 'solved':
          case 'failed':
            await timerService.stopTimer(action.value);
            sidebarProvider.refresh();
            break;
        }
      }
    }),

    vscode.commands.registerCommand('bojmate.refreshSidebar', () => {
      sidebarProvider.refresh();
    })
  );

  // Watch for configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('bojmate')) {
        sidebarProvider.refresh();
      }
    })
  );

  // Show welcome message on first install
  const hasShownWelcome = context.globalState.get('bojmate.welcomeShown');
  if (!hasShownWelcome) {
    vscode.window
      .showInformationMessage(
        '🎯 BOJ Mate가 설치되었습니다! 사이드바에서 문제를 검색해보세요.',
        '설정 열기',
        '닫기'
      )
      .then((selection) => {
        if (selection === '설정 열기') {
          vscode.commands.executeCommand('workbench.action.openSettings', 'bojmate');
        }
      });

    context.globalState.update('bojmate.welcomeShown', true);
  }
}

export function deactivate() {
  console.log('BOJ Mate is now deactivated');
}
