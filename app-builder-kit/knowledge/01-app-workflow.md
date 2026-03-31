# App Workflow

Diese Datei fasst die nuetzlichsten Arbeitsprinzipien aus dem Superpowers-Repo zusammen, aber deutlich kompakter und praxisnah fuer normale Projekte.

## Grundidee

Ein Agent soll nicht direkt in Code springen, sondern in dieser Reihenfolge arbeiten:

1. Verstehen
2. Strukturieren
3. Planen
4. Umsetzen
5. Pruefen
6. Nachschaerfen

## Fuer neue Apps oder neue Features

### Phase 1: Ziel klaeren

Vor dem Bauen klarmachen:
- Was wird gebaut?
- Fuer wen?
- Was ist die kleinste sinnvolle erste Version?
- Was gehoert bewusst nicht in die erste Version?

### Phase 2: Optionen vergleichen

Statt nur einen Weg zu nehmen:
- 2 bis 3 moegliche Ansaetze benennen
- Vor- und Nachteile kurz erklaeren
- einen klaren Favoriten empfehlen

### Phase 3: Design und Struktur festlegen

Bevor Dateien erzeugt werden:
- Hauptbereiche der App festlegen
- Datenfluss grob beschreiben
- kritische States und Fehlerfaelle benennen
- Teststrategie grob festlegen

### Phase 4: Umsetzungsplan schreiben

Ein guter Plan ist:
- in kleine Schritte zerlegt
- nach Dateien oder Verantwortungen getrennt
- testbar
- nachvollziehbar

### Phase 5: Umsetzung in kleinen Schritten

Empfohlen:
- zuerst kleinste lauffaehige Variante
- dann schrittweise ausbauen
- riskante Teile frueh pruefen

## Fuer bestehende Apps

### Phase 1: Vorhandenes System lesen

Nicht direkt aendern. Erst verstehen:
- Projektstruktur
- verwendete Patterns
- zentrale Komponenten
- APIs, Datenmodelle, Styling-System

### Phase 2: Aenderungsziel isolieren

Vor dem Editieren klarziehen:
- welches Verhalten soll sich aendern?
- welche Dateien sind direkt betroffen?
- was koennte dadurch unbeabsichtigt kaputtgehen?

### Phase 3: Root Cause statt Oberflaechen-Fix

Wenn etwas kaputt ist:
- Ursache suchen
- nicht nur Symptome verdecken
- vorhandene Fehlertexte und Call-Flows ernst nehmen

### Phase 4: Bestehende Muster respektieren

In fremdem Code gilt:
- bestehenden Stil beibehalten
- keine unnoetigen Grossumbauten
- nur soweit refactoren, wie es fuer die Aufgabe hilft

## Tests und Verifikation

Nicht jede Aufgabe braucht sofort ein grosses Testpaket, aber jede Aufgabe braucht Verifikation.

Mindestens pruefen:
- tut die Aenderung wirklich das Gewuenschte?
- gibt es offensichtliche Nebenwirkungen?
- sind Fehlermeldungen plausibel?
- passt die UI auf Desktop und mobil?

Wenn Testinfrastruktur existiert:
- gezielte Tests fuer neue oder geaenderte Bereiche bevorzugen

## Review-Denken

Vor Abschluss immer kurz gegenpruefen:
- ist das wirklich die kleinste gute Loesung?
- wurde etwas ueber-engineered?
- fehlen Fehlersituationen?
- ist die Benennung verstaendlich?
- ist das Ergebnis fuer den Nutzer besser als vorher?
