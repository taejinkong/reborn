import type { NextConfig } from 'next';

// GitHub Pages(/reborn/)에 정적 파일로 배포한다 (PAGES_BASE=/reborn). 로컬 개발에서는 루트에서 연다.
const basePath = process.env.PAGES_BASE ?? '';

const config: NextConfig = {
  output: 'export',
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  // 엔진은 TypeScript 소스(.ts 확장자 import) 그대로 쓰는 워크스페이스 패키지다
  transpilePackages: ['@reborn/engine'],
};

export default config;
