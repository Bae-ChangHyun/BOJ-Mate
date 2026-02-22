import * as vscode from 'vscode';
import { BojService } from '../services/BojService';
import { SolvedAcService } from '../services/SolvedAcService';
import { TemplateService } from '../services/TemplateService';
import { TimerService } from '../services/TimerService';
import { SupportedLanguage, LANGUAGE_CONFIG, getTierName } from '../types';

export class CreateProblemCommand {
  private bojService: BojService;
  private solvedAcService: SolvedAcService;
  private templateService: TemplateService;
  private timerService: TimerService;

  constructor(
    bojService: BojService,
    solvedAcService: SolvedAcService,
    templateService: TemplateService,
    timerService: TimerService
  ) {
    this.bojService = bojService;
    this.solvedAcService = solvedAcService;
    this.templateService = templateService;
    this.timerService = timerService;
  }

  async execute(problemId?: string): Promise<void> {
    // 문제 번호 입력
    if (!problemId) {
      problemId = await vscode.window.showInputBox({
        prompt: '문제 번호를 입력하세요',
        placeHolder: '예: 1000',
        validateInput: (value) => {
          if (!value || !/^\d+$/.test(value)) {
            return '올바른 문제 번호를 입력하세요';
          }
          return null;
        }
      });
    }

    if (!problemId) {
      return;
    }

    // 언어 선택
    const config = vscode.workspace.getConfiguration('bojmate');
    const defaultLanguage = config.get<string>('language', 'py');

    const languageItems = Object.entries(LANGUAGE_CONFIG).map(([key, config]) => ({
      label: config.name,
      description: config.extension,
      value: key as SupportedLanguage
    }));

    const selectedLanguage = await vscode.window.showQuickPick(languageItems, {
      placeHolder: '사용할 언어를 선택하세요',
      title: '언어 선택'
    });

    const language = selectedLanguage?.value || (defaultLanguage as SupportedLanguage);

    // 진행 표시
    const result = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `문제 ${problemId} 생성 중...`,
        cancellable: false
      },
      async (progress) => {
        try {
          progress.report({ message: '문제 정보 가져오는 중...' });

          // 문제 정보 가져오기
          const problem = await this.bojService.getProblem(problemId!);
          const solvedInfo = await this.solvedAcService.getProblemInfo(problemId!);

          const tier = solvedInfo?.level || 0;
          const tierName = getTierName(tier);
          const tags = solvedInfo
            ? this.solvedAcService.getTagsKorean(solvedInfo)
            : [];

          progress.report({ message: '파일 생성 중...' });

          // 파일 생성
          const { codePath } = await this.templateService.createProblemFiles(
            problem,
            language,
            tierName,
            tier,
            tags
          );

          // 코드 파일 열기
          const document = await vscode.workspace.openTextDocument(codePath);
          await vscode.window.showTextDocument(document);

          return { problem, tier, tierName };
        } catch (error) {
          vscode.window.showErrorMessage(`문제 생성 실패: ${error}`);
          return null;
        }
      }
    );

    // 타이머 시작 확인 (프로그레스 바 밖에서 처리)
    if (result) {
      const startTimer = await vscode.window.showInformationMessage(
        `문제 ${problemId}번이 생성되었습니다. 타이머를 시작할까요?`,
        '시작',
        '나중에'
      );

      if (startTimer === '시작') {
        await this.timerService.startTimer(
          problemId!,
          result.problem.title,
          result.tier,
          result.tierName,
          language
        );
      }
    }
  }
}
