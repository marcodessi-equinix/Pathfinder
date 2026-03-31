# Diese Datei zuerst lesen

Wenn du eine KI oder ein Agent bist und in diesem Projekt arbeiten sollst, dann lies nur diese Datei als Einstieg.

Diese Datei ist absichtlich AI-neutral.
Sie ist nicht an Claude Code, Copilot, Cursor oder ein bestimmtes Plugin gebunden.

## Zweck dieses Ordners

Dieser Ordner ist ein lokal kopierbares App-Bau-Kit.

Ziel:
- neue Apps sauber planen und bauen
- bestehende Apps gezielt und risikoarm anpassen
- UI nicht generisch, sondern bewusst gestalten
- wichtige Entscheidungen und Arbeitskontext sauber festhalten

Wichtig:
- keine Installation noetig
- keine Online-Anbindung noetig
- keine Plugins noetig
- nur lesen und danach entsprechend arbeiten

## Wie du diesen Ordner benutzen sollst

Arbeitsregel:
- Behandle diesen Ordner als Projektleitfaden.
- Nutze zuerst diese Datei als Quelle fuer dein Verhalten.
- Lies weitere Dateien aus diesem Ordner nur dann, wenn du fuer die Aufgabe mehr Details brauchst.

## Was du als KI zuerst tun sollst

1. Erkenne, ob es um eine neue App, ein neues Feature oder eine Aenderung an einer bestehenden App geht.
2. Nicht sofort implementieren.
3. Zuerst Problem, Ziel, Nutzer, Umfang und Grenzen klaeren.
4. Danach einen sinnvollen Ansatz vorschlagen.
5. Erst dann mit einem kleinen, pruefbaren Plan oder einer kleinen Umsetzung beginnen.

## Wenn es um eine neue App oder ein neues groesseres Feature geht

Arbeite in dieser Reihenfolge:

1. Ziel verstehen
2. Nutzer verstehen
3. Muss-Funktionen von Nice-to-have trennen
4. 2 bis 3 moegliche Ansaetze benennen
5. einen Ansatz empfehlen und begruenden
6. daraus einen kleinen Umsetzungsplan machen
7. in kleinen, testbaren Schritten bauen

Rueckfragen, wenn noetig:
- Was genau soll gebaut werden?
- Fuer wen ist es gedacht?
- Was muss in Version 1 auf jeden Fall drin sein?
- Was soll bewusst noch nicht gebaut werden?
- Gibt es technische Vorgaben?

## Wenn es um eine bestehende App geht

Arbeite in dieser Reihenfolge:

1. vorhandene Struktur untersuchen
2. betroffene Dateien und Systeme eingrenzen
3. bestehende Muster respektieren
4. Ursache statt Symptom identifizieren
5. Aenderung klein und sauber umsetzen
6. Nebenwirkungen pruefen

Vor jeder groesseren Aenderung zuerst verstehen:
- was existiert bereits
- was genau soll anders werden
- welches Risiko fuer Regressionen besteht
- welche Dateien direkt oder indirekt betroffen sind

## Arbeitsprinzipien

- Nicht blind loscoden.
- Erst verstehen, dann strukturieren, dann umsetzen.
- Bestehende Muster respektieren.
- Nur so viel aendern wie noetig.
- Root Cause bevorzugen.
- Kleine, nachvollziehbare Schritte bevorzugen.
- Entscheidungen knapp dokumentieren, wenn die Aufgabe groesser ist.

## UI- und UX-Regeln

Wenn die Aufgabe eine Oberflaeche betrifft:

1. Bestimme zuerst den Produkttyp.
2. Waehle dann eine passende visuelle Richtung.
3. Definiere klare Rollen fuer Farben, Typografie und Interaktion.
4. Pruefe Accessibility und Responsive-Verhalten.

Typische Produkttypen:
- SaaS oder Business Tool
- Dashboard oder Analytics
- Landing Page oder Marketing Site
- AI Tool oder Chat-App
- Wellness oder Lifestyle
- E-Commerce oder Buchung
- Kreativprodukt oder Portfolio

Typische Stilrichtungen:
- SaaS, Tools, Admin: klar, ruhig, strukturiert
- Analytics: datenfokussiert, lesbar, hierarchisch
- Wellness: weich, organisch, ruhig
- AI-Produkt: modern, reduziert, fokussiert
- Kreativ: mutiger, markanter, bewusster

Immer beachten:
- klare Typografie-Hierarchie
- ausreichender Kontrast
- sichtbare Focus-States
- mobile Nutzbarkeit ohne Hover-Zwang
- Touch-Ziele nicht zu klein
- keine austauschbare Standardoptik ohne Produktbezug

Vermeiden:
- generische AI-Gradienten ohne Grund
- zu viele Akzentfarben
- schwachen Textkontrast
- Bewegung ohne Zweck
- reine Farbkommunikation ohne Text oder Icon

## Kontext und Wissensspur

Wenn die Aufgabe groesser ist, halte nach wichtigen Schritten kurz fest:
- was entschieden wurde
- was gebaut oder geaendert wurde
- was noch offen ist
- welche Risiken oder Besonderheiten bestehen

Wenn im Projekt bereits Doku-Dateien existieren, aktualisiere sie knapp und sinnvoll.

## Was in diesem Ordner sonst noch liegt

Diese Dateien koennen bei Bedarf gelesen werden:

- `README.de.md`
  Ueberblick ueber den Ordner

- `START-HERE.de.md`
  kurze alternative Einstiegsversion

- `PROMPT-VORLAGE.de.txt`
  fertiger Text fuer die Nutzeranweisung

- `knowledge/01-app-workflow.md`
  kompakter Build- und Aenderungsworkflow

- `knowledge/02-ui-ux-system.md`
  detailliertere UI/UX-Richtung

- `knowledge/03-kontext-und-memory.md`
  Regeln fuer Verlauf, Entscheidungen und Arbeitskontext

- `templates/app-brief.md`
  Denkstruktur fuer neue Apps oder groessere Features

- `templates/implementation-plan.md`
  Denkstruktur fuer einen Umsetzungsplan

- `templates/change-request.md`
  Denkstruktur fuer Aenderungen an bestehenden Apps

- `playbooks/`
  groessere, konkrete Vorgehensweisen fuer typische Arbeitssituationen

- `app-types/`
  Startpunkte fuer typische Produkttypen wie SaaS, Dashboard, Landing Page oder Mobile App

- `checklists/`
  knappe Listen fuer Vorpruefung, UI-Review und Abschluss

- `architecture/`
  einfache Strukturhilfen fuer Frontend, Backend und APIs

- `ui-patterns/`
  konkrete Hinweise fuer haeufige UI-Bereiche wie Formulare, Dashboards und Landing Sections

## Wie du mit den Templates umgehen sollst

### Fuer neue Apps

Nutze bei Bedarf `templates/app-brief.md`, um zu strukturieren:
- Ziel
- Zielnutzer
- Hauptproblem
- Muss-Funktionen
- Dinge ausserhalb von Version 1
- Plattform
- UI-Richtung
- technische Grenzen
- Erfolgskriterien

Danach nutze `templates/implementation-plan.md`, wenn mehrere Schritte noetig sind.

### Fuer bestehende Apps

Nutze bei Bedarf `templates/change-request.md`, um zu strukturieren:
- aktueller Zustand
- gewuenschte Aenderung
- betroffene Bereiche
- Risiken
- wahrscheinliche Dateien
- Verifikation

## Welche Zusatzdateien du wann lesen sollst

### Neue App

Lies bei Bedarf zusaetzlich:
- `playbooks/neue-app.md`
- eine passende Datei aus `app-types/`
- `checklists/pre-build-checklist.md`

### Bestehende App aendern

Lies bei Bedarf zusaetzlich:
- `playbooks/bestehende-app-aendern.md`
- `playbooks/debugging-und-root-cause.md`, falls ein Fehler vorliegt
- `checklists/release-checklist.md`

### Frontend oder Redesign

Lies bei Bedarf zusaetzlich:
- `playbooks/frontend-redesign.md`
- `ui-patterns/forms-and-flows.md`
- `ui-patterns/dashboard-patterns.md`
- `ui-patterns/landing-page-sections.md`
- `checklists/ui-review-checklist.md`

### Groessere Strukturarbeit

Lies bei Bedarf zusaetzlich:
- `architecture/frontend-structure.md`
- `architecture/backend-api-structure.md`
- `templates/file-map.md`
- `templates/test-plan.md`

## Gewuenschtes Verhalten in deiner ersten Antwort

Wenn die Aufgabe noch unklar ist:
- stelle kurze Rueckfragen

Wenn die Aufgabe klar genug ist:
- fasse knapp zusammen, was du verstanden hast
- nenne den naechsten sinnvollen Schritt
- beginne erst danach mit Planung oder Analyse

## Kurzfassung

Wenn du nur eines aus dieser Datei mitnimmst, dann dies:

- erst verstehen
- dann strukturieren
- dann bewusst gestalten
- dann klein und sauber umsetzen
- dann pruefen
