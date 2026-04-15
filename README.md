# PATHFINDER

PATHFINDER ist eine kioskoptimierte Wegfindungs-App mit Admin-Oberfläche. Das Projekt ist so vorbereitet, dass du es direkt in ein GitHub-Repository hochladen und danach in Portainer als Stack direkt aus dem Repository deployen kannst.

## Überblick

- Frontend: React, Vite, TypeScript
- Backend: Node.js, Express, TypeScript
- Datenbank: SQLite mit persistenter Volume
- Reverse Proxy: Nginx
- Deployment: Docker Compose, Portainer Stack aus Git-Repository

## Funktionen

- Kiosk-Suche nach USID
- Ergebnisansicht mit Standort- und Bildinformationen
- Feedback-Erfassung pro Suche
- Admin-Login mit geschütztem Bereich
- Räume anlegen, ändern, löschen, als Excel-Template exportieren und wieder importieren
- Mehrfach-Bild-Upload mit Suche, Auswahl und Umbenennen für Raumansichten
- XLSX-Export für Feedback und Auswertungen
- Optionaler Erstimport aus einer vorhandenen `db.json` bei leerer Datenbank

## Projektstruktur

- frontend: React/Vite-Client für Kiosk und Admin-Oberfläche
- backend: Express-API, SQLite und Upload-Verwaltung
- infra/nginx: Nginx-Konfiguration für Produktion
- compose.yaml: kompletter Produktions-Stack für Docker und Portainer

`compose.yaml` ist die primäre Produktionsdatei. `docker-compose.yml` spiegelt dieselben Persistenz-Pfade, damit auch Tools, die standardmäßig diese Datei wählen, Datenbank, Uploads und Templates korrekt in Volumes schreiben.

## Voraussetzungen

Für lokale `.env`-Nutzung:

- `.env.example` nach `.env` kopieren und dort `ADMIN_PASSWORD` setzen

Für lokale Entwicklung:

- Node.js 24 oder neuer
- npm

Für Deployment:

- Docker Engine oder Docker-kompatible Runtime
- Portainer mit Zugriff auf das GitHub-Repository

## Lokale Entwicklung

1. Abhängigkeiten im Hauptordner installieren:

```powershell
npm install
```

1. Entwicklungsserver starten:

```powershell
npm run dev
```

1. App im Browser öffnen:

- Kiosk: `http://localhost:5173/`
- Admin: `http://localhost:5173/admin`

Im Dev-Modus läuft das Frontend auf Port 5173 und das Backend auf Port 3000. API- und Upload-Anfragen werden vom Vite-Server an das Backend weitergeleitet.

## Repository für GitHub vorbereiten

Die wichtigsten Punkte sind bereits erledigt:

- Build- und Laufzeitcontainer sind vorhanden
- Persistente Daten liegen in Docker-Volumes statt in Repo-Bind-Mounts
- Temporäre Dateien, SQLite-Dateien, Uploads und .env sind in .gitignore berücksichtigt
- Das Produktions-Compose kann direkt von Portainer aus dem Repository gelesen werden

Wenn du das Repository jetzt nach GitHub hochladen willst, sind das die üblichen Schritte:

```powershell
git init
git add .
git commit -m "Initial PATHFINDER release"
git branch -M main
git remote add origin https://github.com/DEIN-USER/DEIN-REPO.git
git push -u origin main
```

## Deployment mit Docker Compose

1. Die Beispieldatei kopieren:

```powershell
Copy-Item .env.example .env
```

1. In .env mindestens diese Werte anpassen:

- ADMIN_PASSWORD: starkes Passwort für den Admin-Bereich
- APP_PORT: externer HTTP-Port, standardmäßig 9110
- COOKIE_SECURE: auf true setzen, wenn die App hinter HTTPS läuft
- FRONTEND_ORIGIN: nur setzen, wenn Frontend und API auf unterschiedlichen Origins laufen

1. Stack starten:

```powershell
docker compose up --build -d
```

1. App aufrufen:

- Kiosk: `http://SERVER-IP:APP_PORT/`
- Admin: `http://SERVER-IP:APP_PORT/admin`

## Portainer-Installation direkt aus GitHub

1. Repository nach GitHub pushen.

1. In Portainer zu Stacks wechseln und Add stack auswählen.

1. Als Build method die Repository-Variante wählen.

1. Diese Werte eintragen:

- Repository URL: `https://github.com/DEIN-USER/DEIN-REPO.git`
- Repository reference: refs/heads/main oder dein gewünschter Branch
- Compose path: compose.yaml

1. Unter Environment variables mindestens setzen:

- ADMIN_PASSWORD=ein-starkes-passwort
- APP_PORT=9110
- COOKIE_SECURE=true bei HTTPS, sonst false
- FRONTEND_ORIGIN leer lassen, solange alles über dieselbe Domain läuft

1. Stack deployen.

Danach baut Portainer beide Images direkt aus dem Repository und startet den kompletten Stack. Datenbank und Uploads landen in benannten Docker-Volumes und bleiben bei Container-Neustarts erhalten.

Seit dem aktuellen Stack-Setup werden auch Building-Templates in einem eigenen Volume gehalten. Beim ersten Start werden die mitgelieferten Standard-Templates automatisch in dieses Volume kopiert.

## Daten und Persistenz

- SQLite-Datenbank: Docker-Volume pathfinder_data
- Uploads: Docker-Volume pathfinder_uploads
- Building-Templates: Docker-Volume pathfinder_building_templates
- Optionaler Erstimport aus `backend/legacy/db.json` oder `db.json`: Wird nur ausgeführt, wenn die Datenbank noch leer ist

Wenn ein älterer Stack ohne die `PATHFINDER_*`-Pfadvariablen gestartet wurde, konnten SQLite-Datei und Uploads im Container-Dateisystem statt im Volume landen. In diesem Fall bleiben die Volumes zwar bestehen, enthalten aber nicht die produktiven Daten.

Wichtig: Wenn der Stack bereits einmal mit leerer Datenbank gestartet wurde, wird der Legacy-Import danach nicht erneut ausgeführt. In dem Fall musst du entweder importieren oder das Daten-Volume bewusst neu anlegen.

## Wichtige Umgebungsvariablen

- ADMIN_PASSWORD: Passwort für /admin
- APP_PORT: Host-Port für Nginx
- COOKIE_SECURE: true für HTTPS-Betrieb, sonst false
- FRONTEND_ORIGIN: optionales CORS-Allowlisting für getrennte Frontend-/API-Domains

## Betrieb auf dem iPad

- Die App ist auf Safari im Kiosk-Stil ausgelegt.
- Für appähnliches Verhalten kann die URL über Zum Home-Bildschirm gespeichert werden.
- Manifest und Apple-Tags sind bereits eingebunden.
- Für den Kiosk-Betrieb sollte das iPad im Querformat bleiben; die Web-App ist auf Landscape optimiert.
- Für einen echten Einzelgerät-Kiosk zusätzlich iPad Guided Access bzw. Geführten Zugriff aktivieren, damit niemand Safari oder die App versehentlich verlässt.
- Die Kiosk-Ansicht hält den Bildschirm nach Möglichkeit per Wake Lock aktiv und reduziert versehentliche Touch-/Safari-Nebeneffekte.
- Die Admin-Seite ist für Bedienung vom PC gedacht; ein Aufruf von `/admin` auf dem iPad wird zurück auf den Kiosk umgeleitet.

## Kurze Anleitung für den produktiven Einsatz

1. Repository nach GitHub hochladen.
1. In Portainer einen Stack aus dem Repository anlegen.
1. ADMIN_PASSWORD setzen.
1. Falls HTTPS vorhanden ist, COOKIE_SECURE=true setzen.
1. Stack deployen.
1. Die App unter `http://SERVER-IP:PORT/` testen und danach den Admin-Bereich prüfen.

## Troubleshooting

- Leere Startseite oder API-Fehler: Prüfen, ob der backend-Service läuft und Portainer beide Images erfolgreich gebaut hat.
- `502 Bad Gateway` bei `/api/...`: Das ist fast immer ein Backend-Problem, nicht das Frontend. Zuerst `docker compose logs backend` oder die Backend-Logs in Portainer prüfen und dann `/api/health` direkt testen.
- Login funktioniert nicht: ADMIN_PASSWORD in Portainer oder .env prüfen und Stack neu deployen.
- Browser-Fehler mit `chrome-extension://...` kommen von Extensions und sind für PATHFINDER in der Regel irrelevant.
- Raumimport: Im Admin-Bereich zuerst das Excel-Template exportieren, dann dieselben Spalten im ersten Arbeitsblatt beibehalten und die Datei wieder importieren.
- Viele Bilder im Admin-Bereich: Die Bildbibliothek lädt nur eine Seite gleichzeitig und kann über die Suche gefiltert werden.
- Bilder fehlen nach Redeploy: sicherstellen, dass die Volumes nicht gelöscht wurden.
- Templates fehlen nach Redeploy: sicherstellen, dass das Volume `pathfinder_building_templates` vorhanden ist und der Stack auf dem aktuellen Stand läuft.
- Daten trotz vorhandener Volumes weg: prüfen, ob Portainer wirklich `compose.yaml` oder die aktualisierte `docker-compose.yml` verwendet. Ältere Deployments ohne `PATHFINDER_DATA_DIR` und `PATHFINDER_UPLOADS_DIR` haben Daten im Container statt im Volume gespeichert.
- Optionaler Erstimport greift nur beim allerersten Start mit leerer Datenbank und nur wenn eine `db.json` vorhanden ist.

## Hinweise

- Das Fallback-Passwort ist nur für die erste Inbetriebnahme gedacht und darf in Produktion nicht so bleiben.
