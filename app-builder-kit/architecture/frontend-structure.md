# Frontend Structure

## Ziel

Frontend-Dateien so schneiden, dass sie fuer Menschen und fuer KIs leichter bearbeitbar bleiben.

## Gute Aufteilung

- Seiten oder Routen getrennt von Basis-Komponenten
- Formularlogik nicht komplett in grosse Page-Dateien kippen
- wiederverwendbare UI-Teile zentral halten
- API- oder Datenlogik nicht wild in Komponenten mischen

## Einfache Verantwortungen

- Page: Zusammensetzung und Seitenspezifik
- Feature-Komponente: fachliche UI-Logik
- Basis-Komponente: wiederverwendbares UI-Grundelement
- Hook oder Service: zustands- oder datenbezogene Logik

## Warnzeichen

- eine Datei regelt Layout, Daten, Side Effects, Validierung und Styling zugleich
- Komponenten ueber 300 bis 500 Zeilen ohne klare Teilung
- gleiches Formularmuster wird an drei Stellen leicht anders kopiert
