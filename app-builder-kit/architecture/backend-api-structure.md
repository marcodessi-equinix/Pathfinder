# Backend API Structure

## Ziel

Backend-Logik so schneiden, dass Endpunkte, Fachlogik und Datenzugriff nicht unnoetig verfilzen.

## Einfache Aufteilung

- Route oder Controller: HTTP-Eintrittspunkt
- Service: Fachlogik
- Repository oder Data Layer: Datenzugriff
- Schema oder Validator: Eingaben und Ausgaben pruefen

## Gute Regeln

- Eingaben frueh validieren
- Fehlertypen bewusst behandeln
- Business-Logik nicht direkt im Controller stapeln
- Datenbankzugriff nicht ueberall duplizieren

## Warnzeichen

- Controller kennt schon zu viele technische Details
- SQL oder Datenzugriff liegt verstreut in mehreren Ebenen
- API-Antworten haben keine klare Form
- derselbe Check wird in mehreren Endpunkten wiederholt
