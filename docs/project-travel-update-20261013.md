# Projectregistratie, reistijden en urenverrekening

## Ingebruikname

1. Voer `supabase/migrations/202610130001_project_work_rules.sql` uit in de SQL Editor van het bestaande project.
2. Publiceer de appwijzigingen via de bestaande GitHub/Netlify-route.
3. Open de PWA online opnieuw om de nieuwe app-shell te laden.

Geen nieuwe secrets, Edge Functions of cronjobs nodig.
De migratie voegt `projects.work_rules` en de notitie-RPC `save_my_day_note` toe. Bestaande projecten krijgen lege regels; urenverrekening staat standaard uit. Bestaande project- en werkdag-RLS blijft gelden. De notitie-RPC werkt als de aangemelde gebruiker en wijzigt uitsluitend diens eigen notitieveld.

## Vastgelegde afspraken

- Reistijden zijn lokaal. Het tijdsverschil is aankomst min vertrek: een uur vroeger op de aankomstlocatie is -1 uur. De aankomstdag kan apart worden vastgelegd, tot twee dagen later.
- Reisdagen houden hun vaste percentagevergoeding; geregistreerde reistijd voegt niet zelfstandig overuren of nachttoeslag toe.
- De projectoptie voor urenverrekening telt wel de gewerkte/reisuren ten opzichte van de normale daglengte, inclusief reisdagen. Alleen dagen met begin- en eindtijd en een datum tot en met vandaag tellen in het voorlopige saldo.
- Onderuren worden 1-op-1 afgetrokken van de hoogste oorspronkelijke overuurstaffels. Bij gelijke percentages wordt eerst de hoogste uurprijs verminderd. Er wordt geen negatief bedrag op het dagtarief in mindering gebracht.
- Dagtotalen bevatten bij deze projectoptie geen overuurvergoeding. Nachttoeslag en andere kosten volgen de bestaande afzonderlijke afspraken.
- Het projectoverzicht toont overuren, onderuren, resterende staffels en een voorlopig bedrag. De gebruiker bevestigt de afrekening met 'Project afronden en uren verrekenen'. Daarvoor moeten alle dagen geweest zijn en alle begin- en eindtijden zijn ingevuld, ook bij reizen.
- Een wijziging aan dagdata maakt de bevestiging ongeldig; het project moet dan opnieuw worden afgerond. Alleen een notitiewijziging heeft geen invloed op de afrekening.
- De project-PDF en de projectexport nemen de bevestigde eindafrekening eenmalig op. Bij een selectie van slechts enkele projectdagen mag de projectafrekening niet worden meegenomen.
- Dagnotities worden met de werkdag opgeslagen. Bij een bestaande dag worden wijzigingen ook apart opgeslagen bij het verlaten van het tekstvak; een notitie-update overschrijft geen tijden. Ze zijn geen factuurregels en worden niet automatisch in de factuuromschrijving gezet.
- Een projectpauze kan als begin/eindtijd worden genoteerd. Dit vervangt de gewone pauzeduur voor die dag, zodat de pauze niet dubbel wordt afgetrokken. Alleen de overlap met de gewerkte tijd wordt afgetrokken; pauze in de nacht telt niet als nachtuur. Bij reizen gebruiken pauzetijden de tijdzone van vertrek, zoals ook bij het veld vermeld staat.

## PWA en verbinding

De app-shell krijgt een nieuwe cacheversie. Opgeslagen HTML wordt direct geopend en op de achtergrond ververst. Versiegebonden scripts en CSS worden alleen uit een exact overeenkomende URL-cache geladen. API-verkeer en runtime-configuratie krijgen deze vaste bestandscache niet.

Een eerste bezoek, nieuwe appversie en daadwerkelijke account/projectdata blijven internet nodig hebben. De snelheid op een specifieke telefoon/verbinding is niet vanuit lokale tests gegarandeerd.

## Controle op iPhone

- Reisdag met -1 uur verschil opslaan, sluiten, opnieuw openen; uren en vaste vergoeding controleren.
- Reisdag over middernacht met expliciete aankomstdag controleren.
- Pauzetijdvak voor, tijdens en na een live werkdag controleren.
- Notitie opslaan en dezelfde projectdag opnieuw openen.
- Projectverrekening activeren, saldo controleren, project afronden en PDF/export vergelijken.
- Na afronding een tijd wijzigen en controleren dat een nieuwe bevestiging wordt gevraagd.
- Meerdere schermen na de eerste online laadbeurt openen, ook met een zwakke verbinding.

Een los extern boekhoudprogramma met een gekopieerde Overuurtje-rekenengine neemt deze nieuwe projectafrekening niet vanzelf over. Dat programma moet dezelfde projectregels en rekenversie ondersteunen voordat het deze projecten factureert.
