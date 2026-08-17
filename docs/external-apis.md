# External Data Sources

Every outbound data call the application makes is **defined as a row in the
`external_api` database table** (not hard-coded). Services read a row, then
build the request. This lets sources be enabled/disabled or re-pointed without
code changes, and makes the catalogue self-documenting via
`GET /api/external-apis`.

**Access legend**

| Term | Meaning |
|------|---------|
| **Open** | Public, no key, no registration. Used by MVP-1 so the prototype runs out-of-the-box. |
| **Registration** | Free, but requires creating an account / API key. Needed by later MVPs. |
| **Private** | Commercial / licensed (none required by this prototype). |

## Catalogue

| # | Source (name) | Provider | Category | Access | Key env var | Format | Used by | Registration URL / Comment |
|---|---------------|----------|----------|--------|-------------|--------|---------|----------------------------|
| 1 | `open_meteo_forecast` | Open-Meteo | forecast | **Open** | — | JSON | MVP-1, MVP-3 | Key-less global forecast incl. the Middle East AOR. |
| 2 | `open_meteo_air_quality` | Open-Meteo | air_quality | **Open** | — | JSON | MVP-1, MVP-4 | Dust / PM / aerosol; supports AOR dust monitoring. |
| 3 | `open_meteo_marine` | Open-Meteo | marine | **Open** | — | JSON | MVP-4 | Wave height / sea-state. |
| 4 | `open_meteo_flood` | Open-Meteo | flood | **Open** | — | JSON | MVP-1 | River discharge / flood index. |
| 5 | `open_meteo_ensemble` | Open-Meteo | forecast | **Open** | — | JSON | MVP-3 | Probabilistic ensemble members. |
| 6 | `nws_alerts` | NOAA / NWS | alerts | **Open** | — | GeoJSON | MVP-2 | Official alert-schema reference (US coverage). |
| 7 | `nasa_gibs_wmts` | NASA GIBS | satellite | **Open** | — | WMTS tiles | MVP-1 | Satellite imagery basemap tiles. |
| 8 | `noaa_gfs` | NOAA (AWS Open Data) | forecast | **Open** | — | GRIB2 | MVP-1, MVP-3 | Global NWP via AWS Open Data. |
| 9 | `noaa_gefs` | NOAA (AWS Open Data) | forecast | **Open** | — | GRIB2 | MVP-3 | Global ensemble (probabilistic). |
| 10 | `ecmwf_open_data` | ECMWF | forecast | **Open** | — | GRIB2 | MVP-1, MVP-7 | Open IFS / AIFS AI-model reference. |
| 11 | `noaa_hrrr` | NOAA (AWS Open Data) | forecast | **Open** | — | GRIB2 | MVP-5 | 3km convection-permitting (CONUS) analog. |
| 12 | `nasa_gpm_imerg` | NASA GPM | precip | **Registration** | `NASA_EARTHDATA_TOKEN` | NetCDF | MVP-1, MVP-4 | Multi-satellite merged precipitation. Register: https://urs.earthdata.nasa.gov/users/new |
| 13 | `copernicus_cams` | Copernicus CAMS | air_quality | **Registration** | `COPERNICUS_CDS_KEY` | NetCDF | MVP-4 | Dust / aerosol forecasts. Register: https://ads.atmosphere.copernicus.eu/user/register |
| 14 | `openaq` | OpenAQ | air_quality | **Registration** | `OPENAQ_API_KEY` | JSON | MVP-1 | Ground air-quality (v3 key). Register: https://explore.openaq.org/register |
| 15 | `copernicus_marine` | Copernicus Marine | marine | **Registration** | `COPERNICUS_CDS_KEY` | NetCDF | MVP-4 | Sea state / waves / currents. Register: https://data.marine.copernicus.eu/register |
| 16 | `era5_cds` | Copernicus CDS | reanalysis | **Registration** | `COPERNICUS_CDS_KEY` | NetCDF | MVP-3 | ERA5 reanalysis history. Register: https://cds.climate.copernicus.eu/user/register |
| 17 | `nasa_power` | NASA POWER | forecast | **Open** | — | JSON/CSV | MVP-1 | Meteorology & solar parameters. |
| 18 | `noaa_goes` | NOAA (AWS Open Data) | satellite | **Open** | — | NetCDF | MVP-1, MVP-4 | Geostationary satellite (clouds/convection). |

> **Prototype note:** MVP-1 uses only **Open** sources (`open_meteo_forecast`,
> `open_meteo_air_quality`, `nasa_gibs_wmts`), so no registration is required to
> run and demo the application. Registration-based sources are pre-wired for the
> later MVPs; add their keys to `backend/.env` to enable them.
