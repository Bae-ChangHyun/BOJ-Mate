# BOJ Mate - 프로젝트 지침

## 작업 완료 후 필수 절차

작업이 완료되면 수정사항이 있을 경우 **반드시** 다음 순서대로 사용자에게 확인 후 진행:

1. **커밋** - 변경 내용을 확인하고 사용자에게 커밋 여부를 물어본 뒤 커밋
2. **익스텐션 빌드** - `npx @vscode/vsce package --allow-missing-repository`
3. **익스텐션 설치** - `code --install-extension boj-mate-0.0.1.vsix --force`
