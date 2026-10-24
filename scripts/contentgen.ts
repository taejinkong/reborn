// AI 보조 콘텐츠 생성: 브리프 → Claude가 DSL 초안(YAML) 작성 → 스키마·린트 검사(실패하면 오류를 돌려주고 한 번 더) → content/drafts/에 저장.
// 사람이 초안을 검수한 뒤 `merge`로 content/에 옮긴다.
//
//   node scripts/contentgen.ts gen content/briefs/<이름>.yaml   # 초안 만들기 (Claude API 인증 필요)
//   node scripts/contentgen.ts merge content/drafts/<이름>.yaml  # 검수한 초안을 content/로 옮기기
//
// 인증: ANTHROPIC_API_KEY 또는 `ant auth login` 프로필.
import Anthropic from '@anthropic-ai/sdk';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parse, stringify } from 'yaml';
import { ContentBundle, lintContent, type Content } from '../packages/engine/src/content.ts';

const ROOT = join(import.meta.dirname, '..');
const MODEL = 'claude-opus-5-5';
const MAX_ATTEMPTS = 2;

interface Brief {
  name: string;
  /** 무엇을 만들지 (예: "남아시아 도시 청년의 직업 10종과 직업별 사건 2개씩") */
  goal: string;
  /** 만들 개수 목표 */
  count?: number;
  /** 추가 지시 */
  notes?: string[];
}

/** 초안 파일 형식: 사건·갈림길·직업과 그 문장 */
interface Draft {
  events?: unknown[];
  jobs?: unknown[];
  i18n?: Record<string, string>;
}

function loadContent(): Content {
  return ContentBundle.parse(JSON.parse(readFileSync(join(ROOT, 'content/build/content.json'), 'utf8')));
}

/** 바뀌지 않는 긴 지시문: 작성 가이드 + DSL 문서 + 기존 예시. 캐시해서 반복 호출 비용을 줄인다. */
function systemPrompt(content: Content): string {
  const style = readFileSync(join(ROOT, 'docs/content-style.md'), 'utf8');
  const dsl = readFileSync(join(ROOT, 'docs/03-event-dsl.md'), 'utf8');
  const examples = readFileSync(join(ROOT, 'content/decisions/life.yaml'), 'utf8').slice(0, 6000);
  const ids = content.events.map((e) => e.id).sort().join(', ');
  const jobs = content.jobs.map((j) => j.id).sort().join(', ');
  return [
    '당신은 인생 시뮬레이션 게임 Reborn의 콘텐츠 작가입니다. 실제 통계 위에서 한 사람의 일생을 사는 게임이며, 문장은 한국어 2인칭입니다.',
    '요청받은 콘텐츠를 아래 DSL 형식의 YAML 하나로 작성합니다. 출력은 ```yaml 코드 블록 하나뿐이고, 최상위 키는 events, jobs, i18n 입니다.',
    'i18n에는 새로 쓴 모든 문장 키와 한국어 문장을 넣습니다. 기존 id와 겹치지 않게 새 id를 만듭니다.',
    '\n# 작성 가이드\n', style,
    '\n# DSL 문서\n', dsl,
    '\n# 기존 갈림길 예시 (형식 참고용, 문장을 베끼지 말 것)\n```yaml\n', examples, '\n```',
    `\n# 이미 있는 사건·갈림길 id\n${ids}`,
    `\n# 이미 있는 직업 id\n${jobs}`,
  ].join('\n');
}

function extractYaml(text: string): Draft {
  const m = /```ya?ml\s*\n([\s\S]*?)```/.exec(text);
  const doc = parse(m ? m[1] : text) as Draft;
  if (!doc || typeof doc !== 'object') throw new Error('YAML 최상위가 객체가 아님');
  return doc;
}

/** 초안을 기존 콘텐츠와 합쳐 스키마·린트 검사. 문제 목록을 돌려준다. */
function check(content: Content, draft: Draft): string[] {
  const merged = {
    events: [...content.events, ...(draft.events ?? [])],
    focus: content.focus,
    jobs: [...content.jobs, ...(draft.jobs ?? [])],
    i18n: { ...content.i18n, ko: { ...content.i18n.ko, ...(draft.i18n ?? {}) } },
  };
  const parsed = ContentBundle.safeParse(merged);
  if (!parsed.success) return parsed.error.issues.map((i) => `스키마 ${i.path.join('.')}: ${i.message}`);
  return lintContent(parsed.data);
}

async function generate(briefPath: string): Promise<void> {
  const brief = parse(readFileSync(briefPath, 'utf8')) as Brief;
  const content = loadContent();
  const client = new Anthropic();
  const system: Anthropic.Beta.BetaTextBlockParam[] = [{ type: 'text', text: systemPrompt(content), cache_control: { type: 'ephemeral' } }];
  const messages: Anthropic.Beta.BetaMessageParam[] = [{
    role: 'user',
    content: [`# 브리프: ${brief.name}`, brief.goal, brief.count ? `목표 개수: ${brief.count}` : '', ...(brief.notes ?? []).map((n) => `- ${n}`)].join('\n'),
  }];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 64000,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'high' },
      // 정책상 거절되면 서버가 알맞은 모델로 다시 시도한다
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system,
      messages,
    });
    const res = await stream.finalMessage();
    if (res.stop_reason === 'refusal') throw new Error(`거절됨: ${res.stop_details?.explanation ?? ''}`);
    if (res.stop_reason === 'max_tokens') throw new Error('출력이 너무 길어 잘렸습니다. 브리프를 나눠 주세요.');
    const text = res.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text').map((b) => b.text).join('\n');
    console.log(`  시도 ${attempt}: 입력 ${res.usage.input_tokens} (캐시 읽기 ${res.usage.cache_read_input_tokens ?? 0}), 출력 ${res.usage.output_tokens} 토큰`);

    let draft: Draft;
    let problems: string[];
    try {
      draft = extractYaml(text);
      problems = check(content, draft);
    } catch (e) {
      draft = {};
      problems = [`YAML을 읽을 수 없음: ${(e as Error).message}`];
    }
    if (!problems.length) {
      const out = join(ROOT, 'content/drafts', `${brief.name}.yaml`);
      mkdirSync(join(ROOT, 'content/drafts'), { recursive: true });
      writeFileSync(out, `# 초안 (${MODEL}, ${new Date().toISOString().slice(0, 10)}) — 검수 후 merge\n${stringify(draft, { lineWidth: 0 })}`);
      console.log(`초안 저장: ${out} (사건·갈림길 ${draft.events?.length ?? 0}, 직업 ${draft.jobs?.length ?? 0}, 문장 ${Object.keys(draft.i18n ?? {}).length})`);
      return;
    }
    console.log(`  검사 실패 ${problems.length}건${attempt < MAX_ATTEMPTS ? ', 고쳐 달라고 다시 요청합니다' : ''}`);
    problems.slice(0, 20).forEach((p) => console.log(`    - ${p}`));
    messages.push({ role: 'assistant', content: res.content });
    messages.push({ role: 'user', content: `검사에서 아래 문제가 나왔습니다. 고친 전체 YAML을 다시 주세요.\n${problems.slice(0, 50).join('\n')}` });
  }
  process.exitCode = 1;
}

/** 검수한 초안을 content/ 아래 파일로 옮긴다 */
function merge(draftPath: string): void {
  const draft = parse(readFileSync(draftPath, 'utf8')) as Draft;
  const content = loadContent();
  const problems = check(content, draft);
  if (problems.length) {
    problems.forEach((p) => console.error(`- ${p}`));
    process.exit(1);
  }
  const name = basename(draftPath, '.yaml');
  const decisions = (draft.events ?? []).filter((e) => (e as { kind: string }).kind === 'decision');
  const happenings = (draft.events ?? []).filter((e) => (e as { kind: string }).kind !== 'decision');
  const write = (rel: string, data: unknown[]) => {
    if (!data.length) return;
    const p = join(ROOT, 'content', rel);
    if (existsSync(p)) throw new Error(`이미 있는 파일: ${rel}`);
    writeFileSync(p, stringify(data, { lineWidth: 0 }));
    console.log(`+ content/${rel} (${data.length})`);
  };
  write(`events/${name}.yaml`, happenings);
  write(`decisions/${name}.yaml`, decisions);
  write(`jobs/${name}.yaml`, draft.jobs ?? []);
  if (draft.i18n && Object.keys(draft.i18n).length) {
    const p = join(ROOT, 'content/i18n/ko', `${name}.yaml`);
    mkdirSync(join(ROOT, 'content/i18n/ko'), { recursive: true });
    writeFileSync(p, stringify(draft.i18n, { lineWidth: 0 }));
    console.log(`+ content/i18n/ko/${name}.yaml`);
  }
  console.log('다음: npm run build:content && npm run content:report && npm run calibrate');
}

const [cmd, path] = process.argv.slice(2);
if (cmd === 'gen' && path) await generate(path);
else if (cmd === 'merge' && path) merge(path);
else {
  console.error('사용법: node scripts/contentgen.ts gen <brief.yaml> | merge <draft.yaml>');
  process.exit(1);
}
