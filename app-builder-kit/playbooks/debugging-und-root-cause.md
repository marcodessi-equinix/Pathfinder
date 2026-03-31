# Playbook Debugging und Root Cause

Nutze dieses Playbook bei Bugs, kaputtem Verhalten, seltsamen Fehlermeldungen oder Regressionen.

## Reihenfolge

1. Fehlerbild genau beschreiben
2. reproduzierbare Schritte sammeln
3. relevante Fehlermeldungen genau lesen
4. letzte Aenderungen oder betroffene Bereiche eingrenzen
5. Datenfluss rueckwaerts verfolgen
6. erst dann editieren

## Nicht tun

- mehrere Vermutungen gleichzeitig patchen
- nur Timeouts oder Guards draufwerfen
- Symptome stillmachen ohne Ursache zu pruefen

## Fragen vor dem Fix

- Wo tritt der Fehler zuerst sichtbar auf?
- Wo koennte der falsche Wert herkommen?
- Welche Komponente, Funktion oder API liefert ihn?
- Ist der Fehler logisch, asynchron oder datenbezogen?
