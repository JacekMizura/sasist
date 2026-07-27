# Instalacja Sasist Agent (Windows)

## Wymagania

- Windows 10 / 11 (x64) lub Windows Server 2019+
- Uprawnienia administratora do instalacji
- Internet
- Konto Sasist oraz **kod połączenia** (Ustawienia → Urządzenia → Dodaj Agenta)

## Instalacja / aktualizacja

1. Pobierz **SasistAgentSetup.exe** (nie „Sasist Printer Agent”).
2. Uruchom jako administrator.
3. Instalator zatrzyma starą usługę, zamknie program, podmieni pliki i uruchomi ponownie.
4. Otworzy się okno **Sasist Agent**.

Jeśli nadal masz stary **Sasist Printer Agent**, odinstaluj go w Ustawieniach Windows → Aplikacje.

## Pierwsze uruchomienie

1. Wpisz **kod połączenia**.
2. Kliknij **Połącz**.
3. Przejdź do **Urządzenia** → wybierz drukarkę → **Druk testowy**.

Okno pozostaje otwarte jako panel zarządzania. Zamknięcie (X) chowa program do ikony przy zegarze.

## Panele

| Panel | Co robi |
|-------|---------|
| Status | Połączenie, firma, komputer, gotowość |
| Urządzenia | Lista drukarek + druk testowy |
| Zadania | Ostatnie wydruki i błędy |
| Logi | Podgląd, kopiuj, wyczyść, zapisz |
| Diagnostyka | Machine ID, Agent ID, endpoint (dla wsparcia) |

## Budowanie (zespół Sasist)

```powershell
cd sasist-agent
.\scripts\publish-release.ps1
```

Wynik: `dist\SasistAgentSetup.exe`
