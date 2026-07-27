"""Polish UI strings for Sasist Printer Agent."""

from __future__ import annotations

# — Navigation —
NAV_STATUS = "Status"
NAV_LOGS = "Logi"
NAV_SETTINGS = "Ustawienia"

APP_TITLE = "Sasist Printer Agent"

# — Common —
COPIED = "Skopiowano"
COPY = "Kopiuj"
PASTE = "Wklej"
SHOW = "Poka\u017c"
HIDE = "Ukryj"
REFRESH = "Od\u015bwie\u017c"
SAVE = "Zapisz"
CANCEL = "Anuluj"
DISCARD = "Odrzu\u0107"
CLOSE = "Zamknij"
BACK = "Wstecz"
NEXT = "Dalej"

CLIPBOARD_EMPTY = "Schowek jest pusty."
CLIPBOARD_UNAVAILABLE = "Schowek jest pusty lub niedost\u0119pny."
COPY_FAILED = "Nie uda\u0142o si\u0119 skopiowa\u0107 do schowka."

# — Logs panel —
LOG_FILTER_LABEL = "Filtr:"
LOG_FILTER_ALL = "Wszystkie"
LOG_FILTER_INFO = "Informacje"
LOG_FILTER_WARNING = "Ostrze\u017cenia"
LOG_FILTER_ERROR = "B\u0142\u0119dy"
LOG_SEARCH_LABEL = "Szukaj:"
LOG_SEARCH_PLACEHOLDER = "Tekst w logu\u2026"
LOG_AUTOSCROLL = "Automatyczne przewijanie"
LOG_COPY_ERROR = "Kopiuj b\u0142\u0105d"
LOG_RESET_FILTERS = "Reset filtr\u00f3w"
LOG_OPEN_NOTEPAD = "Otw\u00f3rz w Notatniku"
LOG_FILES = "Pliki"
LOG_PREVIEW = "Podgl\u0105d"
LOG_NO_FILES = "Brak plik\u00f3w log\u00f3w."
LOG_SELECT_FILE = "Wybierz plik logu po lewej."
LOG_FILE_MISSING = "Plik nie istnieje:\n{path}"
LOG_READ_FAILED = "Nie uda\u0142o si\u0119 odczyta\u0107 pliku:\n{error}"
LOG_NO_RESULTS = '(Brak wynik\u00f3w dla "{query}")'
LOG_NO_LEVEL_ENTRIES = "Brak wpis\u00f3w {level}"

LOG_FILTER_OPTIONS: tuple[tuple[str, str], ...] = (
    ("ALL", LOG_FILTER_ALL),
    ("INFO", LOG_FILTER_INFO),
    ("WARNING", LOG_FILTER_WARNING),
    ("ERROR", LOG_FILTER_ERROR),
)

# — Settings panel —
SETTINGS_CONNECTION = "Po\u0142\u0105czenie"
SETTINGS_SERVER_URL = "Adres serwera"
SETTINGS_API_KEY = "Klucz API"
SETTINGS_PASTE_CLIPBOARD = "Wklej ze schowka"
SETTINGS_API_KEY_HINT = "Klucz API wygenerujesz w:\nSasist \u2192 Ustawienia \u2192 Integracje \u2192 Klucze API"
SETTINGS_CONNECTION_STATUS = "Status po\u0142\u0105czenia:"
SETTINGS_DIAGNOSTICS = "Diagnostyka"
SETTINGS_TEST_CONNECTION = "Test po\u0142\u0105czenia"
SETTINGS_SYNC_PRINTERS = "Synchronizuj drukarki"
SETTINGS_UNSAVED_CHANGES = "Masz niezapisane zmiany"
SETTINGS_TEST_SUCCESS = "Po\u0142\u0105czenie poprawne \u2014 mo\u017cesz zapisa\u0107 konfiguracj\u0119"
SETTINGS_TEST_RUNNING = "Test po\u0142\u0105czenia\u2026"
SETTINGS_TEST_OK_HINT = "Po\u0142\u0105czenie dzia\u0142a poprawnie. Kliknij Zapisz, aby zachowa\u0107 ustawienia w config.json."
SETTINGS_SAVED = "Zapisano ustawienia."
SETTINGS_PASTED_KEY = "Wklejono klucz API ze schowka."
SETTINGS_SYNC_OK = "Zsynchronizowano drukarki."
SETTINGS_SYNC_UNAVAILABLE = "Synchronizacja drukarek jest niedost\u0119pna."
SETTINGS_NOT_CONNECTED = "Agent nie jest po\u0142\u0105czony. Zapisz ustawienia i uruchom ponownie agenta."
SETTINGS_NEED_URL = "Podaj URL serwera."
SETTINGS_NEED_KEY = "Podaj klucz API."

STATUS_CONNECTED = "\U0001f7e2 Po\u0142\u0105czono"
STATUS_NO_CONNECTION = "\U0001f7e0 Brak po\u0142\u0105czenia"
STATUS_INVALID_KEY = "\U0001f534 Nieprawid\u0142owy klucz API"
STATUS_NOT_CONFIGURED = "\U0001f7e0 Nie skonfigurowano"

DIAG_LAST_TEST = "Ostatni test po\u0142\u0105czenia:"
DIAG_MACHINE_ID = "Identyfikator maszyny:"
DIAG_AGENT_ID = "ID agenta:"
DIAG_WAREHOUSE = "Magazyn (warehouse_id):"
DIAG_AGENT_VERSION = "Wersja agenta:"
DIAG_REPORTED_VERSION = "Wersja zg\u0142oszona do backendu:"

# — Status panel —
STATUS_AGENT_STATE = "Stan agenta"
STATUS_ONLINE = "\U0001f7e2 Po\u0142\u0105czony"
STATUS_OFFLINE = "\U0001f534 Roz\u0142\u0105czony"
STATUS_PRINTING = "\U0001f7e0 Drukuje"
STATUS_CONNECTED_LABEL = "Po\u0142\u0105czono"
STATUS_DISCONNECTED_LABEL = "Brak po\u0142\u0105czenia"
STATUS_LABEL = "Status"
STATUS_COMPUTER = "Komputer"
STATUS_MACHINE_ID = "Identyfikator maszyny"
STATUS_WAREHOUSE = "Magazyn"
STATUS_PRINTERS = "Drukarki"
STATUS_HEARTBEAT = "Sygnatura \u017cycia"
STATUS_POLLING = "Odpytywanie"
STATUS_VERSION = "Wersja"
STATUS_UPDATE = "Aktualizacja"
STATUS_LAST_ERROR = "\u26a0 Ostatni b\u0142\u0105d: {error}"

UPDATE_SECTION = "Aktualizacja"
UPDATE_CHECK = "Sprawd\u017a aktualizacje"
UPDATE_CURRENT_VERSION = "Aktualna wersja"
UPDATE_AVAILABLE_VERSION = "Dost\u0119pna wersja"
UPDATE_AVAILABLE_YES = "Aktualizacja dost\u0119pna"
UPDATE_AVAILABLE_NO = "Brak aktualizacji"
UPDATE_NOT_CHECKED = "Nie sprawdzono"
UPDATE_UP_TO_DATE = "\U0001f7e2 Aktualny"
UPDATE_AVAILABLE_BADGE = "\U0001f7e0 Dost\u0119pna aktualizacja"
UPDATE_UNKNOWN = "\U0001f534 Nieznana wersja"
UPDATE_NOT_CONNECTED = "Agent nie jest po\u0142\u0105czony z serwerem."
UPDATE_CHECKING = "Sprawdzanie aktualizacji\u2026"
UPDATE_FOUND = "Dost\u0119pna wersja {version}. Pobieranie mo\u017ce rozpocz\u0105\u0107 si\u0119 automatycznie w tle."
UPDATE_CURRENT = "Agent jest aktualny."
UPDATE_CHECKED = "Sprawdzono wersj\u0119 na serwerze."

# — Tray —
TRAY_OPEN = "Otw\u00f3rz Sasist Printer Agent"
TRAY_SYNC = "Synchronizuj drukarki"
TRAY_TEST_PAGE = "Wydruk testowy"
TRAY_RESTART = "Restart aplikacji"
TRAY_EXIT = "Wyj\u015bcie"

# — Setup wizard —
WIZARD_TITLE = "Sasist Printer Agent \u2014 konfiguracja"
WIZARD_HEADER = "Konfiguracja pocz\u0105tkowa"
WIZARD_STEP = "Krok {step} z {total}"
WIZARD_FINISH = "Zako\u0144cz konfiguracj\u0119"
WIZARD_SERVER_STEP = "Adres serwera"
WIZARD_KEY_STEP = "Klucz API"
WIZARD_TEST_STEP = "Test po\u0142\u0105czenia"
WIZARD_SUMMARY_STEP = "Podsumowanie"
WIZARD_SERVER_HINT = "Podaj adres serwera Sasist, z kt\u00f3rym agent b\u0105dzie si\u0119 \u0142\u0105czy\u0142."
WIZARD_SERVER_CARD = "URL serwera"
WIZARD_KEY_CARD = "Klucz API"
WIZARD_TEST_CARD = "Test po\u0142\u0105czenia"
WIZARD_CONNECT_CARD = "Po\u0142\u0105cz komputer"
WIZARD_SERVER_LINE = "Serwer: {url}"
WIZARD_KEY_MASKED = "Klucz API: ********"
WIZARD_TEST_RUNNING = "Test po\u0142\u0105czenia\u2026"
WIZARD_TEST_OK = "\U0001f7e2 Po\u0142\u0105czenie dzia\u0142a poprawnie."
WIZARD_PASTED = "Wklejono klucz ze schowka."
WIZARD_CLIPBOARD_FAIL = "Nie uda\u0142o si\u0119 odczyta\u0107 schowka."
WIZARD_COMPUTER_NAME = "Nazwa komputera:"
WIZARD_MACHINE_PENDING = "(zostanie przypisany)"
WIZARD_WAREHOUSE_PENDING = "(z rejestracji)"
WIZARD_FILL_BOTH = "Uzupe\u0142nij URL serwera i klucz API."
WIZARD_CONNECTING = "\u0141\u0105czenie\u2026"
WIZARD_SETUP_DONE = "Konfiguracja pocz\u0105tkowa zako\u0144czona."

# — Runtime / update (log messages shown in agent.log) —
LOG_VERSION_CHANGED = "Wykryto zmian\u0119 wersji (%s -> %s); ponowna rejestracja w backendzie"
LOG_PRINTER_SYNC = "Za\u017c\u0105dano synchronizacji drukarek"
LOG_UPDATE_DOWNLOAD_FAILED = "Nie uda\u0142o si\u0119 pobra\u0107 aktualizacji: %s"
LOG_UPDATE_INVALID_FILE = "Pobrany plik aktualizacji jest nieprawid\u0142owy: %s"
LOG_AGENT_NOT_FOUND = "Nie znaleziono agenta"


def log_filter_display(key: str) -> str:
    mapping = dict(LOG_FILTER_OPTIONS)
    return mapping.get(key.upper(), key)
