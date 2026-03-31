# App Builder Kit

Dieses Kit ist ein kopierbarer Wissens- und Anweisungsordner fuer neue Projekte.

Ziel:
- Du kopierst nur diesen Ordner in ein Projekt.
- Danach sagst du der KI nur noch, dass sie eine einzige Datei lesen soll.
- Der Agent bekommt damit einen brauchbaren Workflow, UI/UX-Leitlinien und eine saubere Vorgehensweise fuer neue Apps oder fuer Anpassungen an bestehenden Apps.

Wichtig:
- keine Installation
- kein Plugin
- keine Claude-, Copilot- oder Cursor-Pflicht
- nur lokal kopieren und lesen lassen

Das Kit ist aus drei Repos verdichtet:
- `claude-mem`: fuer Kontext, Entscheidungsdokumentation und Arbeitsverlauf
- `superpowers`: fuer sauberen Build-Workflow, Planung, TDD und Reviews
- `ui-ux-pro-max`: fuer UI/UX-Richtung, Stil, Farben, Typografie und Accessibility

Das Ergebnis ist aber bewusst AI-neutral formuliert.

Version 2 dieses Kits ist groesser als die erste Fassung und enthaelt jetzt neben dem Kernleitfaden auch Playbooks, App-Typen, Checklisten, Strukturhilfen und zusaetzliche Templates.

## Empfohlene Nutzung

### Standardnutzung fuer jede KI

1. Ordner `app-builder-kit` in das Zielprojekt kopieren.
2. Der KI nur diesen Satz geben:
   `Bitte lies zuerst app-builder-kit/DIESE-DATEI-ZUERST-LESEN.de.md. Dort steht alles, was du fuer dieses Projekt wissen musst.`
3. Danach das eigentliche Ziel nennen, z. B.:
   - neue App bauen
   - Landing Page bauen
   - bestehende App erweitern
   - bestehende UI modernisieren
   - Bug fixen und Verhalten verbessern

### Optional: editor-spezifische Extras

Im Unterordner `into-project-root/.github/` liegen zusaetzliche Dateien fuer Editoren oder Agenten, die `.github`-Anweisungen verstehen.

Diese Extras sind optional.
Fuer dein Ziel sind sie nicht noetig.

## Wichtigste Dateien

- `DIESE-DATEI-ZUERST-LESEN.de.md`
  Die zentrale Master-Datei fuer jede KI

- `START-HERE.de.md`
  Kurze technische Einstiegsversion

- `PROMPT-VORLAGE.de.txt`
  Fertiger Text, den du an den Agenten schicken kannst

- `knowledge/01-app-workflow.md`
  Bau- und Aenderungsworkflow

- `knowledge/02-ui-ux-system.md`
  Designsystem-Regeln und UI/UX-Leitlinien

- `knowledge/03-kontext-und-memory.md`
  Wie Entscheidungen, Fortschritt und Aenderungen sauber festgehalten werden

- `templates/app-brief.md`
  Vorlage fuer neue Apps oder groessere Features

- `templates/implementation-plan.md`
  Vorlage fuer einen umsetzbaren Arbeitsplan

- `templates/change-request.md`
  Vorlage fuer Anpassungen an einer bestehenden App

- `playbooks/`
  groessere Leitfaeden fuer typische Aufgaben

- `app-types/`
  Startwissen fuer typische App-Klassen

- `checklists/`
  Prueflisten fuer Planung, UI und Abschluss

- `architecture/`
  einfache Strukturhilfen fuer Frontend und Backend

- `ui-patterns/`
  konkrete UI-Muster fuer haeufige Oberflaechen

## Was das Kit absichtlich nicht macht

- Es ersetzt kein echtes App-Framework.
- Es installiert nichts automatisch.
- Es kopiert nicht blind Quellcode aus den drei Repos.

Stattdessen liefert es:
- bessere Arbeitsweise
- klare Designrichtung
- vernuenftige Projektstruktur fuer Agentenarbeit
- wiederverwendbare Templates

## Empfehlung

Wenn du ein neues Projekt startest, sage dem Agenten immer zuerst:

`Bitte lies zuerst app-builder-kit/DIESE-DATEI-ZUERST-LESEN.de.md und arbeite danach.`
