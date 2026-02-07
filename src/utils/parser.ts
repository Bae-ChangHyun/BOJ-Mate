import * as cheerio from 'cheerio';
import { Problem, TestCase } from '../types';

export function parseProblemPage(html: string, problemId: string): Problem {
  const $ = cheerio.load(html);

  // 제목 파싱
  const title = $('#problem_title').text().trim();

  // 문제 설명 파싱
  const description = $('#problem_description').html() || '';

  // 입력 설명 파싱
  const input = $('#problem_input').html() || '';

  // 출력 설명 파싱
  const output = $('#problem_output').html() || '';

  // 시간/메모리 제한 파싱
  const infoTable = $('#problem-info tbody tr td');
  const timeLimit = infoTable.eq(0).text().trim();
  const memoryLimit = infoTable.eq(1).text().trim();

  // 테스트 케이스 파싱
  const testCases: TestCase[] = [];
  let i = 1;
  while (true) {
    const sampleInput = $(`#sample-input-${i}`).text();
    const sampleOutput = $(`#sample-output-${i}`).text();

    if (!sampleInput && !sampleOutput) {
      break;
    }

    testCases.push({
      input: sampleInput.trim(),
      output: sampleOutput.trim()
    });
    i++;
  }

  // 출처 파싱 (있는 경우)
  const source = $('#source a').first().text().trim() || undefined;

  return {
    id: problemId,
    title,
    description: cleanHtml(description),
    input: cleanHtml(input),
    output: cleanHtml(output),
    testCases,
    timeLimit,
    memoryLimit,
    source
  };
}

export function cleanHtml(html: string): string {
  // 불필요한 속성 제거하고 깔끔하게 정리
  return html
    .replace(/class="[^"]*"/g, '')
    .replace(/style="[^"]*"/g, '')
    .replace(/id="[^"]*"/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function htmlToMarkdown(html: string): string {
  const $ = cheerio.load(html);

  // 수식 처리 (MathJax)
  $('span.tex-span').each((_, el) => {
    const tex = $(el).text();
    $(el).replaceWith(`$${tex}$`);
  });

  // pre 태그 처리
  $('pre').each((_, el) => {
    const code = $(el).text();
    $(el).replaceWith(`\n\`\`\`\n${code}\n\`\`\`\n`);
  });

  // code 태그 처리
  $('code').each((_, el) => {
    const code = $(el).text();
    $(el).replaceWith(`\`${code}\``);
  });

  // 강조 처리
  $('strong, b').each((_, el) => {
    const text = $(el).text();
    $(el).replaceWith(`**${text}**`);
  });

  $('em, i').each((_, el) => {
    const text = $(el).text();
    $(el).replaceWith(`*${text}*`);
  });

  // 리스트 처리
  $('ul li').each((_, el) => {
    const text = $(el).text();
    $(el).replaceWith(`- ${text}\n`);
  });

  $('ol li').each((i, el) => {
    const text = $(el).text();
    $(el).replaceWith(`${i + 1}. ${text}\n`);
  });

  // 링크 처리
  $('a').each((_, el) => {
    const href = $(el).attr('href');
    const text = $(el).text();
    if (href) {
      $(el).replaceWith(`[${text}](${href})`);
    }
  });

  // 이미지 처리
  $('img').each((_, el) => {
    const src = $(el).attr('src');
    const alt = $(el).attr('alt') || 'image';
    if (src) {
      const fullSrc = src.startsWith('http') ? src : `https://www.acmicpc.net${src}`;
      $(el).replaceWith(`![${alt}](${fullSrc})`);
    }
  });

  // 단락 처리
  $('p').each((_, el) => {
    const text = $(el).text();
    $(el).replaceWith(`${text}\n\n`);
  });

  // br 태그 처리
  $('br').replaceWith('\n');

  // 최종 텍스트 추출 및 정리
  return $.text()
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function parseSubmissionResult(html: string): {
  status: string;
  memory?: string;
  time?: string;
} {
  const $ = cheerio.load(html);

  const statusCell = $('td.result');
  const status = statusCell.find('span.result-text').text().trim();
  const memory = statusCell.next().text().trim();
  const time = statusCell.next().next().text().trim();

  return { status, memory, time };
}
