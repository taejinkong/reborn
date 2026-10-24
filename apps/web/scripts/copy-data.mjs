// 엔진 입력 데이터를 public/data로 복사한다. 앱은 실행 중에 이 파일들을 내려받아 쓴다.
import { copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '../../..');
const out = join(import.meta.dirname, '../public/data');
mkdirSync(out, { recursive: true });
const files = {
  'countries.json': 'data/build/countries.json',
  'lifetable-2023.json': 'data/build/lifetables/2023.json',
  'calibration.json': 'data/build/calibration.json',
  'content.json': 'content/build/content.json',
};
for (const [name, src] of Object.entries(files)) copyFileSync(join(root, src), join(out, name));
console.log(`public/data: ${Object.keys(files).join(', ')}`);
