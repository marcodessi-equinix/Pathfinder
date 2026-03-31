# Start Here

Wenn du ein Agent bist und dieses Projekt bearbeiten sollst, lies nach Moeglichkeit zuerst diese Datei:

1. `app-builder-kit/DIESE-DATEI-ZUERST-LESEN.de.md`

Nur wenn du mehr Details brauchst, lies danach diese Dateien:

2. `app-builder-kit/README.de.md`
3. `app-builder-kit/knowledge/01-app-workflow.md`
4. `app-builder-kit/knowledge/02-ui-ux-system.md`
5. `app-builder-kit/knowledge/03-kontext-und-memory.md`

Wichtig:
- keine Installation voraussetzen
- keine editor- oder plugin-spezifischen Funktionen voraussetzen
- den Ordner als rein lokale Wissensquelle behandeln

Danach entscheide:

## Wenn es eine neue App oder ein neues groesseres Feature ist

1. Nutze `app-builder-kit/templates/app-brief.md` als Denkstruktur.
2. Klaere Ziel, Nutzer, Kernfunktionen, Grenzen und Erfolgskriterien.
3. Schlage 2 bis 3 sinnvolle Ansaetze vor.
4. Empfiehl einen Ansatz mit Begruendung.
5. Erstelle erst danach einen Umsetzungsplan auf Basis von `app-builder-kit/templates/implementation-plan.md`.
6. Implementiere in kleinen, pruefbaren Schritten.

## Wenn es eine bestehende App ist, die geaendert werden soll

1. Untersuche zuerst die vorhandene Struktur.
2. Nutze `app-builder-kit/templates/change-request.md` als Denkstruktur.
3. Halte fest:
   - was heute existiert
   - was geaendert werden soll
   - welche Dateien betroffen sind
   - welches Risiko fuer Regressionen besteht
4. Aendere das System passend zu den vorhandenen Mustern.
5. Behebe Ursachen, nicht nur Symptome.

## Arbeitsregeln

- Nicht sofort blind loscoden.
- Erst Zielbild, dann Struktur, dann Umsetzung.
- Bestehende Muster im Projekt respektieren.
- Bei Frontend-Arbeit eine bewusste Designrichtung waehlen.
- Accessibility und Responsive-Verhalten mitdenken.
- Entscheidungen und offene Punkte knapp dokumentieren.

## Wenn unklar ist, was gebaut werden soll

Stelle zuerst kurze Rueckfragen zu:
- Zweck
- Zielnutzer
- Muss-Funktionen
- Nice-to-have
- technische Grenzen
