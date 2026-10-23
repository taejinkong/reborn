"""원천 데이터(data/raw) → 엔진 입력(data/build) 생성.

출력
  data/build/countries.json        국가별 지표 (값마다 v=값, y=기준 연도, src=출처, est=추정 여부)
  data/build/lifetables/{year}.json  국가·성별 단일 연령 사망확률 q(x), x=0..100
"""
import json
import sys
from statistics import median

import pandas as pd

from common import BUILD, RAW, write_json
from fetch_wb import INDICATORS

NOW_YEAR = 2025          # 출생·인구 기준 연도 (WPP 중위 추계)
LT_NOW = 2023            # 최신 생명표 추정 연도
LT_PAST = list(range(1950, 2023, 10))  # 과거 모드용 생명표 연도
MIN_POP_K = 100          # 인구 10만 명 이상만 포함 (천 명 단위)
MAX_AGE = 100

# World Bank 지역 코드 → 엔진 지역 코드
REGION = {"EAS": "eap", "ECS": "eca", "LCN": "lac", "MEA": "mena", "NAC": "na", "SAS": "sa", "SSF": "ssa"}
# World Bank 목록에 없는 WPP 국가·지역 보완
REGION_EXTRA = {"TWN": ("EAS", "HIC"), "ESH": ("MEA", "LMC"), "GLP": ("LCN", "HIC"), "MTQ": ("LCN", "HIC"),
                "GUF": ("LCN", "HIC"), "REU": ("SSF", "HIC"), "MYT": ("SSF", "UMC"), "VEN": ("LCN", "UMC")}

WPP_DEMO = RAW / "WPP2024_Demographic_Indicators_Medium.csv.gz"
WPP_ASFR = RAW / "WPP2024_Fertility_by_Age5.csv.gz"
WMD = RAW / "undesa_pd_2019_wmd_marital_status.xlsx"
WMD_MIN_YEAR = 2000      # 이보다 오래된 결혼 통계는 쓰지 않는다
WPP_LT = {"F": RAW / "WPP2024_Life_Table_Complete_Medium_Female_1950-2023.csv.gz",
          "M": RAW / "WPP2024_Life_Table_Complete_Medium_Male_1950-2023.csv.gz"}

# WDI 값 중 이 연도보다 오래된 값은 쓰지 않는다
WB_MIN_YEAR = 2010
# 최신 연도 대신 특정 연도를 쓰는 지표. 사망 원인 비중은 2020~2021년 코로나19 사망이 섞여 있어 2019년을 쓴다.
WB_PREFER_YEAR = {"deathCommShare": 2019, "deathNcdShare": 2019, "deathInjShare": 2019}


def rnd(x, n=3):
    return None if x is None or pd.isna(x) else round(float(x), n)


def load_wpp_demo():
    cols = ["LocID", "ISO3_code", "ISO2_code", "LocTypeName", "Location", "Time", "TPopulation1July", "Births", "TFR", "MAC", "SRB",
            "LEx", "LExMale", "LExFemale", "IMR", "Q5"]
    # 나미비아 ISO2 코드 "NA"가 결측치로 읽히지 않도록 빈 칸만 결측으로 본다
    d = pd.read_csv(WPP_DEMO, usecols=cols, low_memory=False, keep_default_na=False, na_values=[""])
    d = d[(d.LocTypeName == "Country/Area") & d.ISO3_code.notna()]
    return d


def load_wb():
    meta = {c["iso3"]: c for c in json.load(open(RAW / "wb" / "countries.json", encoding="utf-8"))}
    latest = {}
    for field, code in INDICATORS.items():
        rows = json.load(open(RAW / "wb" / f"{code}.json", encoding="utf-8"))
        best = {}
        want = WB_PREFER_YEAR.get(field)
        for r in rows:
            if r["year"] < WB_MIN_YEAR or (want and r["year"] > want):
                continue
            if r["iso3"] not in best or r["year"] > best[r["iso3"]]["year"]:
                best[r["iso3"]] = r
        latest[field] = best
    return meta, latest


def load_asfr(isos):
    """2025년 5세 구간 연령별 출산율 (15~49세, 여성 1,000명당)."""
    # 파일 이름과 달리 여러 추계 변형이 함께 들어 있어 중위(Medium)만 고른다
    d = pd.read_csv(WPP_ASFR, usecols=["ISO3_code", "LocTypeName", "Variant", "Time", "AgeGrpStart", "ASFR"],
                    dtype={"ISO3_code": str, "LocTypeName": str, "Variant": str}, keep_default_na=False, na_values=[""])
    d = d[(d.LocTypeName == "Country/Area") & (d.Variant == "Medium") & (d.Time == NOW_YEAR) & d.ISO3_code.isin(isos) &
          d.AgeGrpStart.between(15, 45)]
    out = {}
    for iso, g in d.groupby("ISO3_code"):
        g = g.sort_values("AgeGrpStart")
        assert g.AgeGrpStart.tolist() == [15, 20, 25, 30, 35, 40, 45], iso
        out[iso] = [round(float(v), 1) for v in g.ASFR]
    return out


def load_marriage(m49_to_iso3):
    """국가·성별 최신 값: 45~49세에 결혼한 적 있는 비율(%)과 평균 초혼 연령(SMAM)."""
    ever = pd.read_excel(WMD, "EVER_MARRIED", header=2)
    ever = ever[(ever.AgeGroup == "[45-49]") & (ever.YearEnd >= WMD_MIN_YEAR)]
    smam = pd.read_excel(WMD, "SMAM", header=2)
    smam = smam[smam.YearEnd >= WMD_MIN_YEAR]
    out = {}
    # 45~49세 중 이혼·별거 상태 비율 (재혼한 사람은 빠지므로 실제 이혼 경험보다 낮다)
    ms = pd.read_excel(WMD, "MARITAL_STATUS_BY_AGE", header=2)
    ms = ms[(ms.AgeGroup == "[45-49]") & (ms.YearEnd >= WMD_MIN_YEAR) &
            ms.MaritalStatus.isin(["Divorced", "Separated", "Divorced or Separated"])]
    ms = ms.groupby(["ISO code", "Sex", "YearEnd", "DataCatalog ID"], as_index=False).DataValue.sum()
    for name, df in (("everMarried", ever), ("marriageAge", smam), ("divorced", ms)):
        df = df.sort_values("YearEnd")
        for (m49, sex), g in df.groupby(["ISO code", "Sex"]):
            iso = m49_to_iso3.get(int(m49))
            if not iso or sex not in ("Women", "Men"):
                continue
            last = g.iloc[-1]
            out.setdefault(iso, {}).setdefault(name, {})["F" if sex == "Women" else "M"] = (
                round(float(last.DataValue), 1), int(last.YearEnd))
    return out


def build_countries():
    demo = load_wpp_demo()
    m49_to_iso3 = dict(zip(demo.LocID.astype(int), demo.ISO3_code))
    now = demo[demo.Time == NOW_YEAR].set_index("ISO3_code")
    now = now[now.TPopulation1July >= MIN_POP_K]
    meta, wb = load_wb()
    asfr = load_asfr(set(now.index))
    marriage = load_marriage(m49_to_iso3)

    out = {}
    for iso, r in now.iterrows():
        if iso in meta:
            reg, inc = meta[iso]["region"], meta[iso]["income"]
        elif iso in REGION_EXTRA:
            reg, inc = REGION_EXTRA[iso]
        else:
            print(f"  지역 정보 없음, 제외: {iso} {r.Location}", file=sys.stderr)
            continue
        src = "wpp2024"
        c = {
            "id": iso,
            "iso2": r.ISO2_code,
            "name": r.Location,
            "region": REGION[reg],
            "income": inc,
            "births": {"v": int(round(r.Births * 1000)), "y": NOW_YEAR, "src": src},
            "population": {"v": int(round(r.TPopulation1July * 1000)), "y": NOW_YEAR, "src": src},
            "tfr": {"v": rnd(r.TFR, 2), "y": NOW_YEAR, "src": src},
            "meanAgeBirth": {"v": rnd(r.MAC, 1), "y": NOW_YEAR, "src": src},
            "srb": {"v": rnd(r.SRB, 1), "y": NOW_YEAR, "src": src},
            "lifeExp": {"v": {"F": rnd(r.LExFemale, 1), "M": rnd(r.LExMale, 1)}, "y": NOW_YEAR, "src": src},
            "imr": {"v": rnd(r.IMR, 1), "y": NOW_YEAR, "src": src},
            "u5mr": {"v": rnd(r.Q5, 1), "y": NOW_YEAR, "src": src},
            # 15-19, 20-24, ..., 45-49세 연령별 출산율 (여성 1,000명당)
            "asfr": {"v": asfr[iso], "y": NOW_YEAR, "src": src},
        }
        for field in ("everMarried", "marriageAge", "divorced"):
            m = marriage.get(iso, {}).get(field, {})
            c[field] = ({"v": {s: m[s][0] for s in "FM"}, "y": max(m["F"][1], m["M"][1]), "src": "wmd2019"}
                        if "F" in m and "M" in m else None)
        for field in INDICATORS:
            hit = wb[field].get(iso)
            c[field] = {"v": rnd(hit["value"], 2), "y": hit["year"], "src": "wdi"} if hit else None
        out[iso] = c

    fill_missing(out)
    fill_missing_sexed(out, ("everMarried", "marriageAge", "divorced"))
    return out


def fill_missing_sexed(out, fields):
    """성별 값 {F, M} 필드의 결측치를 같은 지역·소득그룹 → 지역 → 전체 중앙값으로 채운다."""
    for field in fields:
        have = [c for c in out.values() if c[field]]
        for c in out.values():
            if c[field]:
                continue
            pool = ([x for x in have if (x["region"], x["income"]) == (c["region"], c["income"])]
                    or [x for x in have if x["income"] == c["income"]]
                    or [x for x in have if x["region"] == c["region"]] or have)
            v = {s: round(median(x[field]["v"][s] for x in pool), 1) for s in "FM"}
            c[field] = {"v": v, "y": None, "src": "est:group-median", "est": True}


def fill_missing(out):
    """결측치: 같은 지역·소득그룹 → 같은 소득그룹 → 같은 지역 → 전체 중앙값. est=True 표시."""
    for field in INDICATORS:
        have = [c for c in out.values() if c[field]]
        by_ri, by_i, by_r = {}, {}, {}
        for c in have:
            by_ri.setdefault((c["region"], c["income"]), []).append(c[field]["v"])
            by_i.setdefault(c["income"], []).append(c[field]["v"])
            by_r.setdefault(c["region"], []).append(c[field]["v"])
        everyone = [c[field]["v"] for c in have]
        for c in out.values():
            if c[field]:
                continue
            pool = by_ri.get((c["region"], c["income"])) or by_i.get(c["income"]) or by_r.get(c["region"]) or everyone
            c[field] = {"v": round(median(pool), 2), "y": None, "src": "est:group-median", "est": True}


def build_lifetables(isos, years):
    tables = {y: {} for y in years}
    for sex, path in WPP_LT.items():
        print(f"  생명표 읽는 중: {sex}", file=sys.stderr)
        it = pd.read_csv(path, usecols=["ISO3_code", "LocTypeName", "Time", "AgeGrpStart", "qx"],
                         dtype={"ISO3_code": str, "LocTypeName": str}, chunksize=1_000_000)
        for chunk in it:
            chunk = chunk[(chunk.LocTypeName == "Country/Area") & chunk.Time.isin(years) &
                          chunk.ISO3_code.isin(isos) & (chunk.AgeGrpStart <= MAX_AGE)]
            for (iso, yr), g in chunk.groupby(["ISO3_code", "Time"]):
                q = g.sort_values("AgeGrpStart").qx.round(6).tolist()
                tables[yr].setdefault(iso, {})[sex] = q
    for yr, t in tables.items():
        for iso, s in t.items():
            for sex, q in s.items():
                assert len(q) == MAX_AGE + 1, f"{iso} {yr} {sex}: {len(q)}개 연령"
                s[sex] = q[:-1] + [1.0]  # 100세 이상 구간은 종결
        write_json(BUILD / "lifetables" / f"{yr}.json", {"year": yr, "src": "wpp2024", "maxAge": MAX_AGE, "q": t})
        print(f"  lifetables/{yr}.json: {len(t)}개국", file=sys.stderr)


if __name__ == "__main__":
    countries = build_countries()
    write_json(BUILD / "countries.json", {
        "generated": pd.Timestamp.now(tz="UTC").strftime("%Y-%m-%d"),
        "nowYear": NOW_YEAR,
        "countries": sorted(countries.values(), key=lambda c: c["id"]),
    })
    print(f"countries.json: {len(countries)}개국", file=sys.stderr)
    build_lifetables(set(countries), [LT_NOW] + LT_PAST)
