Overuurtje.nl

Dit is een kleine lokale browsertool om snel een klus-tarief te berekenen.
Je vult een datum, starttijd, eindtijd en instellingen in. De tool berekent daarna het tarief, overuren, nachttarief, btw en totaalbedrag.

De calculator draait lokaal in je browser en blijft zonder account bruikbaar.
Een internetverbinding is alleen nodig voor de optionele account- en synchronisatiefuncties.

Snel gebruiken

1. Open deze map.
2. Open "Overuurtje.html".
3. Overuurtje.nl opent in je browser.

Op een telefoon werkt "Overuurtje.html" het beste, omdat alles in één bestand zit.
Als iCloud of Bestanden alleen een voorbeeld toont, gebruik dan de deelknop en kies "Open in Safari".

Installeren als app

De online versie op https://overuurtje.nl kan als app worden geïnstalleerd.

Op iPhone of iPad:

1. Open overuurtje.nl in Safari of Chrome.
2. Kies onderaan de pagina "Installeer Overuurtje".
3. Tik op de deelknop van de browser.
4. Kies "Zet op beginscherm".

Op Android of een computer:

1. Open overuurtje.nl in Chrome of Edge.
2. Kies "Installeer Overuurtje" onderaan de pagina.
3. Bevestig de installatie.

De geïnstalleerde app opent zonder browserbalk. De calculator en eerder geladen pagina's blijven ook zonder internetverbinding beschikbaar. Voor inloggen, synchroniseren, Werkdagen en Projecten blijft een internetverbinding nodig.

Gebruik

1. Vul eventueel een datum in.
2. Kies starttijd en eindtijd.
3. Controleer de instellingen, zoals dagtarief, werkdag op 10 of 12 uur, overuren en nachttarief.
4. Klik op "Berekenen".
5. Gebruik "Kopiëren voor factuur" om een korte tekst voor het boekhoudsysteem te kopiëren.

Als je na het berekenen nog iets wijzigt, toont de tool een melding.
Klik dan opnieuw op "Berekenen".

Privacy en Analytics

Overuurtje.nl gebruikt Google Analytics 4 alleen nadat een bezoeker hiervoor toestemming heeft gegeven.
De keuze wordt lokaal in de browser bewaard en kan onderaan de site via "Cookie settings" worden gewijzigd.
Ingevulde tarieven, bedragen, datums en kloktijden worden niet naar Google Analytics gestuurd.

Google Analytics wordt niet geladen bij gebruik via file://, localhost of 127.0.0.1.
Zo blijven lokale tests buiten de rapportages.

Enhanced Measurement controleren

1. Open Google Analytics en ga naar Beheer.
2. Kies onder Gegevensverzameling en -wijziging voor Gegevensstreams.
3. Open de webstream van overuurtje.nl.
4. Zet Verbeterde meting (Enhanced Measurement) aan.

De websitecode hoeft hiervoor niet aangepast te worden.

SaaS-opbouw

De calculator en de SaaS-laag zijn bewust van elkaar gescheiden:

- app/calculator.js bevat uitsluitend de tariefberekeningen.
- app/app.js verbindt de calculator met de pagina en lokale instellingen.
- app/saas/ bevat Supabase, authenticatie, profielen, cloudinstellingen, abonnementen en feature gates.
- app/account.html is de aparte Account & Instellingen-pagina.
- app/workdays.html toont opgeslagen losse Pro-werkdagen.
- supabase/migrations/ bevat het databaseschema en Row Level Security.
- technisch/build-netlify.mjs maakt de deploymap en injecteert publieke configuratie.

Supabase activeren

1. Maak een Supabase-project.
2. Voer supabase/migrations/202607210001_saas_foundation.sql uit in de Supabase SQL Editor.
3. Stel in Supabase de Site URL in op https://overuurtje.nl.
4. Voeg https://overuurtje.nl/account.html toe als toegestane redirect-URL.
5. Voeg in Netlify de volgende environment variables toe met scope Builds:

SUPABASE_URL
SUPABASE_ANON_KEY

De anon/publishable key is bedoeld voor browsergebruik. Gebruik nooit de service-role key in frontendcode of buildvariabelen.

Netlify

netlify.toml bouwt de website met:

node technisch/build-netlify.mjs

De publicatiemap is dist. De calculator, accountpagina en alle assets worden daar automatisch in geplaatst.

Shopify-voorbereiding

Optioneel kunnen alvast deze publieke URL's in Netlify worden ingesteld:

SHOPIFY_CHECKOUT_URL
SHOPIFY_MANAGE_URL

Zolang deze leeg zijn tonen de knoppen een nette tijdelijke melding.

Shopify Basic synchronisatie

De server-side webhook is bereikbaar op:

https://overuurtje.nl/api/shopify/webhook

Voer eerst supabase/migrations/202607240001_shopify_webhooks.sql uit. Voeg daarna in Netlify de volgende server-side variabelen toe:

SUPABASE_SECRET_KEY
SHOPIFY_API_SECRET
SHOPIFY_CLIENT_ID
SHOPIFY_STORE_DOMAIN
SHOPIFY_PRO_PRODUCT_ID

De Shopify-app stuurt orders/paid en customers/update naar de webhook. Shopify Flow beheert voor Basic de klanttags overuurtje-pro-active, overuurtje-pro-cancelled en overuurtje-pro-past-due. De webhook haalt deze tags server-side op met de Shopify Client ID en het bestaande API-secret, omdat Shopify ze niet in de customers/update-payload meestuurt. Gebruik bij Shopify hetzelfde e-mailadres als bij het Overuurtje-account.

De Supabase secret key is uitsluitend voor Netlify Functions. Plaats deze nooit in runtime-config.js, browsercode of GitHub.

Werkdagen activeren

Voer supabase/migrations/202607240002_workdays.sql uit in de Supabase SQL Editor.
De tabel bewaart per gebruiker volledige, versieerbare calculatorsnapshots. Een eindtijd mag ontbreken en meerdere werkdagen mogen dezelfde datum hebben. RLS geeft uitsluitend de eigenaar met een actief Pro-account toegang.

Testmodus abonnementen

Op localhost en bij openen via file:// kan een ingelogde ontwikkelaar Free en Pro simuleren op de accountpagina. In productie staat deze mock uit. Voor een tijdelijke deploy-preview kan OVERUURTJE_ALLOW_MOCK_SUBSCRIPTIONS op true worden gezet; gebruik dit nooit op de echte productiesite.

Nieuwe Pro-functies

Voeg de functie toe aan app/saas/featureGate.js en controleer hem centraal met:

OveruurtjeFeatureGate.require("feature_name", currentUser, callback)

Een Free-gebruiker krijgt dan automatisch de bestaande Pro-upgradedialoog. Abonnementslogica hoeft daardoor niet door UI-code te worden verspreid.

Nieuwe database-tabellen horen een user_id naar profiles.id en owner-only RLS te gebruiken. Pro-data controleert daarnaast public.current_user_is_pro().
