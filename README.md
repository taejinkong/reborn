# Reborn

지금 지구에서 태어나는 아기 중 한 명으로 무작위로 태어나, 실제 통계 위에서 한 사람의 일생을 살아보는 인생 시뮬레이션 웹앱(PWA).

- 웹앱: https://taejinkong.github.io/reborn/ (엔진 데모: https://taejinkong.github.io/reborn/demo/)
- 기획 문서: [docs/](docs/README.md) · 로드맵: [docs/06-roadmap.md](docs/06-roadmap.md)
- 데이터 출처: [data/SOURCES.md](data/SOURCES.md)

## 개발

```bash
npm install
npm test            # 콘텐츠 빌드 + 엔진 테스트
npm run typecheck
npm run dev         # 웹앱 (http://localhost:3000)
npm run dev:demo    # 엔진 데모 (http://localhost:5173)
npm run calibrate   # 국가별 몬테카를로 보정 (약 8분, 콘텐츠·통계를 바꾼 뒤)
npm run audit       # 시뮬레이션 vs 실제 통계 비교표 → docs/model-audit.md
```

| 경로 | 내용 |
|---|---|
| `packages/engine` | 시뮬레이션 엔진 (순수 TypeScript, 시드 기반) |
| `content/` | 사건·갈림길·초점·직업·문장 (YAML DSL) |
| `data/build/` | 엔진 입력 통계 (`pipeline/`으로 생성) |
| `pipeline/` | UN WPP·World Bank 데이터 수집·가공 (Python) |
| `apps/web` | 웹앱 (Next.js, 정적 내보내기) |
| `apps/demo` | 엔진 데모 화면 |
