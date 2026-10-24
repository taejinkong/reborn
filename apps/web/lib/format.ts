// 화면 표기 도우미.
const regionNames = typeof Intl !== 'undefined' && 'DisplayNames' in Intl ? new Intl.DisplayNames(['ko'], { type: 'region' }) : null;

/** ISO2 코드로 한국어 나라 이름 */
export function koName(iso2: string, fallback: string): string {
  try {
    return regionNames?.of(iso2) ?? fallback;
  } catch {
    return fallback;
  }
}

export const num = (n: number, digits = 0) =>
  n.toLocaleString('ko-KR', { maximumFractionDigits: digits, minimumFractionDigits: digits });

export const pct = (x: number, digits = 1) => `${num(x * 100, digits)}%`;

/** 구매력 평가(PPP) 기준 달러 */
export const ppp = (usd: number) => `${num(Math.round(usd))}달러`;

export const SEX_LABEL = { F: '여성', M: '남성' } as const;
export const HOUSEHOLD_LABEL = ['', '아주 어려움', '어려움', '보통', '넉넉함', '아주 넉넉함'];
export const EDU_LABEL: Record<string, string> = { none: '학교에 다니지 못함', primary: '초등 졸업', secondary: '중등 졸업', tertiary: '대학 졸업', graduate: '대학원 졸업' };
export const SCHOOL_LABEL: Record<string, string> = { primary: '초등학교 재학 중', secondary: '중등학교 재학 중', tertiary: '대학 재학 중' };
export const STAT_LABEL = { health: '건강', happiness: '행복', knowledge: '지식', relations: '관계' } as const;
export const REGION_LABEL: Record<string, string> = {
  eap: '동아시아·태평양', eca: '유럽·중앙아시아', lac: '라틴아메리카·카리브', mena: '중동·북아프리카', na: '북아메리카', sa: '남아시아', ssa: '사하라 이남 아프리카',
};

/** 콘텐츠의 근거 통계 식별자 → 화면 표기 */
const SOURCE_LABEL: Record<string, string> = {
  'wmd2019.ever_married': 'UN 세계결혼통계 (결혼 경험 비율)',
  'wmd2019.smam': 'UN 세계결혼통계 (평균 초혼 연령)',
  'wmd2019.divorced': 'UN 세계결혼통계 (이혼·별거)',
  'uis.tertiary': 'UNESCO 고등교육 취학률',
  'unigme.u5mr': 'UN IGME 5세 미만 사망률',
  'who.tobacco': 'WHO 흡연율',
  'unicef.child_marriage': 'UNICEF 조혼율',
  ims2024: 'UN 국제이주자 통계 2024',
  unhcr2024: 'UNHCR 난민 통계 2024',
};
export const sourceLabel = (id: string) => SOURCE_LABEL[id] ?? id;
