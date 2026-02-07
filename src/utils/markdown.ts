/**
 * 간단한 마크다운 → HTML 변환기
 * AI 응답을 Webview에 렌더링하기 위한 용도
 */
export function markdownToHtml(md: string): string {
  let html = md;

  // 코드 블록 (```lang ... ```) - 먼저 처리하여 내부 내용 보호
  const codeBlocks: string[] = [];
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push(
      `<pre><code class="lang-${lang || 'text'}">${escapeHtml(code.trimEnd())}</code></pre>`
    );
    return `\x00CODEBLOCK${idx}\x00`;
  });

  // 인라인 코드
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // 헤더
  html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // 굵게 / 이탤릭
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // 순서 없는 리스트
  html = html.replace(/^([ \t]*)[-*] (.+)$/gm, (_, indent, content) => {
    const depth = indent.length >= 2 ? ' class="nested"' : '';
    return `<li${depth}>${content}</li>`;
  });

  // 순서 있는 리스트
  html = html.replace(/^\d+\. (.+)$/gm, '<li class="ol">$1</li>');

  // 연속된 <li>를 <ul>/<ol>로 감싸기
  html = html.replace(/((?:<li class="ol">.*<\/li>\n?)+)/g, '<ol>$1</ol>');
  html = html.replace(/((?:<li(?:\s[^>]*)?>.*<\/li>\n?)+)/g, (match) => {
    if (match.includes('<ol>')) return match;
    return `<ul>${match}</ul>`;
  });

  // 줄바꿈 → 단락
  html = html.replace(/\n{2,}/g, '</p><p>');
  html = html.replace(/\n/g, '<br>');

  // <p> 태그로 감싸기 (헤더/리스트/코드블록이 아닌 텍스트)
  html = `<p>${html}</p>`;

  // 빈 <p> 태그 제거
  html = html.replace(/<p>\s*<\/p>/g, '');

  // <p> 안의 블록 요소 정리
  html = html.replace(/<p>(<h[1-4]>)/g, '$1');
  html = html.replace(/(<\/h[1-4]>)<\/p>/g, '$1');
  html = html.replace(/<p>(<ul>)/g, '$1');
  html = html.replace(/(<\/ul>)<\/p>/g, '$1');
  html = html.replace(/<p>(<ol>)/g, '$1');
  html = html.replace(/(<\/ol>)<\/p>/g, '$1');
  html = html.replace(/<p>(<pre>)/g, '$1');
  html = html.replace(/(<\/pre>)<\/p>/g, '$1');

  // 코드 블록 복원
  html = html.replace(/\x00CODEBLOCK(\d+)\x00/g, (_, idx) => codeBlocks[parseInt(idx)]);

  return html;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Webview 공통 스타일 */
export function webviewStyles(): string {
  return `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family);
      font-size: 14px;
      color: var(--vscode-editor-foreground);
      background: var(--vscode-editor-background);
      padding: 24px;
      line-height: 1.7;
    }
    h1 {
      font-size: 18px;
      margin-bottom: 8px;
      padding-bottom: 10px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    .badge {
      display: inline-block;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      padding: 2px 10px;
      border-radius: 10px;
      font-size: 12px;
      margin-bottom: 16px;
    }
    .markdown-body h2 { font-size: 16px; margin: 20px 0 8px; color: var(--vscode-textLink-foreground); }
    .markdown-body h3 { font-size: 15px; margin: 16px 0 6px; color: var(--vscode-textLink-foreground); }
    .markdown-body h4 { font-size: 14px; margin: 12px 0 4px; }
    .markdown-body p { margin: 8px 0; }
    .markdown-body ul, .markdown-body ol { padding-left: 20px; margin: 8px 0; }
    .markdown-body li { margin: 4px 0; }
    .markdown-body li.nested { margin-left: 16px; }
    .markdown-body strong { color: var(--vscode-textLink-foreground); }
    .markdown-body code {
      background: var(--vscode-textCodeBlock-background);
      padding: 2px 6px;
      border-radius: 3px;
      font-family: var(--vscode-editor-font-family);
      font-size: 13px;
    }
    .markdown-body pre {
      background: var(--vscode-textCodeBlock-background);
      padding: 14px;
      border-radius: 6px;
      overflow-x: auto;
      margin: 12px 0;
    }
    .markdown-body pre code {
      background: none;
      padding: 0;
      font-size: 13px;
      line-height: 1.5;
    }
  `;
}
