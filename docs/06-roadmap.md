# 06. 로드맵

| 단계 | 내용 | 산출물 | 상태 |
|---|---|---|---|
| 1 | 기획서 + 콘텐츠 DSL 스키마 | `docs/` 전체 | **완료** |
| 2 | 데이터 파이프라인 | `pipeline/`, `data/build/`, `data/SOURCES.md` | **완료 (v0)** |
| 3 | 엔진 v0 (출생 → 연간 진행 → 사망) + 통계 검증 테스트 | `packages/engine` | 대기 |
| 4 | MVP UI (첫 화면 → 출생 → 인생 → 사망 기록), 한국어 | `apps/web` | 대기 |
| 5 | 콘텐츠 확장 + AI 보조 생성 파이프라인 | `content/`, `tools/contentgen` | 대기 |
| 6 | AI 서사 (연간·이정표·자서전) | 서버 라우트, 프롬프트, 안전 필터 | 대기 |
| 7 | 비주얼·연출 (장면 일러스트, 지도, 사운드) | 아트 파이프라인 | 대기 |
| 8 | 서버: 계정·저장·공유·추모관, 수익 모델 | 백엔드 | 대기 |
| 9 | 출시 준비: 다국어, SEO, 분석, 약관·개인정보 | | 대기 |

## 1단계 체크리스트

- [x] 레퍼런스 서비스 분석
- [x] 제품 원칙·클린룸 규칙 ([00](00-principles.md))
- [x] 기획서 초안 ([01](01-product-spec.md))
- [x] 시뮬레이션 모델 초안 ([02](02-simulation-model.md))
- [x] 콘텐츠 DSL 초안 ([03](03-event-dsl.md))
- [x] AI 서사 구조 초안 ([04](04-ai-narrative.md))
- [x] 데이터 파이프라인·라이선스 점검표 ([05](05-data-pipeline.md))
- [x] 미결정 사항 확정: 서비스명 Reborn, 생성형 이미지, 2인칭 서사
- [ ] DSL 스키마를 코드(zod)로 옮기고 예시 이벤트 10개로 검증 → 3단계와 함께 진행

## 저장소 구조 (예정)

```
reborn/
  apps/web/            # Next.js PWA
  packages/engine/     # 시뮬레이션 엔진 (순수 TS)
  packages/content/    # DSL 스키마·컴파일러·린터
  content/             # YAML 콘텐츠
  pipeline/            # 데이터 수집·가공 (Python)
  data/build/          # 엔진 입력 JSON
  docs/                # 기획 문서
```
