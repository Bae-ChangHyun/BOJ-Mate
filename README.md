# BOJ Mate 🎯

백준 온라인 저지 문제 풀이를 위한 올인원 VS Code 익스텐션

## Demo

https://github.com/user-attachments/assets/7d1d4ba1-3c34-4dc4-bdf1-eb4d343769c6


## Features

### 📋 Problem Management
- **문제 보기**: 문제 번호로 백준 문제 조회 (난이도, 태그 포함)
- **문제 생성**: 자동으로 폴더/파일 생성 및 템플릿 적용
- **테스트 케이스**: 예제 입출력 자동 저장 및 테스트

### ⚡ Quick Actions
- **테스트 실행**: 저장된 테스트 케이스로 코드 검증
- **코드 제출**: 쿠키 기반 자동 제출 (로그인 필요)
- **GitHub 푸시**: 커스텀 커밋 메시지 템플릿

### 💡 AI Hints
- **알고리즘 분류**: 어떤 알고리즘을 사용해야 하는지 힌트
- **단계별 힌트**: 풀이 과정을 단계별로 안내
- **전체 풀이**: 완전한 풀이와 코드 제공

### ⏱️ Statistics
- 문제별 풀이 시간 측정
- 난이도별 통계
- 최근 풀이 기록

## Installation

### VS Code Marketplace
1. VS Code 실행
2. Extensions (Ctrl+Shift+X) 열기
3. "BOJ Mate" 검색
4. Install 클릭

### VSIX
```bash
code --install-extension boj-mate-0.0.1.vsix
```

## Configuration

### Basic Settings
```json
{
  "bojmate.username": "your_boj_username",
  "bojmate.language": "py",
  "bojmate.workspacePath": "/path/to/problems"
}
```

### AI Settings
```json
{
  "bojmate.ai.enabled": true,
  "bojmate.ai.baseUrl": "https://api.openai.com/v1",
  "bojmate.ai.apiKey": "your_api_key",
  "bojmate.ai.hintLevel": "algorithm"
}
```

### Code Templates
```json
{
  "bojmate.templates": {
    "py": "# ${problemId}번: ${title}\nimport sys\ninput = sys.stdin.readline\n",
    "cpp": "// ${problemId}번: ${title}\n#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(0);\n    cin.tie(0);\n    return 0;\n}"
  }
}
```

## Usage

### 1. 문제 생성
1. 사이드바에서 문제 번호 입력
2. "생성" 버튼 클릭
3. 언어 선택
4. 자동 생성된 파일에서 코딩 시작

### 2. 테스트 실행
- 단축키: `Ctrl+Shift+T` (설정 가능)
- 명령 팔레트: `BOJ Mate: 테스트 실행`

### 3. 코드 제출
1. `BOJ Mate: 로그인` 실행
2. 백준 사이트에서 로그인
3. 쿠키 저장
4. `BOJ Mate: 코드 제출` 실행

### 4. AI 힌트
1. 설정에서 AI API 설정
2. 문제를 열고 `BOJ Mate: AI 힌트` 실행
3. 힌트 레벨 선택

## Supported Languages

| Language | Extension | BOJ Language ID |
|----------|-----------|-----------------|
| C++ | .cpp | 1001 (C++17) |
| Python | .py | 28 (Python 3) |
| Java | .java | 93 (Java 11) |
| JavaScript | .js | 17 (Node.js) |
| Rust | .rs | 94 (Rust 2021) |

## Commands

| Command | Description |
|---------|-------------|
| `BOJ Mate: 문제 보기` | 문제 웹뷰로 표시 |
| `BOJ Mate: 문제 생성` | 새 문제 폴더/파일 생성 |
| `BOJ Mate: 테스트 실행` | 테스트 케이스 실행 |
| `BOJ Mate: 코드 제출` | 백준에 코드 제출 |
| `BOJ Mate: AI 힌트` | AI 힌트 요청 |
| `BOJ Mate: AI 피드백` | AI 코드 피드백 |
| `BOJ Mate: GitHub 푸시` | Git 커밋 및 푸시 |
| `BOJ Mate: 통계 보기` | 풀이 통계 확인 |
| `BOJ Mate: 타이머 시작` | 풀이 타이머 시작 |
| `BOJ Mate: 타이머 종료` | 풀이 타이머 종료 |
| `BOJ Mate: AI 설정` | AI 프로바이더/모델 설정 |

## Disclaimer

이 익스텐션은 **개인 학습 목적**으로 제작되었으며, 백준 온라인 저지(acmicpc.net)의 공식 제품이 아닙니다.

- 백준 온라인 저지는 [이용 규칙](https://help.acmicpc.net/rule)에서 웹 스크래핑을 금지하고 있습니다.
- 이 익스텐션은 사용자의 개인 학습을 돕기 위한 도구이며, 과도한 트래픽을 발생시키지 않도록 캐싱(24시간)을 적용하고 있습니다.
- 문제의 저작권은 해당 문제를 만든 사람에게 있습니다. 문제 본문을 외부에 재배포하지 마세요.
- 이 익스텐션의 사용으로 인해 발생하는 모든 책임은 사용자에게 있습니다.
- 백준 측에서 API가 공식 제공되면 스크래핑 대신 API를 사용하도록 전환할 예정입니다.

## License

MIT License

## Contributing

이슈 및 PR 환영합니다!
