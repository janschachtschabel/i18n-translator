# i18n Translator

GUI-Tool zur Verwaltung von edu-sharing i18n-Übersetzungsdateien. Unterstützt alle drei Übersetzungsbereiche: Angular JSON, Mail-Templates und Metadatasets.

---

## Inhaltsverzeichnis

1. [Voraussetzungen](#voraussetzungen)
2. [Installation](#installation)
3. [Start](#start)
4. [Konfiguration](#konfiguration)
5. [Nutzung](#nutzung)
6. [Dateistruktur](#dateistruktur)
7. [Funktionen](#funktionen)
8. [KI-Übersetzung](#ki-übersetzung)
9. [API-Referenz](#api-referenz)
10. [Google Colab](#google-colab)

---

## Voraussetzungen

| Komponente | Mindestversion | Empfohlen |
|---|---|---|
| **Python** | 3.10 | 3.12 |
| **Node.js** | 18 | 20 LTS |
| **npm** | 9 | 10 |

Prüfen mit:

```powershell
python --version
node --version
npm --version
```

---

## Installation

### 1. Repository klonen

```powershell
git clone https://github.com/janschachtschabel/i18nTranslator.git
cd i18nTranslator
```

### 2. Backend einrichten

```powershell
cd backend
pip install -r requirements.txt
cd ..
```

Die `requirements.txt` enthält:
- `fastapi` – Web-Framework
- `uvicorn[standard]` – ASGI-Server
- `python-multipart` – Datei-Uploads
- `requests` – HTTP-Client für B-API

### 3. Frontend einrichten

```powershell
cd frontend
npm install
cd ..
```

> **Hinweis:** `npm install` lädt alle React/Vite/Tailwind-Abhängigkeiten herunter (~300 MB in `node_modules/`). Dies muss nur einmal ausgeführt werden.

---

## Start

### Option A – PowerShell-Skript (empfohlen)

Startet Backend und Frontend automatisch in getrennten Prozessen:

```powershell
# Ohne KI-Funktionen
.\start.ps1

# Mit KI-Übersetzung (B_API_KEY erforderlich)
$env:B_API_KEY = "ihr-api-key"
.\start.ps1
```

Öffnet automatisch **http://localhost:5173** im Browser.

---

### Option B – Manuell (zwei Terminals)

**Terminal 1 – Backend (FastAPI):**

```powershell
cd backend
uvicorn main:app --reload --port 8000
```

- Läuft auf **http://localhost:8000**
- `--reload` aktiviert automatisches Neuladen bei Code-Änderungen
- Interaktive API-Dokumentation: **http://localhost:8000/docs**

**Terminal 2 – Frontend (Vite Dev Server):**

```powershell
cd frontend
npm run dev
```

- Läuft auf **http://localhost:5173**
- Hot Module Replacement (HMR) – Änderungen am Frontend-Code werden sofort sichtbar
- Alle `/api`-Anfragen werden automatisch an Port 8000 weitergeleitet (Vite-Proxy)

Dann im Browser öffnen: **http://localhost:5173**

---

### Option C – Google Colab

Für den Einsatz ohne lokale Installation: [i18nTranslator-Colab.ipynb](i18nTranslator-Colab.ipynb)  
Baut das Frontend und startet alles über einen öffentlichen Cloudflare-Tunnel.

---

## Konfiguration

### Umgebungsvariablen

| Variable | Beschreibung | Pflicht |
|---|---|---|
| `B_API_KEY` | API Key für KI-Übersetzung (B-API) | Nein |
| `B_API_MODEL` | Modell-Override (Standard: `gpt-4.1-mini`) | Nein |

```powershell
# PowerShell – für aktuelle Sitzung
$env:B_API_KEY = "sk-..."

# Dauerhaft in .env-Datei (im backend/-Verzeichnis)
# .env:
# B_API_KEY=sk-...
```

### Referenzsprache

Die Referenzsprache (Standard: `de`) ist in den **Einstellungen** (⚙ unten links) konfigurierbar. Sie bestimmt:
- Welche Spalte als Vorlage für KI-Übersetzungen dient
- Gegen welche Sprache Template-Variablen (`{{var}}`) geprüft werden

---

## Nutzung

Nach dem Start öffnet sich die Web-Oberfläche unter **http://localhost:5173**.

### Navigation

Die linke Seitenleiste zeigt alle Übersetzungsbereiche:

| Bereich | Inhalt |
|---|---|
| **Angular JSON** | JSON-Sprachdateien (pro Kategorie) |
| **Mail Templates** | XML-basierte E-Mail-Vorlagen |
| **Metadatasets** | Java `.properties`-Dateien (ISO-8859-1) |
| Eigene Bereiche | Über Einstellungen konfigurierbar |

### Übersetzen

1. Bereich und (falls vorhanden) Kategorie/Gruppe auswählen
2. Zeile anklicken → Inline-Editor öffnet sich
3. Text eingeben, **Strg+Enter** zum Speichern oder **Save**-Button
4. KI-Vorschlag: **Zauberstab-Icon** (🪄) neben dem Feld

### Filter

In der Toolbar jedes Bereichs stehen zwei Filter bereit:

| Button | Funktion |
|---|---|
| **Missing** (rot wenn aktiv) | Nur Zeilen mit fehlenden Übersetzungen anzeigen |
| **Errors** (gelb wenn aktiv) | Nur Zeilen mit `{{Variable}}`-Abweichungen anzeigen |

### Fehlende Felder automatisch füllen (KI)

Unterhalb der Toolbar erscheint automatisch eine blaue Leiste, wenn fehlende Einträge vorhanden sind:

```
🪄 AI fill missing:  de-informal (12)   nl_NL (5)
```

Ein Klick auf eine Sprache füllt alle fehlenden Felder via KI und speichert sofort.

### Neue Sprache hinzufügen

**+ Language**-Button in der Toolbar → Sprachcode eingeben (z. B. `fr_FR`) und optionale Beschreibung für die KI (z. B. `French (France), formal register`).

---

## Dateistruktur

```
i18nTranslator/
├── backend/
│   ├── main.py              # FastAPI-Anwendung, alle Endpunkte
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.tsx          # Hauptanwendung, Sidebar-Navigation
│   │   ├── api/index.ts     # Axios API-Client
│   │   ├── types/index.ts   # TypeScript-Typen
│   │   └── components/
│   │       ├── JsonView.tsx         # Angular JSON Bereich
│   │       ├── MailView.tsx         # Mail Templates Bereich
│   │       ├── MdsView.tsx          # Metadatasets Bereich
│   │       ├── TranslationTable.tsx # Geteilte Tabellen-Komponente
│   │       ├── AiFillPanel.tsx      # KI-Füll-Panel
│   │       ├── StatsView.tsx        # Statistiken
│   │       ├── SettingsView.tsx     # Einstellungen
│   │       └── Tooltip.tsx          # Tooltip-Komponente
│   ├── package.json
│   └── vite.config.ts
├── data/
│   └── 1.0.0/
│       ├── json/            # Angular JSON-Dateien
│       ├── mailtemplates/   # XML Mail-Templates
│       └── metadatasets/i18n/  # Java .properties-Dateien
├── backups/                 # Automatische Backups (max. 10)
├── start.ps1                # PowerShell-Startskript
└── i18nTranslator-Colab.ipynb  # Google Colab Notebook
```

### Datei-Formate

| Bereich | Pfad | Format | Sprachmuster |
|---|---|---|---|
| Angular JSON | `data/1.0.0/json/{kategorie}/` | Verschachteltes JSON | `de.json`, `en.json`, `de-informal.json` |
| Mail Templates | `data/1.0.0/mailtemplates/` | XML mit CDATA | `templates.xml`, `templates_de_DE.xml` |
| Metadatasets | `data/1.0.0/metadatasets/i18n/` | Java `.properties` | `mds.properties`, `mds_de_DE.properties` |

> **Hinweis:** `.properties`-Dateien werden in ISO-8859-1 gelesen und gespeichert (Java-Konvention).

---

## Funktionen

| Funktion | Beschreibung |
|---|---|
| **Nebeneinander-Ansicht** | Alle Sprachen als Spalten, fehlende Werte rot hervorgehoben |
| **Inline-Bearbeitung** | Zelle anklicken, Strg+Enter zum Speichern |
| **Template-Variablen-Prüfung** | Warnung bei `{{variable}}`-Abweichungen zur Referenzsprache |
| **KI-Vorschlag** | Zauberstab-Icon pro Zelle, übersetzt aus Referenzsprache |
| **KI-Batch-Fill** | Alle fehlenden Felder einer Sprache auf einmal füllen |
| **Sprachen verwalten** | Sprachen ein-/ausblenden, neue Sprachen hinzufügen |
| **Filter: Missing** | Nur Zeilen mit fehlenden Übersetzungen |
| **Filter: Errors** | Nur Zeilen mit Template-Variablen-Fehlern (mit Detail-Tooltip) |
| **Suche** | Filtern nach Schlüsselname oder Wert |
| **Sortierung** | Dateireihenfolge oder alphabetisch |
| **Statistiken** | Fehlende Einträge, Sprachabdeckung, Qualitätsindikatoren |
| **Download** | Bereich als ZIP herunterladen |
| **Backup** | Manuelles Backup in `backups/`, automatisch max. 10 |
| **Sprachbeschreibungen** | Freitext-Beschreibungen für Sprachen (verbessern KI-Qualität) |

---

## KI-Übersetzung

### Einrichtung

```powershell
$env:B_API_KEY = "ihr-api-key"
```

Modell: `gpt-4.1-mini`  
Modell überschreiben: `$env:B_API_MODEL = "gpt-4o"`

### Verwendung

**Einzelne Zelle:** Zauberstab-Icon (🪄) in einer Zelle klicken  
**Alle fehlenden Felder:** Blaue Leiste unterhalb der Toolbar → Sprache klicken  
**Mit Review:** KI-Panel (✨ AI-Button) für Vorschau vor dem Speichern

### Sprachbeschreibungen für bessere Ergebnisse

In den **Einstellungen** können für jede Sprache Beschreibungen hinterlegt werden:

```
de-informal → "Deutsch, informelle Anrede (du)"
nl_NL       → "Niederländisch (Niederlande), formell"
```

Diese werden als Kontext an die KI übergeben und verbessern die Übersetzungsqualität.

---

## API-Referenz

Interaktive Dokumentation: **http://localhost:8000/docs**

### JSON-Bereich

| Methode | Endpunkt | Beschreibung |
|---|---|---|
| `GET` | `/api/json/categories` | Liste aller Kategorien |
| `GET` | `/api/json/{kategorie}` | Einträge einer Kategorie (flach) |
| `PUT` | `/api/json/save` | Sprachdatei speichern |
| `POST` | `/api/json/add-language` | Neue Sprache hinzufügen |
| `GET` | `/api/json/{kategorie}/quality` | Fehlende + fehlerhafte Einträge |

### Mail-Templates

| Methode | Endpunkt | Beschreibung |
|---|---|---|
| `GET` | `/api/mail` | Alle Templates mit Übersetzungen |
| `PUT` | `/api/mail/save` | Sprachdatei speichern |
| `POST` | `/api/mail/add-language` | Neue Sprache hinzufügen |

### Metadatasets

| Methode | Endpunkt | Beschreibung |
|---|---|---|
| `GET` | `/api/mds/groups` | Liste aller Gruppen |
| `GET` | `/api/mds/{gruppe}` | Einträge einer Gruppe |
| `PUT` | `/api/mds/save` | Sprachdatei speichern |
| `POST` | `/api/mds/add-language` | Neue Sprache hinzufügen |

### Allgemein

| Methode | Endpunkt | Beschreibung |
|---|---|---|
| `GET` | `/api/stats` | Statistiken (fehlende Einträge, Abdeckung) |
| `POST` | `/api/backup` | Backup erstellen |
| `GET` | `/api/download/{bereich}` | ZIP-Download (`json`, `mail`, `mds`) |
| `GET` | `/api/config` | App-Konfiguration lesen |
| `PUT` | `/api/config` | App-Konfiguration speichern |

### KI-Endpunkte

| Methode | Endpunkt | Beschreibung |
|---|---|---|
| `POST` | `/api/ai/translate` | Einzelnen Text übersetzen |
| `POST` | `/api/ai/fill-empty` | Alle fehlenden Felder einer Sprache füllen |
| `POST` | `/api/ai/review` | Bestehende Übersetzungen prüfen |

---

## Google Colab

Das Notebook `i18nTranslator-Colab.ipynb` ermöglicht den Start ohne lokale Installation:

1. Notebook in Google Colab öffnen
2. `B_API_KEY` als Colab Secret hinterlegen (🔑-Symbol links)
3. Alle Zellen der Reihe nach ausführen
4. Öffentliche URL (`https://xxxx.trycloudflare.com`) am Ende von Zelle 5 aufrufen

Das Frontend wird gebaut und gemeinsam mit dem Backend über Port 8000 ausgeliefert. Der Cloudflare-Tunnel macht die App öffentlich erreichbar.

---

## Backups

Backups werden in `backups/` (Projektverzeichnis) gespeichert, nicht in `data/`.  
Es werden automatisch maximal 10 Backups behalten; ältere werden gelöscht.

Manuelles Backup: **Einstellungen → Backup erstellen**
