"""UN World Population Prospects 2024 CSV 내려받기 (CC BY 3.0 IGO)."""
from common import RAW, download

BASE = "https://population.un.org/wpp/assets/Excel%20Files/1_Indicator%20(Standard)/CSV_FILES/"
FILES = [
    "WPP2024_Demographic_Indicators_Medium.csv.gz",
    "WPP2024_Life_Table_Complete_Medium_Female_1950-2023.csv.gz",
    "WPP2024_Life_Table_Complete_Medium_Male_1950-2023.csv.gz",
    "WPP2024_Fertility_by_Age5.csv.gz",
]

# UN International Migrant Stock 2024, 출신국×목적지 (CC BY 3.0 IGO)
IMS_URL = ("https://www.un.org/development/desa/pd/sites/www.un.org.development.desa.pd/files/"
           "undesa_pd_2024_ims_stock_by_sex_destination_and_origin.xlsx")

# UN World Marriage Data 2019 (CC BY 3.0 IGO)
WMD_URL = ("https://www.un.org/development/desa/pd/sites/www.un.org.development.desa.pd/files/"
           "undesa_pd_2019_wmd_marital_status.xlsx")

if __name__ == "__main__":
    for name in FILES:
        p = download(BASE + name, RAW / name)
        print(f"{name}: {p.stat().st_size:,} bytes")
    p = download(IMS_URL, RAW / "undesa_pd_2024_ims_stock_by_sex_destination_and_origin.xlsx")
    print(f"{p.name}: {p.stat().st_size:,} bytes")
    p = download(WMD_URL, RAW / "undesa_pd_2019_wmd_marital_status.xlsx")
    print(f"{p.name}: {p.stat().st_size:,} bytes")
