// 끝난 삶을 전생 기록과 사망 기록 화면용으로 요약한다.
import { type LogEntry, type Person, type World } from '@reborn/engine';
import { entryText } from '@/components/Feed';
import type { LifeSummary } from './storage';

const HIGHLIGHT_TAGS = ['achievement', 'love', 'family', 'milestone', 'new_start', 'migration', 'loss', 'death'];

export function highlights(p: Person): LogEntry[] {
  return p.log.filter((e) => e.age === 0 || e.tone === 'heavy' || e.tone === 'sensitive' || e.tags?.some((t) => HIGHLIGHT_TAGS.includes(t)));
}

export function summarize(world: World, p: Person, soft: boolean): LifeSummary {
  const d = p.dead!;
  const lastJob = [...p.log].reverse().find((e) => e.key === 'sys.job.start');
  const livedIn = [p.born, ...p.log.filter((e) => e.key.startsWith('sys.migrate.') && typeof e.params?.country === 'string').map((e) => String(e.params!.country))];
  return {
    seed: p.seed,
    born: p.born,
    sex: p.sex,
    birthYear: p.birthYear,
    deathAge: d.age,
    deathYear: d.year,
    cause: d.cause,
    urban: p.urban,
    household: p.household,
    edu: p.edu.level,
    job: lastJob ? world.text(String(lastJob.params?.job ?? '')) : null,
    children: p.family.children.length,
    married: p.flags.everMarried === true,
    livedIn: [...new Set(livedIn)],
    epitaph: entryText(world, p.log.find((e) => e.key.startsWith('sys.death.')) ?? p.log[p.log.length - 1], soft),
    highlights: highlights(p).slice(0, 40).map((e) => ({ age: e.age, text: entryText(world, e, soft) })),
    endedAt: Date.now(),
  };
}
