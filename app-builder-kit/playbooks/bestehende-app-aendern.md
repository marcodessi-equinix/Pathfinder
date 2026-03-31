# Playbook Bestehende App aendern

Nutze dieses Playbook, wenn schon Code existiert und Verhalten, UI oder Struktur geaendert werden soll.

## Reihenfolge

1. bestehende Struktur lesen
2. betroffenes Verhalten eingrenzen
3. direkte und indirekte Auswirkungen notieren
4. vorhandene Muster erkennen
5. Aenderung so klein wie sinnvoll halten
6. Verhalten nach der Aenderung gezielt pruefen

## Vor jeder Aenderung beantworten

- Welche Module oder Komponenten kontrollieren das aktuelle Verhalten?
- Welche Dateien sind wahrscheinlich betroffen?
- Was darf auf keinen Fall kaputtgehen?
- Gibt es bestehende Tests, Storys oder Screenshots?
- Ist das eher ein Bugfix, eine UX-Aenderung oder eine Strukturfrage?

## Gute Regel

Wenn du beim Lesen merkst, dass drei verschiedene Systeme beruehrt werden, plane erst kurz, bevor du editierst.
