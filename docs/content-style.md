# 콘텐츠 작성 가이드

사람이 쓰든 AI(`scripts/contentgen.ts`)가 쓰든 모든 사건·갈림길·직업·문장은 이 기준을 따른다. 형식은 [03-event-dsl.md](03-event-dsl.md), 쓸 수 있는 이름은 아래 "표현식에서 쓸 수 있는 값"을 본다.

## 1. 문장

- **2인칭 시점.** "당신은 …했습니다." 주어가 당신이 아닌 문장도 당신의 삶 안에서 쓴다 ("어머니가 …했습니다").
- **담담하고 구체적으로.** 과장, 감탄, 교훈을 넣지 않는다. 한두 문장.
- **결과만 쓴다.** 무엇이 일어났는지를 쓰고, 플레이어의 감정을 대신 정하지 않는다 ("슬펐습니다" 대신 상황을 쓴다).
- **조사는 변수에 붙인다.** `{job|으로/로}`처럼 쓰고, `{job}{job|으로/로}`처럼 겹쳐 쓰지 않는다.
- **고정관념 금지.** 나라·민족·종교·성별을 하나의 모습으로 그리지 않는다. 지역별 사건은 통계(조건식)로 거르고, 문장 자체는 특정 문화를 희화화하지 않는다.
- **실존 인물·기업·상표 금지.**
- **레퍼런스 서비스의 문장을 참고하거나 흉내 내지 않는다** (클린룸 원칙, [00-principles.md](00-principles.md)).

## 2. 무거운 주제

- 죽음, 폭력, 학대, 자살, 약물은 `tone: heavy` 또는 `tone: sensitive`로 표시한다.
- 장면·방법·신체 묘사를 하지 않는다. 일어난 일과 그 결과만 짧게 쓴다.
- `sensitive` 사건은 `source`(근거 통계)가 반드시 있어야 하고, 도움을 청할 수 있다는 문장을 함께 남긴다.
- 아이가 스스로 고르지 않는 일(조혼, 아동 노동, 피란)은 갈림길이 아닌 사건으로 만든다.

## 3. 통계와의 관계

- 확률은 통계에서 출발한다. 근거가 있는 값은 `country.*` 필드를 쓰고, 오즈 보정(`odds`)으로 개인 차이를 준다.
- **사건은 직접 죽이지 않는다.** 건강을 깎거나 `causeHint`로 사망 원인 가중치만 바꾼다.
- 결혼·출산·취업·흡연·이주처럼 보정된 영역은 이미 있는 확률(`rates.*`)과 내장 절차(`call`)를 쓴다. 새 경로를 만들면 보정이 흔들리므로, 만들었다면 `npm run calibrate`로 다시 보정한다.
- 근거 통계가 없는 확률은 작게(연 1~5%) 두고, 콘텐츠 리포트(`npm run content:report`)로 한 삶에 몇 번 일어나는지 확인한다.

## 4. 분량 기준 (한 삶 기준, 자동 결정 모드)

| 항목 | 목표 |
|---|---|
| 기록 문장 | 40~90줄 |
| 갈림길 | 8~25번 |
| 한 사건이 한 삶에 일어나는 비율 | 반복 사건 제외 60% 이하 |
| 한 번도 안 일어나는 사건 | 0개 (리포트 경고) |

## 5. 표현식에서 쓸 수 있는 값

| 이름 | 뜻 |
|---|---|
| `age`, `sex`('F'/'M'), `year` | 나이, 성별, 연도 |
| `stats.health/happiness/knowledge/relations` | 상태값 0~100 |
| `money.cash/debt/income/pct` | 현금, 빚, 연 소득(PPP 달러), 소득 백분위 0~1 |
| `money.deposit/stocks/home/property/netWorth/saveRateNow` | 예금, 주식, 내 집, 임대 부동산, 순자산, 지금 저축률 |
| `owned('물건')`, `prices.home/property` | 물건을 가졌는지, 이 나라·지역의 집값 |
| `edu.level/rank/inSchool/stage` | 학력('none'…'graduate'), 학력 순위 0~4, 재학 여부, 학교 단계 |
| `job`, `jobSector` | 직업 id, 직업 분야('agri'/'industry'/'service'/'public') |
| `family.partner/married/children/motherAlive/fatherAlive/siblings` | 가족 |
| `flags.*` | 사건이 남긴 표시 |
| `country.*` | 사는 나라 통계 (`region`, `income`, `urban`, `gdpPppPc`, `u5mr`, `lifeExp`, `tfr`, `smoking`, `oopHealth`, `agriEmployment`, `homicide`, `roadDeaths` 등) |
| `household`, `urban`, `habits.smoker`, `focus`, `retired`, `migrant` | 출생 형편(1~5), 도시 거주, 흡연, 올해 초점, 은퇴, 해외 거주 |
| `rates.union/childUnion/divorce/smoke/quitSmoke/diabetes/emigrate/flee/returnHome` | 보정된 올해 확률 |
| `has(조건)`, `did(사건 id)`, `clamp`, `min`, `max`, `pct(x)`, `rand()` | 함수 |

내장 절차(`call`): `job.seek`, `job.quit`, `school.tertiary`, `school.graduate`, `school.leave`, `retire`, `move.city`, `migrate.work`, `migrate.flee`, `migrate.return`.
