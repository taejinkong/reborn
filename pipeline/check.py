"""data/build 검증: 범위 검사, 생명표로 계산한 기대수명과 WPP 기대수명 비교."""
import json
import sys

from common import BUILD

RANGES = {
    "tfr": (0.5, 8), "srb": (95, 120), "imr": (0, 150), "u5mr": (0, 250), "meanAgeBirth": (18, 40),
    "gdpPppPc": (300, 200_000), "gini": (20, 70), "urban": (0, 100), "agriEmployment": (0, 100),
    "primaryEnroll": (0, 100), "secondaryEnroll": (0, 100), "tertiaryEnroll": (0, 200), "literacy": (0, 100),
    "schoolYears": (0, 15), "mmr": (0, 2000), "hivPrev": (0, 40), "homicide": (0, 150), "roadDeaths": (0, 80),
    "smokingF": (0, 70), "smokingM": (0, 90), "oopHealth": (0, 100), "childMarriage": (0, 90),
}


# 2023 생명표에 일시적 위기(전쟁·재해)가 반영돼 2025 추계와 크게 다른 국가. 실제 통계이므로 허용.
CRISIS_2023 = {"PSE": "가자 전쟁", "LBY": "데르나 홍수", "UKR": "러시아-우크라이나 전쟁"}


def e0(q):
    """단일 연령 q(x)로 출생 시 기대수명 (각 연령 중앙에서 사망 가정)."""
    alive, total = 1.0, 0.0
    for qx in q:
        d = alive * qx
        total += (alive - d) + d * 0.5
        alive -= d
    return total


def main():
    errors = []
    data = json.load(open(BUILD / "countries.json", encoding="utf-8"))
    cs = data["countries"]
    if not 170 <= len(cs) <= 240:
        errors.append(f"국가 수 이상: {len(cs)}")
    for c in cs:
        for f, (lo, hi) in RANGES.items():
            v = c[f]["v"] if c.get(f) else None
            if v is None or not lo <= v <= hi:
                errors.append(f"{c['id']} {f}={v} (허용 {lo}~{hi})")

    lt = json.load(open(BUILD / "lifetables" / "2023.json", encoding="utf-8"))["q"]
    worst = 0.0
    for c in cs:
        for sex in "FM":
            diff = abs(e0(lt[c["id"]][sex]) - c["lifeExp"]["v"][sex])
            worst = max(worst, diff)
            if diff > 3.0 and c["id"] not in CRISIS_2023:  # 2023 생명표 vs 2025 추계, 소수 연령 근사 차이 허용
                errors.append(f"{c['id']} {sex} e0 차이 {diff:.1f}년")

    est = sum(1 for c in cs for f in RANGES if c.get(f) and c[f].get("est"))
    print(f"국가 {len(cs)}개, 추정값 {est}개, 생명표 e0 최대 차이 {worst:.2f}년")
    births = sum(c["births"]["v"] for c in cs)
    print(f"연간 출생아 합계 {births:,}명")
    for e in errors:
        print("  !", e)
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
