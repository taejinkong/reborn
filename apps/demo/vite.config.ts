import { defineConfig } from 'vite';

// GitHub Pages는 /reborn/ 경로에서 서비스된다
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  server: { fs: { allow: ['../..'] } },
});
