# 03. 콘텐츠 DSL — 이벤트 · 갈림길 · 직업

콘텐츠(사건, 결정, 직업, 질병, 아이템)는 코드가 아니라 **YAML 파일**로 작성한다. 빌드 시 스키마(zod) 검증 → 표현식 컴파일 → 정적 분석(도달 가능성, 확률 범위) → 엔진용 JSON 번들로 변환한다.

```
content/
  events/        # 무작위 사건 (happening)
  decisions/     # 갈림길 (decision)
  milestones/    # 이정표 장면·성찰 질문
  jobs/          # 직업 정의
  conditions/    # 질병·건강 상태
  items/         # 구매 가능한 물건
  i18n/ko/       # 텍스트 (키 → 문장)
```

## 1. 공통 개념

### 1.1 표현식 (Expression)

조건과 수치는 **제한된 안전 표현식 언어**로 쓴다. 임의 코드 실행은 불가능하다.

| 문법 | 예 |
|---|---|
| 상태 경로 | `age`, `stats.knowledge`, `money.cash`, `edu.level`, `flags.married`, `country.lifeExp`, `country.region` |
| 비교·논리 | `age >= 18 && !flags.married`, `country.region in ['ssa', 'sa']` |
| 산술 | `money.income * 0.3` |
| 함수 | `pct(stat)`, `stat(id, year?)`, `has(conditionId)`, `rand()` (엔진 PRNG), `clamp(x, lo, hi)`, `cost(id)` |

### 1.2 확률 (Probability)

확률은 "기준값 + 오즈 보정"으로 쓴다. 기준값은 가능하면 통계 필드를 가리킨다.

```yaml
chance:
  base: stat(uniEnrollment)          # 국가 통계 (0~1)
  odds:                              # 오즈비 곱
    - by: household                  # 연속값: exp(beta * (x - center))
      beta: 0.45
      center: 3
    - by: stats.knowledge
      beta: 0.04
      center: 50
    - if: flags.scholarship          # 조건부 고정 오즈비
      x: 2.0
  normalize: true                    # 인구 평균이 base가 되도록 빌드 시 정규화
```

### 1.3 효과 (Effect)

| 효과 | 예 |
|---|---|
| 상태값 증감 | `stats: { happiness: +5, health: -2 }` |
| 돈 | `money: { cash: -cost(uniTuition), debt: +loan }` |
| 플래그 | `set: { inUni: true }`, `unset: [dating]` |
| 학력·직업·거주 | `edu: university`, `job: nurse`, `move: { country: dest, urban: true }` |
| 가족 | `family: { addPartner: {...} }`, `family: { addChild: {} }` |
| 질병 | `condition: { add: diabetes }` |
| 예약 | `schedule: { event: edu.uni_graduate, in: 4 }` |
| 기록 | `log: event.uni_admit.log` (i18n 키) |
| 서사 태그 | `tags: [growth, family_pride]` — AI 서사가 분위기를 잡는 데 사용 |

## 2. 이벤트 (Happening)

플레이어 선택 없이 일어나는 사건.

```yaml
id: health.child_measles
kind: happening
category: health
when:
  age: [1, 6]
  once: true
  if: "!flags.vaccinated_measles"
chance:
  base: stat(measlesRisk)
  odds:
    - by: household
      beta: -0.3
      center: 3
outcomes:
  - weight: 0.97
    effects:
      stats: { health: -8 }
      log: event.child_measles.recover
      tags: [illness, recovery]
  - weight: "0.03 * country.childMortalityK"
    effects:
      die: measles
tone: heavy          # light | neutral | heavy | sensitive — '무서운 장면 빼기'·교육 모드 필터
source: [who.measles, unigme.u5mr]
```

## 3. 갈림길 (Decision)

시간을 멈추고 선택지를 제시한다.

```yaml
id: edu.after_highschool
kind: decision
category: education
when:
  age: [17, 20]
  once: true
  if: "edu.level == 'high' && !flags.inUni"
title: decision.after_highschool.title
body: decision.after_highschool.body
options:
  - id: university
    label: decision.after_highschool.uni
    available: "country.uniSeats > 0"
    hint: "cost(uniTuition) per year"
    resolve:
      chance:
        base: stat(uniEnrollment)
        odds:
          - { by: stats.knowledge, beta: 0.05, center: 50 }
          - { by: household, beta: 0.4, center: 3 }
      success:
        edu: university
        set: { inUni: true }
        schedule: { event: edu.uni_graduate, in: 4 }
        tags: [new_start]
      fail:
        stats: { happiness: -6 }
        log: decision.after_highschool.uni_fail
        next: edu.after_highschool_retry      # 연쇄 갈림길
  - id: work
    label: decision.after_highschool.work
    resolve:
      effects:
        call: job.seek                         # 공용 절차 호출
  - id: abroad
    label: decision.after_highschool.abroad
    available: "money.cash >= cost(studyAbroad) || flags.scholarship"
    resolve:
      effects:
        move: { country: pickStudyDest(), temporary: 4 }
auto:                                          # 자동 결정 모드의 선택 가중치
  university: "pct(stats.knowledge) + household * 10"
  work: "100 - pct(stats.knowledge)"
  abroad: 5
source: [uis.tertiary_enrollment]
```

## 4. 직업 (Job)

```yaml
id: nurse
name: job.nurse.name
sector: health
requires:
  edu: college                 # 최소 학력
  major: [nursing]             # 선택: 전공
  license: true                # 자격 시험 이벤트 필요
availability:
  base: "stat(healthWorkersPer1k) / 10"
  urbanK: 1.4
pay:
  pct: [0.45, 0.75]            # 국가 소득분포에서의 백분위 범위
  growth: 0.012                # 연차별 상승
risks:
  inj: 1.2                     # 사망 원인 가중치 배수
  burnout: 1.5
focus:
  work: { happiness: -1, health: -2 }
events: [job.nurse.night_shift, job.nurse.pandemic_frontline, job.nurse.headhunt_abroad]
emigration:
  demand: [USA, GBR, DEU, AUS, CAN, SAU]
tags: [care, shift_work]
```

직업은 고유 이벤트(`events`)를 가질 수 있어, 직업 수가 늘수록 인생 갈래가 함께 늘어난다.

## 5. 이정표 (Milestone)

```yaml
id: milestone.age15
kind: milestone
when: { age: 15 }
scene: teen_crossroads           # 장면 일러스트 키
question: milestone.age15.q      # 성찰 질문 (플레이어가 한 줄 남김)
ai:
  narrate: reflection            # AI 프롬프트 템플릿 종류
```

## 6. 텍스트(i18n)

- 모든 문장은 `content/i18n/{lang}/*.yaml` 의 키로 관리한다.
- 문장 안의 변수는 `{name}`, `{city}`, `{money}` 형식. 한국어 조사 처리 함수(`{name|이/가}`) 지원.
- 템플릿 문장은 **AI 서사가 실패하거나 꺼져 있을 때의 기본값**이자, AI에게 주는 사실 요약의 재료다.

## 7. 빌드 검증 (린트)

| 검사 | 내용 |
|---|---|
| 스키마 | zod 스키마 위반, 존재하지 않는 키 참조 |
| 표현식 | 파싱 오류, 알 수 없는 상태 경로/함수 |
| 도달성 | `when` 조건을 만족하는 상태가 시뮬레이션 1만 회 중 한 번도 나오지 않으면 경고 |
| 확률 | 정규화 후 확률이 [0, 1] 밖이거나 원천 통계와 ±20% 이상 벗어나면 경고 |
| 텍스트 | 사용 언어별 i18n 키 누락 |
| 안전 | `tone: sensitive` 사건은 안내처(`help`) 지정 필수 |

## 8. 미결정 사항

- [ ] 표현식 파서: 자체 구현(작은 Pratt 파서) vs `jsep` + 화이트리스트 평가기 → **자체 구현 권장**(의존성·보안 통제)
- [ ] YAML 대신 TypeScript 객체로 작성할지 (타입 자동완성 장점) → AI 생성·비개발자 편집을 위해 **YAML 권장**
