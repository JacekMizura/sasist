# Instalacja Sasist Agent (Windows)

## Wymagania

- Windows 10 / 11 (x64) lub Windows Server 2019+
- Uprawnienia administratora do instalacji
- Połączenie z Internetem
- Konto Sasist oraz **kod połączenia** (Ustawienia → Urządzenia → Dodaj Agenta)

**Nie jest wymagany** .NET Runtime — instalator dostarcza kompletny program.

## Szybka instalacja

1. Uruchom `SasistAgentSetup.exe` **jako administrator**.
2. Po instalacji otworzy się **Sasist Agent**.
3. Wklej **kod połączenia** z panelu Sasist.
4. Kliknij **Połącz**.

Gotowe — Agent działa w tle (ikona przy zegarze). Możesz drukować z Sasist.

Nie podajesz żadnego adresu serwera. Program łączy się wyłącznie z Sasist.

## Co zobaczysz po połączeniu

- **Status** — czy jesteś połączony, nazwa firmy, komputer, gotowość do drukowania
- **Urządzenia** — drukarki gotowe do pracy (oraz przyszłe typy urządzeń)
- **Diagnostyka** — tylko gdy wsparcie Sasist o to poprosi
- **Logi** — szczegóły techniczne na wypadek problemów

## Menu przy ikonie

Sasist Agent · Połączono · Połączono z: firma · Status · Urządzenia · Diagnostyka · Logi · Sprawdź aktualizacje · Odłącz urządzenie · Uruchom ponownie usługę · Zamknij

## Odinstalowanie

Ustawienia Windows → Aplikacje → Sasist Agent → Odinstaluj  
lub skrót w Menu Start.

## Budowanie instalatora (dla zespołu Sasist)

```powershell
cd sasist-agent
.\scripts\publish-release.ps1
```

Wynik: `dist\SasistAgentSetup.exe`
