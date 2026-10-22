import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { World } from '../src/world.ts';

const ROOT = join(import.meta.dirname, '../../..');
const json = (p: string) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

let cached: World | null = null;
export function loadWorld(): World {
  return (cached ??= new World({
    countries: json('data/build/countries.json'),
    lifetable: json('data/build/lifetables/2023.json'),
    content: json('content/build/content.json'),
  }));
}
