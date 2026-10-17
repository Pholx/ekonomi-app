# 💰 Ekonomi – Budget & FIRE

En svensk webbapp (PWA) för att hantera hushållsbudget och simulera FIRE (Financial Independence, Retire Early).

## Funktioner

- **Budget:** Detaljerad hushållsbudget med kategorier för inkomster, sparande, boende, transport, mat, barn, skulder m.m.
- **FIRE Simulator:** Avancerad simulering med ISK/Depå-skatt, Monte Carlo-simuleringar och svenska amorteringskrav.
- **Jämförelser:** Jämför din ekonomi mot svensk statistik från SCB, Konsumentverket och Swedbank.
- **Offline-stöd:** Fungerar helt utan internetanslutning efter första besöket (PWA).
- **Integritet:** All data sparas lokalt i din webbläsare (`localStorage`). Inget skickas till någon server.

## Så använder du appen

### Online (rekommenderat)
Besök appen via GitHub Pages: `https://pholx.github.io/ekonomi-app/`

### Lokalt
Eftersom appen använder Service Workers och ES6-moduler krävs en lokal server för att allt ska fungera.
```bash
# Med Python
python3 -m http.server 8000

# Med Node.js
npx serve .