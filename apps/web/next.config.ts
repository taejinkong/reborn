import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { NextConfig } from 'next';

// 데이터가 바뀌면 주소가 바뀌도록 public/data 파일들의 해시를 버전으로 쓴다 (브라우저·서비스 워커 캐시 무효화)
function dataVersion(): string {
  const dir = join(import.meta.dirname, 'public/data');
  if (!existsSync(dir)) return 'dev';
  const h = createHash('sha256');
  for (const f of readdirSync(dir).sort()) h.update(readFileSync(join(dir, f)));
  return h.digest('hex').slice(0, 12);
}

// GitHub Pages(/reborn/)에 정적 파일로 배포한다 (PAGES_BASE=/reborn). 로컬 개발에서는 루트에서 연다.
const basePath = process.env.PAGES_BASE ?? '';

const config: NextConfig = {
  output: 'export',
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_BASE_PATH: basePath, NEXT_PUBLIC_DATA_VERSION: dataVersion() },
  // 엔진은 TypeScript 소스(.ts 확장자 import) 그대로 쓰는 워크스페이스 패키지다
  transpilePackages: ['@reborn/engine'],
};

export default config;
