# 05. 데이터 파이프라인

## 1. 목표

공개 원천 통계를 **직접** 내려받아 정제하고, 엔진이 쓰는 `data/build/*.json` 을 재현 가능하게 생성한다. 모든 값은 출처·기준 연도를 함께 가진다.

```
pipeline/
  fetch/      # 원천별 다운로드 스크립트 (원본은 data/raw/에 캐시, 저장소에는 넣지 않음)
  transform/  # 정제·결측 보정·단위 통일
  build/      # countries.json, lifetables/, causes.json 생성
  checks/     # 범위 검사, 전년 대비 급변 검사, 국가 수 검사
data/
  raw/        # (gitignore)
  build/      # 엔진 입력 (커밋)
  SOURCES.md  # 출처·라이선스·버전 표
```

출력 레코드 형식:

```json
{ "id": "KOR", "lifeExp": { "F": { "v": 86.4, "y": 2023, "src": "wpp2024" } } }
```

## 2. 필드와 원천 (1차 목록)

| 필드 | 설명 | 원천 후보 |
|---|---|---|
| births, population | 연간 출생아 수, 인구 | UN World Population Prospects 2024 |
| lifeTable[sex][age] | 단일 연령 사망확률 q(x) | UN WPP 2024 (과거·전망 포함) |
| u5mr, imr | 5세 미만·영아 사망률 | UN IGME |
| srb | 출생 성비 | UN WPP |
| tfr, meanAgeBirth | 합계출산율, 평균 출산 연령 | UN WPP |
| gdpPppPc | 1인당 GDP(PPP) | World Bank WDI |
| gini | 지니계수 | World Bank WDI (결측: 지역 평균) |
| urban | 도시화율 | World Bank WDI / UN WUP |
| agriEmployment | 농업 고용 비중 | ILO (WDI 경유) |
| schoolYears, tertiaryEnrollment, literacy | 교육 지표 | UNESCO UIS, UNDP HDR |
| mmr | 모성사망비 | WHO/UN MMEIG |
| hivPrev | HIV 유병률 | UNAIDS |
| homicide | 살인율 | UNODC |
| roadDeaths | 교통사고 사망률 | WHO |
| smoking[sex] | 흡연율 | WHO |
| oopHealth | 의료비 본인부담 비율 | WHO GHED / WDI |
| childMarriage | 조혼율 | UNICEF |
| lifeSatisfaction | 삶의 만족도 | World Happiness Report |
| conflict | 분쟁 위험 | UCDP |
| causesOfDeath[region][ageGroup][sex] | 사망 원인 분포 | WHO Global Health Estimates 또는 IHME GBD (라이선스 확인) |
| history (과거 모드) | 연도별 위 지표 | UN WPP, Maddison Project, UCDP |

## 3. 라이선스 체크 (상용 출시 전 필수)

| 원천 | 알려진 조건 | 조치 |
|---|---|---|
| World Bank WDI | CC BY 4.0 | 출처 표기 |
| UN WPP / UN 데이터 | CC BY 3.0 IGO | 출처 표기 |
| Our World in Data | 자체 차트·가공은 CC BY, **원 데이터는 원천 라이선스 따름** | 원천 단위로 확인 |
| IHME GBD | **비상업 이용 조건** — 상업 이용은 별도 허가 필요 | 사용 전 확인. 대안: WHO GHE |
| WHO 데이터 | 데이터셋별 조건 상이 | 사용 데이터셋마다 확인 |
| World Happiness Report | 확인 필요 | 확인 |
| Maddison Project | CC BY 4.0 | 출처 표기 |
| UCDP | CC BY 4.0 | 출처 표기 |

> 이 표는 확정이 아닌 점검 목록이다. 출시 전 각 원천의 최신 이용 약관을 직접 확인하고 `data/SOURCES.md` 에 근거 링크를 기록한다.

## 4. 결측 처리 규칙

1. 같은 국가의 가장 가까운 연도 값 (최대 ±10년)
2. 같은 지역·소득 그룹의 인구 가중 중앙값
3. 보정한 값은 `"est": true` 로 표시하고 화면에서 "추정" 표기

## 5. 대상 국가

- 인구 약 10만 명 이상 국가·지역 (약 170~190개, 데이터 가용성으로 확정)
- 지역 분류: World Bank 지역(7개) + 고소득 그룹
- ISO 3166-1 alpha-3 코드 사용
