"""UNHCR 난민 통계: 출신국별 국외 피란 인구 (Refugee Data Finder API).

라이선스: UNHCR 공식 R 패키지(refugees)와 세계은행 재배포 기준 CC BY 4.0. 출시 전 UNHCR 이용 약관 원문 확인 필요.
"""
from common import RAW, get_json, write_json

YEAR = 2024
API = "https://api.unhcr.org/population/v1/population/"


def num(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return 0


if __name__ == "__main__":
    rows, page = [], 1
    while True:
        d = get_json(f"{API}?year={YEAR}&coo_all=true&limit=100&page={page}")
        for it in d["items"]:
            if it["coo_iso"] and it["coo_iso"] != "-":
                rows.append({
                    "iso3": it["coo_iso"],
                    # 난민 + 비호 신청자 + 국제 보호가 필요한 기타 인구
                    "displacedAbroad": num(it["refugees"]) + num(it["asylum_seekers"]) + num(it.get("oip")),
                })
        if page >= d["maxPages"]:
            break
        page += 1
    write_json(RAW / "unhcr" / f"population_{YEAR}.json", rows)
    print(f"UNHCR {YEAR}: {len(rows)}개 출신국, 국외 피란 합계 {sum(r['displacedAbroad'] for r in rows):,}명")
