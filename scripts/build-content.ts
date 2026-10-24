// content/**/*.yaml → content/build/content.json (스키마 검증 + 린트)
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parse } from 'yaml';
import { ContentBundle, lintContent } from '../packages/engine/src/content.ts';

const ROOT = join(import.meta.dirname, '..');
const DIR = join(ROOT, 'content');

function yamlFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    // build: 빌드 결과, drafts: 검수 전 초안, briefs: 생성 요청서
    if (statSync(p).isDirectory()) return ['build', 'drafts', 'briefs'].includes(n) ? [] : yamlFiles(p);
    return n.endsWith('.yaml') ? [p] : [];
  });
}

const raw = { events: [] as unknown[], focus: [] as unknown[], jobs: [] as unknown[], i18n: {} as Record<string, Record<string, string>> };
for (const f of yamlFiles(DIR)) {
  const rel = relative(DIR, f);
  const doc = parse(readFileSync(f, 'utf8'));
  if (rel.startsWith('i18n/')) {
    // i18n/ko.yaml 또는 i18n/ko/<이름>.yaml
    const lang = rel.slice(5).split('/')[0].replace(/\.yaml$/, '');
    const dict = (raw.i18n[lang] ??= {});
    for (const [k, v] of Object.entries(doc as Record<string, string>)) {
      if (k in dict) throw new Error(`문장 키 중복: ${k} (${rel})`);
      dict[k] = v;
    }
  } else if (rel === 'focus.yaml') raw.focus.push(...doc);
  else if (rel === 'jobs.yaml' || rel.startsWith('jobs/')) raw.jobs.push(...doc);
  else if (rel.startsWith('events/') || rel.startsWith('decisions/')) raw.events.push(...doc);
  else throw new Error(`어디에 속하는지 모르는 콘텐츠 파일: ${rel}`);
}

const parsed = ContentBundle.safeParse(raw);
if (!parsed.success) {
  for (const i of parsed.error.issues) console.error(`스키마 오류 ${i.path.join('.')}: ${i.message}`);
  process.exit(1);
}
const errs = lintContent(parsed.data);
if (errs.length) {
  errs.forEach((e) => console.error(`린트: ${e}`));
  process.exit(1);
}
mkdirSync(join(DIR, 'build'), { recursive: true });
writeFileSync(join(DIR, 'build', 'content.json'), JSON.stringify(parsed.data));
console.log(`content.json: 사건·갈림길 ${parsed.data.events.length}개, 초점 ${parsed.data.focus.length}개, 직업 ${parsed.data.jobs.length}개`);
