# 데이터 출처

`data/build/` 의 모든 값은 아래 공개 원천에서 `pipeline/` 스크립트로 직접 생성했다. 값마다 `src`(출처)와 `y`(기준 연도)를 가진다.

| src | 원천 | 사용 필드 | 라이선스 | 출처 표기 |
|---|---|---|---|---|
| `wpp2024` | UN DESA, World Population Prospects 2024 (중위 추계) | births, population, tfr, meanAgeBirth, srb, lifeExp, imr, u5mr, lifetables | CC BY 3.0 IGO | United Nations, DESA, Population Division (2024). World Population Prospects 2024. |
| `wdi` | World Bank, World Development Indicators | gdpPppPc, gini, urban, agriEmployment, primaryEnroll, secondaryEnroll, tertiaryEnroll, literacy, schoolYears, mmr, hivPrev, homicide, roadDeaths, smokingF/M, oopHealth, childMarriage | CC BY 4.0 | World Bank, World Development Indicators. |
| `est:region-median` | 위 값의 같은 지역·소득그룹 중앙값 | 결측 보완 | — | 화면에 "추정" 표기 |

WDI 지표 중 일부는 다른 기관(WHO, UNESCO UIS, ILO, UNAIDS, UNODC, UNICEF)이 원 출처다. 각 지표의 원 출처는 WDI 메타데이터에서 확인할 수 있다.

## 빌드 정보

- 출생·인구·기대수명 기준 연도: 2025 (WPP 추계)
- 생명표: 2023(최신 추정), 1950~2020 10년 간격(과거 모드용). 단일 연령 0~100세, 100세 이상은 q=1로 종결
- WDI: 2010년 이후 가장 최근 값만 사용
- 대상: 인구 10만 명 이상 국가·지역 198곳 (Jersey는 지역 정보 부재로 제외)

## 알려진 특이값

2023 생명표에 일시적 위기가 반영된 국가: 팔레스타인(가자 전쟁), 리비아(데르나 홍수), 우크라이나(전쟁). 실제 통계이므로 그대로 쓴다.

## 아직 포함하지 않은 데이터

| 데이터 | 계획 | 비고 |
|---|---|---|
| 사망 원인 분포 | WHO Global Health Estimates 검토 | IHME GBD는 상업 이용 별도 허가 필요. 확정 전까지 엔진은 연령대별 임시 분포 사용 |
| 삶의 만족도 | World Happiness Report | 이용 조건 확인 필요 |
| 분쟁 | UCDP (CC BY 4.0) | v1 |
| 미래 생명표 | WPP 2024–2100 | 미래 모드(v1) |
