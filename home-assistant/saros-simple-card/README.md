# Saros Simple Card

Een compacte Home Assistant-kaart voor de Roborock Saros 20. De kaart toont alleen:

- een schematische robot met een subtiele animatie;
- status en batterij;
- `Alles` of één gekoppelde ruimte;
- de schoonmaakprogramma's die de S20 zelf beschikbaar stelt;
- starten, pauzeren, stoppen en terugkeren naar het dock.

De kaart gebruikt uitsluitend de officiële Home Assistant-acties en heeft geen HACS-pakket of extra helper nodig.

## Installeren

1. Open in Home Assistant de **File editor** of **Studio Code Server**.
2. Maak in de configuratiemap, indien nodig, de map `www` aan.
3. Kopieer `saros-simple-card.js` naar:

   `/config/www/saros-simple-card.js`

4. Open **Instellingen → Dashboards → menu rechtsboven → Bronnen**.
5. Voeg de volgende JavaScript-module toe:

   `/local/saros-simple-card.js?v=1`

6. Herlaad de browser of de Home Assistant-app volledig.
7. Bewerk het gewenste dashboard, voeg een **Handmatige kaart** toe en plak de inhoud van `dashboard-card.yaml`.

## Ruimte-ID's controleren

De meegeleverde configuratie gebruikt de gebruikelijke area-ID's, zoals `woonkamer` en `keuken`. Wanneer een ruimte ooit is hernoemd, kan de interne area-ID anders zijn.

Controleer dit zo nodig via **Instellingen → Ruimtes, labels & zones → Ruimtes**. Pas alleen de waarde achter `area_id:` aan; de zichtbare `name:` mag blijven staan.

De Roborock-segmenten moeten via de instellingen van de vacuum-entiteit aan de Home Assistant-ruimtes gekoppeld zijn.

## Meerdere verdiepingen

`Alles` reinigt de volledige kaart/verdieping die op dat moment actief is. Voor een ruimte op een andere verdieping moet de robot daar fysiek staan en die kaart herkennen. De kaart verandert daarom bewust niet zelfstandig van kaart.

## Bij een update

Vervang het JavaScript-bestand en verhoog zo nodig het nummer in de bron-URL, bijvoorbeeld van `?v=1` naar `?v=2`. Daarmee voorkom je dat de browser een oude versie uit de cache gebruikt.

