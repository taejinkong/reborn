# 데이터 파이프라인

```bash
cd pipeline
pip install -r requirements.txt
python3 fetch_wpp.py   # UN WPP 2024 CSV·결혼·이주 통계 (~530MB, data/raw/에 캐시)
python3 fetch_wb.py    # World Bank WDI 지표
python3 fetch_unhcr.py # UNHCR 국외 피란 인구
python3 build.py       # data/build/ 생성
python3 check.py       # 범위·생명표 검증 (실패 시 종료 코드 1)
```

출처와 라이선스는 [data/SOURCES.md](../data/SOURCES.md) 참고.
