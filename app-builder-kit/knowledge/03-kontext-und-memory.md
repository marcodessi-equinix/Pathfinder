# Kontext und Memory

Diese Datei zieht die nuetzlichen Arbeitsideen aus Claude-Mem, ohne dass du gleich ein eigenes Memory-System einbauen musst.

## Warum das wichtig ist

Agenten verlieren oft Kontext zwischen Aufgaben. Darum sollte in einem Projekt bewusst eine kleine, einfache Wissensspur gepflegt werden.

## Was festgehalten werden sollte

Fuer groessere Aufgaben sind diese Informationen wertvoll:
- wichtige Produktentscheidungen
- offene Fragen
- bekannte Risiken
- relevante Dateien oder Module
- Test- oder Startkommandos
- Besonderheiten der Architektur

## Einfache Projektdateien, die sich bewaehrt haben

Wenn ein Projekt groesser wird, kann ein Agent diese Dateien anlegen oder pflegen:

- `docs/decisions.md`
  Wichtige Architektur- und Produktentscheidungen

- `docs/agent-notes.md`
  Kurzer Arbeitsstand fuer den naechsten Schritt

- `docs/known-issues.md`
  Bekannte Einschraenkungen oder technische Schulden

## Gute Arbeitsweise fuer Agenten

Vor einer groesseren Aenderung:
- bisherige Entscheidungen lesen, falls vorhanden

Waehren der Arbeit:
- neue wichtige Entscheidung kurz notieren
- wenn etwas unklar bleibt, als offene Frage markieren

Nach einem groesseren Schritt:
- kurz dokumentieren, was sich geaendert hat
- wichtige Folgen oder Risiken festhalten

## Progressive Information statt Ueberladung

Nicht alles auf einmal lesen oder dokumentieren.

Sinnvolle Reihenfolge:

1. Kurzuebersicht lesen
2. relevante Dateien lesen
3. Details nur bei Bedarf vertiefen

Das gleiche gilt fuer Dokumentation:
- erst knappe Zusammenfassung
- dann nur dort Details, wo sie wirklich helfen

## Was aus Claude-Mem besonders brauchbar ist

- Sitzungswissen soll wieder auffindbar sein
- Entscheidungen sollten als Verlauf erhalten bleiben
- wichtige Beobachtungen sollten kurz und konkret sein
- Suche ist hilfreicher als lange Rohlogs

## Praktische Regel fuer dieses Kit

Wenn ein Agent laenger an einem Projekt arbeitet, sollte er nach groesseren Schritten wenigstens festhalten:
- was entschieden wurde
- was gebaut wurde
- was als Naechstes offen ist
