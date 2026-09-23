# Badgecontrole en werkdag bewaren

## Oorzaak

De oude `evaluate_my_badges()` liep vast op `column reference "earned_at" is ambiguous`.
Dit is gereproduceerd in PostgreSQL. De aparte triggers voor Eerste Draaidag,
Teamspeler en Crew Builder verklaarden waarom sommige badges toch verschenen.
De nieuwe evaluator gebruikt expliciete kolomnamen. Bestaande badges blijven behouden.

Daarnaast herkent de controle nu zowel het `extras`-object van losse werkdagen
als de vlakke velden van projectdagen. Ongeldige oude tijden of kilometers laten
niet meer de hele controle mislukken. Toekomstige en lege dagen tellen niet mee.
Uitgeschakelde kilometers tellen niet mee, dubbele uitnodigingen of een persoonlijke
kopie van dezelfde gedeelde dag tellen niet dubbel.

## Project afronden

Er is geen extra knop nodig: Eerste Productie volgt automatisch zodra alle
projectdagen zijn verstreken en een eindtijd hebben. Een verstreken reisdag mag
zonder tijden worden geregistreerd. Een lege of toekomstige projectdag blokkeert
de badge. Long Runner gebruikt dezelfde voorwaarde, met minimaal tien dagen.

Historische dagen hebben geen afzonderlijke bevestiging dat de gebruiker ze heeft
afgesloten. Daarom blijven verstreken, volledig ingevulde tijden daarvoor de bron.
Een vroeger toegekende badge wordt niet ingetrokken, ook niet na correcties.

## Gecontroleerde voorwaarden

| Badge | Voorwaarde |
| --- | --- |
| Eerste Draaidag | Minimaal 1 geregistreerde, begonnen dag |
| Productieveteraan | 100 geregistreerde dagen |
| Nachtraaf | Eindtijd na middernacht, niet alleen een lege eindtijd |
| Drukke Maand | 20 verschillende kalenderdagen in dezelfde maand |
| Road Warrior | 10.000 ingeschakelde zakelijke kilometers, werkdag en projectdag |
| First Call | Begintijd voor 06:00 |
| Teamspeler | Geaccepteerde uitnodiging als ontvanger |
| Crew Builder | Geaccepteerde uitnodiging als eigenaar; bestaand account telt ook |
| Eerste Productie | Alle projectdagen verstreken en volledig, inclusief reisdagen |
| Buitenlandklus | 1 verstreken reisdag buiten Europa |
| Setlegende | 500 geregistreerde dagen |
| Sunrise Crew | Begintijd voor 05:00 |
| Vroege Vogel | 25 dagen begonnen voor 07:00 |
| Nachtuil | 25 dagen met een eindtijd na middernacht |
| Frequent Flyer | 10 verstreken reisdagen buiten Europa |
| That's a Wrap | 100 dagen met eindtijd of verstreken reisdagen |
| Volle Week | 5 verschillende dagen in dezelfde maandag-zondagweek |
| Iedereen Kent Iedereen | 10 verschillende collega's, ook mede-ontvangers |
| Vaste Crew | 25 verschillende gedeelde dagen met dezelfde collega |
| Long Runner | Afgerond project van minimaal 10 dagen |
| Paperwork Hero | Werkdag-PDF of project-PDF gegenereerd |
| Back to Back | Niet-overlappende opeenvolgende dagen met minder dan 8 uur ertussen |
| Kerstcrew | Geregistreerde dag op 25 of 26 december |
| New Year's Crew | Ingevulde tijden lopen daadwerkelijk voorbij 31 december |
| Langste Dag | Geregistreerde dag op 21 juni |
| Kortste Dag | Geregistreerde dag op 21 december |
| Jubileum | Account minstens 1 jaar oud |
| Launch Crew | Vanaf 1 juli 2026 tot 1 juli 2027, Nederlandse tijd |
| Reken, check, klaar. | 100 expliciete berekeningen, geen live-timerupdates |
| Geen 9-tot-5 | Voor 09:00 begonnen en na 17:00 geeindigd, ook over middernacht |

## Meldingen en selectie

De bestaande notificatietrigger blijft bestaan: maximaal een melding per behaalde
badge. Dezelfde behaalde badge kan in de bestaande collectie geselecteerd worden
als een van de drie badges en als titelbadge. Dat is ook in de testdatabase getest.
Projectdagen opslaan ververst nu het notificatieoverzicht.

De controle draait bij opslaan en bij het openen van de calculator/Crew Card.
Jubileum en ontbrekende historische badges verschijnen bij de volgende controle,
niet noodzakelijk om middernacht terwijl de app gesloten is. Pushbezorging blijft
afhankelijk van toestemming, de bestaande pushfunctie en iOS.
PDF- en calculatoractiviteiten van voor de introductie van tracking zijn niet
achteraf te reconstrueren. Een PDF-event bewijst dat de printweergave is geopend,
niet dat het besturingssysteem de PDF daadwerkelijk heeft opgeslagen.

## Werkdagknop

- Toekomstige datum: Werkdag inplannen.
- Vandaag of eerder zonder eindtijd: Werkdag bewaren.
- Vandaag of eerder met eindtijd: Dag afsluiten.

Inplannen en bewaren vullen geen eindtijd in en stoppen de live-tijd niet.
De bestaande Free/Pro-rechten en de persoonlijke instellingenknop bij ontvangen
gedeelde dagen blijven intact.

## Uitvoeren zonder terminal

1. Open Supabase > SQL Editor > New query.
2. Open `supabase/migrations/202609220001_badge_rules_audit.sql` in dit project.
3. Plak de volledige inhoud in de SQL Editor en klik Run.
4. Publiceer de gewijzigde app via de gebruikelijke commit/push.
5. Open je Crew Card. Ontbrekende badges worden dan opnieuw gecontroleerd.

Geen nieuwe Edge Function, cronjob of secret nodig. De migratie is herhaalbaar.
Er wordt niets aan werkdagen, projecten of bestaande badgekeuzes verwijderd.

## Tests

De normale JavaScript-tests bevatten nu ook de drie knopvarianten en de echte
opslaan-handler zonder automatische eindtijd. De aanvullende
`technisch/tests/badges-postgres.test.mjs` voert de productie-SQL uit in PGlite
(PostgreSQL), met alle 30 voorwaarden, grensgevallen, notificaties, selectie,
afgeschermde helperfuncties en het twee keer uitvoeren van de migratie.
Voor herhalen: installeer `@electric-sql/pglite` als testdependency of zet
`PGLITE_MODULE` op het pad naar de module, en voer de test met Node uit.
De tests gebruiken alleen lokale testgegevens, niet de productieaccounts.
