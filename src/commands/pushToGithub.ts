import * as vscode from 'vscode';
import * as path from 'path';
import simpleGit, { SimpleGit } from 'simple-git';
import { TemplateService } from '../services/TemplateService';
import { getTierName } from '../types';

export class PushToGithubCommand {
  private templateService: TemplateService;

  constructor(templateService: TemplateService) {
    this.templateService = templateService;
  }

  async execute(filePath?: string): Promise<void> {
    // 현재 열린 파일 사용
    if (!filePath) {
      const activeEditor = vscode.window.activeTextEditor;
      if (!activeEditor) {
        vscode.window.showErrorMessage('열린 파일이 없습니다.');
        return;
      }
      filePath = activeEditor.document.uri.fsPath;
    }

    const dir = path.dirname(filePath);

    // Git 저장소 확인
    const git: SimpleGit = simpleGit(dir);

    try {
      const isRepo = await git.checkIsRepo();
      if (!isRepo) {
        const init = await vscode.window.showWarningMessage(
          '이 폴더는 Git 저장소가 아닙니다. 초기화할까요?',
          '초기화',
          '취소'
        );

        if (init === '초기화') {
          await git.init();
          vscode.window.showInformationMessage('Git 저장소가 초기화되었습니다.');
        } else {
          return;
        }
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Git 오류: ${error}`);
      return;
    }

    // 메타데이터 읽기
    const metadata = await this.templateService.getMetadata(dir);
    const problemId = metadata?.problemId || this.templateService.findProblemIdFromPath(filePath);
    const title = metadata?.title || 'Unknown';
    const tierName = metadata?.tierName || 'Unknown';

    // 커밋 메시지 생성
    const config = vscode.workspace.getConfiguration('bojmate');
    const messageTemplate = config.get<string>(
      'github.autoCommitMessage',
      '[${problemId}] ${title} - ${tier}'
    );

    const defaultMessage = messageTemplate
      .replace(/\$\{problemId\}/g, problemId || 'unknown')
      .replace(/\$\{title\}/g, title)
      .replace(/\$\{tier\}/g, tierName);

    // 커밋 메시지 입력
    const message = await vscode.window.showInputBox({
      prompt: '커밋 메시지를 입력하세요',
      value: defaultMessage,
      placeHolder: '커밋 메시지'
    });

    if (!message) {
      return;
    }

    // 커밋 및 푸시
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'GitHub 푸시 중...',
        cancellable: false
      },
      async (progress) => {
        try {
          progress.report({ message: '변경사항 확인 중...' });

          // 상태 확인
          const status = await git.status();

          if (status.files.length === 0) {
            vscode.window.showInformationMessage('커밋할 변경사항이 없습니다.');
            return;
          }

          progress.report({ message: '파일 추가 중...' });

          // 문제 폴더의 파일들만 추가
          const problemFolder = path.basename(dir);
          await git.add([`${problemFolder}/*`]);

          progress.report({ message: '커밋 중...' });

          // 커밋
          await git.commit(message);

          progress.report({ message: '푸시 중...' });

          // 리모트 확인
          const remotes = await git.getRemotes(true);
          if (remotes.length === 0) {
            const addRemote = await vscode.window.showWarningMessage(
              '원격 저장소가 설정되지 않았습니다. 설정하시겠습니까?',
              '설정',
              '로컬만 커밋'
            );

            if (addRemote === '설정') {
              const remoteUrl = await vscode.window.showInputBox({
                prompt: '원격 저장소 URL을 입력하세요',
                placeHolder: 'https://github.com/username/repo.git'
              });

              if (remoteUrl) {
                await git.addRemote('origin', remoteUrl);
              } else {
                vscode.window.showInformationMessage('커밋만 완료되었습니다.');
                return;
              }
            } else {
              vscode.window.showInformationMessage('커밋이 완료되었습니다.');
              return;
            }
          }

          // 푸시
          const currentBranch = (await git.branch()).current;
          await git.push('origin', currentBranch, ['--set-upstream']);

          vscode.window.showInformationMessage(
            `✅ ${problemId}번 문제가 GitHub에 푸시되었습니다!`
          );
        } catch (error) {
          vscode.window.showErrorMessage(`푸시 실패: ${error}`);
        }
      }
    );
  }
}
