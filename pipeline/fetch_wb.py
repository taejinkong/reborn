"""World Bank WDI 지표 내려받기 (CC BY 4.0)."""
from common import RAW, get_json, write_json

# 필드명 → WDI 지표 코드
INDICATORS = {
    "gdpPppPc": "NY.GDP.PCAP.PP.KD",       # 1인당 GDP, PPP (2021 국제달러)
    "gini": "SI.POV.GINI",                 # 지니계수 (0~100)
    "urban": "SP.URB.TOTL.IN.ZS",          # 도시 인구 비율 (%)
    "agriEmployment": "SL.AGR.EMPL.ZS",    # 농업 고용 비중 (%)
    "primaryEnroll": "SE.PRM.NENR",        # 초등 순취학률 (%)
    "secondaryEnroll": "SE.SEC.NENR",      # 중등 순취학률 (%)
    "tertiaryEnroll": "SE.TER.ENRR",       # 고등교육 총취학률 (%)
    "literacy": "SE.ADT.LITR.ZS",          # 성인 문해율 (%)
    "schoolYears": "HD.HCI.EYRS",          # 기대 교육연수 (인적자본지수)
    "mmr": "SH.STA.MMRT",                  # 모성사망비 (출생 10만 명당)
    "hivPrev": "SH.DYN.AIDS.ZS",           # HIV 유병률 (15~49세, %)
    "homicide": "VC.IHR.PSRC.P5",          # 살인율 (10만 명당)
    "roadDeaths": "SH.STA.TRAF.P5",        # 교통사고 사망률 (10만 명당)
    "smokingF": "SH.PRV.SMOK.FE",          # 여성 흡연율 (%)
    "smokingM": "SH.PRV.SMOK.MA",          # 남성 흡연율 (%)
    "oopHealth": "SH.XPD.OOPC.CH.ZS",      # 의료비 본인부담 비율 (%)
    "childMarriage": "SP.M18.2024.FE.ZS",  # 18세 전 결혼한 20~24세 여성 비율 (%)
}

API = "https://api.worldbank.org/v2"


def fetch_indicator(code: str):
    url = f"{API}/country/all/indicator/{code}?format=json&date=2005:2025&per_page=20000"
    meta, rows = get_json(url)
    assert meta["pages"] == 1, f"{code}: 페이지가 여러 개"
    return [
        {"iso3": r["countryiso3code"], "year": int(r["date"]), "value": r["value"]}
        for r in rows or []
        if r["countryiso3code"] and r["value"] is not None
    ]


def fetch_countries():
    meta, rows = get_json(f"{API}/country?format=json&per_page=400")
    return [
        {"iso3": r["id"], "name": r["name"], "region": r["region"]["id"], "income": r["incomeLevel"]["id"]}
        for r in rows
        if r["region"]["id"] != "NA"  # 집계 지역 제외
    ]


if __name__ == "__main__":
    write_json(RAW / "wb" / "countries.json", fetch_countries())
    for field, code in INDICATORS.items():
        rows = fetch_indicator(code)
        write_json(RAW / "wb" / f"{code}.json", rows)
        print(f"{field:16s} {code:20s} {len(rows):6d} rows")
