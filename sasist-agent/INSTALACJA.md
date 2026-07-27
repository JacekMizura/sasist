# Instalacja Sasist Agent (Windows)

## Wymagania

- Windows 10 / 11 (x64) lub Windows Server 2019+
- Uprawnienia administratora do instalacji
- Połączenie z internetem
- Konto Sasist oraz **kod parowania** (Ustawienia → Urządzenia → Dodaj Agenta)

**Nie jest wymagany** .NET Runtime — instalator dostarcza build *self-contained*.

## Szybka instalacja

1. Uruchom `SasistAgentSetup.exe` **jako administrator**.
2. Po instalacji otworzy się **Sasist Agent**.
3. Wklej **kod parowania** z panelu Sasist.
4. Kliknij **Połącz**.

Gotowe — Agent działa w tle (ikona w zasobniku).

Nie podajesz adresu serwera. Agent łączy się wyłącznie z Sasist (`https://api.sasist.pl`).

## Tray (zasobnik)

- Status Online / Offline
- Połączono z: nazwa firmy
- Liczba urządzeń
- Otwórz panel urządzeń · Diagnostyka · Logi · Restart usługi
- **Odłącz urządzenie** — usuwa parowanie i pokazuje ponownie ekran z kodem
- Sprawdź aktualizacje · Zamknij Tray

## Konfiguracja (zaawansowane)

| Co | Ścieżka |
|----|---------|
| Instalacja | `%ProgramFiles%\Sasist\Agent\` |
| Dane | `%ProgramData%\Sasist\Agent\` |
| Logi | `%ProgramData%\Sasist\Agent\logs\` |
| Sekrety | `%ProgramData%\Sasist\Agent\secrets\` (DPAPI) |

Dla deweloperów: `SASIST_API_URL` lub `appsettings.Development.json` (tylko Debug).

## Odinstalowanie

Ustawienia Windows → Aplikacje → Sasist Agent → Odinstaluj  
lub skrót w Menu Start.

Dane w `%ProgramData%\Sasist\Agent\` mogą pozostać — usuń ręcznie, jeśli chcesz wyczyścić parowanie lokalne.

## Budowanie instalatora

```powershell
cd sasist-agent
.\scripts\publish-release.ps1
```

Wynik: `dist\SasistAgentSetup.exe`, `publish\win-x64\`
