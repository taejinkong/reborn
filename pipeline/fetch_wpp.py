"""UN World Population Prospects 2024 CSV 내려받기 (CC BY 3.0 IGO)."""
from common import RAW, download

BASE = "https://population.un.org/wpp/assets/Excel%20Files/1_Indicator%20(Standard)/CSV_FILES/"
FILES = [
    "WPP2024_Demographic_Indicators_Medium.csv.gz",
    "WPP2024_Life_Table_Complete_Medium_Female_1950-2023.csv.gz",
    "WPP2024_Life_Table_Complete_Medium_Male_1950-2023.csv.gz",
]

if __name__ == "__main__":
    for name in FILES:
        p = download(BASE + name, RAW / name)
        print(f"{name}: {p.stat().st_size:,} bytes")
