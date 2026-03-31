# UI UX System

Diese Datei verdichtet die brauchbarsten Ideen aus dem UI-UX-Pro-Max-Repo in eine handhabbare Form.

## Ziel

Wenn ein Agent UI baut, soll die Oberflaeche nicht beliebig oder austauschbar wirken.

## Entscheidungsfolge fuer UI

Vor dem Design kurz festlegen:

1. Produkttyp
2. visueller Stil
3. Farbwelt
4. Typografie
5. Bewegungsniveau
6. Accessibility-Niveau

## Produkttyp zuerst bestimmen

Typische Gruppen:
- SaaS oder Business Tool
- Dashboard oder Analytics
- Landing Page oder Marketing Site
- AI Tool oder Chat-App
- Wellness oder Lifestyle
- E-Commerce oder Buchung
- Kreativprodukt oder Portfolio

## Stil passend waehlen

Nicht jeder Stil passt zu jeder App.

Bewaehrte Zuordnungen:

- SaaS, Admin, Produktivitaet:
  Minimalism, Swiss Style, Soft UI Evolution, Bento Grid

- Analytics und Datenprodukte:
  Minimalism, Data-Dense Dashboard, Executive Dashboard, Dimensional Layering

- Wellness, Health, Beauty:
  Organic Biophilic, Soft UI Evolution, Nature Distilled

- AI-Produkt, Chatbot, Copilot:
  AI-Native UI, Minimalism, Soft UI Evolution

- Kreativ, Musik, Brand, Portfolio:
  Brutalism, Editorial Grid, Motion-Driven, Exaggerated Minimalism

## Farben

Regeln:
- immer eine klare Primärfarbe festlegen
- eine zweite Farbe fuer Unterstuetzung nutzen
- eine Akzentfarbe nur fuer wichtige Aktionen
- Textkontrast nie vernachlaessigen

Vermeiden:
- zufaellige Lila-auf-Weiss-Standards
- zu viele Akzentfarben gleichzeitig
- Kontrastschwache Grautoene fuer Fliesstext

## Typografie

Typografie soll zur Produktwirkung passen.

Empfehlungen:
- Business, SaaS, Tools: klare Sans-Fonts
- Editorial, Luxury, Wellness: Serif plus ruhige Sans
- Dev- oder Tech-Produkte: technisch wirkende Sans oder Mono sparsam einsetzen

Wichtig:
- Ueberschriften muessen klar groesser wirken als Body Text
- Body Text auf kleineren Screens nicht zu klein machen
- nicht mehr Schriftfamilien als noetig verwenden

## Motion

Motion nur mit Absicht:
- 150 bis 300 ms fuer Micro-Interactions
- scroll- oder reveal-Animationen nur sparsam
- `prefers-reduced-motion` respektieren

Vermeiden:
- dauernd laufende Deko-Animationen
- zu viele verschiedene Bewegungsarten gleichzeitig

## Accessibility Mindeststandard

Immer mitdenken:
- sichtbare Focus-States
- ausreichender Farbkontrast
- klare Labels in Formularen
- klickbare Flaechen gross genug
- mobile Bedienung ohne Hover-Zwang

## Responsive Regeln

Vor Abschluss pruefen:
- 375 px
- 768 px
- 1024 px
- 1440 px

Fragen:
- bleibt die Hierarchie klar?
- werden Buttons zu klein?
- brechen Karten oder Tabellen unsauber?
- ist Text noch gut lesbar?

## Einfache Designformel fuer Agenten

Wenn keine bessere Richtung vorgegeben ist:

- Business App:
  sauber, klar, ruhig, strukturiert

- Consumer App:
  freundlicher, emotionaler, kontrastreicher

- Premium App:
  reduzierter, groessere Typografie, mehr Luft, edlere Akzente

## Anti-Pattern Kurzliste

Nicht tun:
- generische AI-Gradienten ohne Produktbezug
- zu viele Karten mit identischem Gewicht
- dunkle UIs nur weil sie modern wirken
- mobile Layouts mit Desktop-Denken
- farbliche Information ohne Text oder Icon
