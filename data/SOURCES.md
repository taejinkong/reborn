# 데이터 출처

`data/build/` 의 모든 값은 아래 공개 원천에서 `pipeline/` 스크립트로 직접 생성했다. 값마다 `src`(출처)와 `y`(기준 연도)를 가진다.

| src | 원천 | 사용 필드 | 라이선스 | 출처 표기 |
|---|---|---|---|---|
| `wpp2024` | UN DESA, World Population Prospects 2024 (중위 추계) | births, population, tfr, meanAgeBirth, srb, lifeExp, imr, u5mr, lifetables | CC BY 3.0 IGO | United Nations, DESA, Population Division (2024). World Population Prospects 2024. |
| `wpp2024` (asfr) | UN WPP 2024 연령별 출산율 (5세 구간, 중위 추계) | asfr | CC BY 3.0 IGO | 위와 같음 |
| `wmd2019` | UN DESA, World Marriage Data 2019 | everMarried (45~49세 결혼 경험 비율), marriageAge (평균 초혼 연령 SMAM), divorced (45~49세 이혼·별거 상태 비율) | CC BY 3.0 IGO | United Nations, DESA, Population Division (2019). World Marriage Data 2019. |
| `wdi` (WHO GHE) | WHO Global Health Estimates 2019, WDI 재배포 | deathCommShare, deathNcdShare, deathInjShare (사망 원인 3대 분류 비중), ncd3070, suicide, diabetesPrev | CC BY 4.0 (WDI 지표별 라이선스) | World Bank, WDI; 원 출처 WHO |
| `wdi` (ILO) | ILO 모형 추정, WDI 재배포 | lfpF, lfpM (15~64세 경제활동참가율), unemployment | CC BY 4.0 | World Bank, WDI; 원 출처 ILO |
| `ims2024` | UN DESA, International Migrant Stock 2024 (출신국×목적지) | emigrantShare (출생자 중 해외 거주 비율), emigrants, destinations (목적지 상위 15곳 비율) | CC BY 3.0 IGO (파일 내 명시) | United Nations, DESA, Population Division (2024). International Migrant Stock 2024. |
| `unhcr2024` | UNHCR Refugee Data Finder (API, 2024) | refugeeShare (해외 거주자 중 난민·비호 신청자·국제 보호 필요 인구 비율) | CC BY 4.0 (UNHCR 공식 R 패키지·세계은행 재배포 표기 기준) — **출시 전 UNHCR 이용 약관 원문 확인 필요** | UNHCR Refugee Data Finder |
| `wdi` | World Bank, World Development Indicators | gdpPppPc, gini, urban, agriEmployment, primaryEnroll, secondaryEnroll, tertiaryEnroll, literacy, schoolYears, mmr, hivPrev, homicide, roadDeaths, smokingF/M, oopHealth, childMarriage | CC BY 4.0 | World Bank, World Development Indicators. |
| `est:group-median` | 같은 지역·소득그룹 → 소득그룹 → 지역 순서의 중앙값 | 결측 보완 | — | 화면에 "추정" 표기 |

WDI 지표 중 일부는 다른 기관(WHO, UNESCO UIS, ILO, UNAIDS, UNODC, UNICEF)이 원 출처다. 각 지표의 원 출처는 WDI 메타데이터에서 확인할 수 있다.

## 빌드 정보

- 출생·인구·기대수명 기준 연도: 2025 (WPP 추계)
- 생명표: 2023(최신 추정), 1950~2020 10년 간격(과거 모드용). 단일 연령 0~100세, 100세 이상은 q=1로 종결
- WDI: 2010년 이후 가장 최근 값만 사용
- 사망 원인 비중: 코로나19(2020~2021) 영향을 피하려고 2019년 값 사용
- 이혼·별거 비율은 "현재 상태"라 재혼한 사람이 빠진다 (실제 이혼 경험보다 낮음)
- 결혼 통계: 2000년 이후 가장 최근 조사값 (나라마다 기준 연도가 다름, `y` 참고). 사실혼 포함 여부는 나라마다 다름
- 대상: 인구 10만 명 이상 국가·지역 198곳 (Jersey는 지역 정보 부재로 제외)

## 보정표 (`calibration.json`)

`scripts/calibrate.ts`가 엔진·콘텐츠·통계로 국가마다 성별당 수천 명의 삶을 자동으로 살려 만든다. 원천 통계가 아니라 **엔진이 통계를 재현하도록 맞춘 계수**다.

| 계수 | 맞추는 대상 |
|---|---|
| `mort[성별][연령대]` | 개인 사망 배수의 평균 → 나누어서 생명표 사망률 유지 |
| `union[성별]` | 45~49세 결혼 경험 비율 (wmd2019) |
| `fert` | 합계출산율 (wpp2024) |
| `childUnion` | 18세 전 결혼한 여성 비율 (UNICEF, WDI) |
| `divorce` | 45~49세 여성 이혼·별거 비율 (wmd2019) |
| `lfp[성별]`, `find` | 경제활동참가율, 실업률 (ILO, WDI) |
| `smoke[성별]` | 15세 이상 흡연율 (WHO, WDI) |
| `diabetes` | 20~79세 당뇨 유병률 (WDI) |
| `cause` | 사망 원인 3대 분류 비중 (WHO GHE 2019, WDI) |
| `emig`, `flee` | 출생자 중 해외 거주 비율을 노동 이주분과 피란분으로 나눠서 (ims2024 × unhcr2024) |

콘텐츠(사건·갈림길·초점)나 통계를 바꾸면 `npm run calibrate`로 다시 만든다. `check` 항목에 국가별 검증 결과(보정에 쓰지 않은 시드)가 들어 있다. 자동 결정 모드의 선택 경향을 기준으로 맞추므로, 플레이어가 다르게 고르면 결과도 달라진다(의도된 동작).

## 이주 데이터 메모

- 해외 거주 비율 = 해외 거주 출생자 / (국내 거주 출생자 + 해외 거주 출생자). 국내 거주 출생자 = WPP 인구 − 국내 이민자 수
- UN 통계의 "이주자"는 출생국 기준이라, 해외에서 태어난 이주자 자녀는 들어가지 않는다 (시뮬레이션도 같은 기준)
- 팔레스타인 난민 대부분은 UNHCR이 아닌 UNRWA 소관이라 피란민 비율에 빠져 있다
- 목적지는 실제 이주자 분포(노동 이주·피란 공통)에서 뽑는다

## 알려진 특이값

2023 생명표에 일시적 위기가 반영된 국가: 팔레스타인(가자 전쟁), 리비아(데르나 홍수), 우크라이나(전쟁). 실제 통계이므로 그대로 쓴다.

## 추정으로 정한 모양 (국가별 데이터 없음)

수준은 위 보정으로 국가 통계에 맞추지만, 아래 **연령·기간 모양**은 국가별 공개 데이터가 없어 일반적인 패턴으로 추정했다.

| 모양 | 위치 |
|---|---|
| 사망 원인 3대 분류의 연령대별 상대 비중, 분류 안 세부 원인의 연령 패턴, 손상 원인의 남녀 비 | `packages/engine/src/mortality.ts` |
| 결혼 위험률(평균 초혼 연령 중심 정규분포, 표준편차 5년), 조혼의 12~17세 분포, 재혼 확률(연 5% 기준) | `packages/engine/src/calibration.ts` |
| 결혼 기간별 이혼 위험 모양, 경제활동 상태 전환율(연 15%), 구직 성공 기준 확률 | `packages/engine/src/calibration.ts` |
| 노동 이주 나이 모양(27세 중심, 18~50세), 피란 위험(나이 무관), 귀국 고민 확률(노동 이주 연 5%, 피란 연 3%) | `packages/engine/src/calibration.ts` |
| 첫 세대 이주자의 소득 순위 불이익(직업 범위 안 위치 −0.15), 피란 시 재산·건강·행복 감소 | `packages/engine/src/life.ts` |

## 아직 포함하지 않은 데이터

| 데이터 | 계획 | 비고 |
|---|---|---|
| 사망 원인 세부 연령 분포 | 국가·연령별 원인 데이터 | WHO GHE 원본 파일은 이용 조건 확인 필요, IHME GBD는 상업 이용 별도 허가 필요. 지금은 WDI(CC BY 4.0)의 3대 분류 비중 + 추정 연령 패턴 |
| 삶의 만족도 | World Happiness Report | 이용 조건 확인 필요 |
| 분쟁 | UCDP (CC BY 4.0) | v1 |
| 미래 생명표 | WPP 2024–2100 | 미래 모드(v1) |
