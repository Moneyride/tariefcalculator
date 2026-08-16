# Moneybird instellen voor Overuurtje

Overuurtje gebruikt Moneybird uitsluitend om gecontroleerde **concept-verkoopfacturen** te maken. De applicatie verstuurt nooit automatisch een factuur. Productiegebruikers verbinden hun eigen administratie via OAuth; een Personal Access Token is alleen beschikbaar als lokale ontwikkeloptie.

## 1. Database bijwerken

Voer in de Supabase SQL Editor deze nieuwe migratie volledig uit:

`supabase/migrations/202608150001_accounting_integrations.sql`

De migratie maakt verbindingen, klant-/btw-/grootboekmappings en een idempotent exportregister aan. OAuth-tokens staan in een aparte tabel zonder clientpolicies.

## 2. OAuth-app in Moneybird maken

1. Open `https://moneybird.com/user/applications/new` terwijl je in Moneybird bent ingelogd.
2. Maak een OAuth application voor Overuurtje.
3. Gebruik als redirect URI exact:

   `https://kdevseeblnjwrqnanfke.supabase.co/functions/v1/accounting-moneybird/callback`

4. Bewaar de Moneybird Client ID en Client Secret buiten de repository.

Overuurtje vraagt bij het verbinden alleen de scopes `sales_invoices` en `settings`. Hiermee kan de integratie administraties, contacten, belastingtarieven, grootboekrekeningen en concept-verkoopfacturen gebruiken.

## 3. Supabase secrets instellen

Maak eerst een eigen encryptiesleutel:

```bash
openssl rand -base64 48
```

Stel daarna de secrets in. Vervang alleen de waarden tussen `<...>`:

```bash
supabase secrets set \
  MONEYBIRD_CLIENT_ID="<CLIENT_ID>" \
  MONEYBIRD_CLIENT_SECRET="<CLIENT_SECRET>" \
  MONEYBIRD_REDIRECT_URI="https://kdevseeblnjwrqnanfke.supabase.co/functions/v1/accounting-moneybird/callback" \
  OVERUURTJE_APP_URL="https://overuurtje.nl" \
  ACCOUNTING_TOKEN_ENCRYPTION_KEY="<UIT_OPENSSL>" \
  --project-ref kdevseeblnjwrqnanfke
```

Gebruik nooit een Moneybird-token als Netlify-variabele of client-side configuratie.

## 4. Edge Function deployen

De callback van Moneybird bevat geen Supabase-JWT. De functie valideert de OAuth-state zelf en valideert alle andere acties expliciet met het bearer-token van de gebruiker. Deploy daarom zo:

### Zonder terminal, via het Supabase-dashboard

1. Open je Supabase-project en ga naar **Edge Functions**.
2. Open de functie **accounting-moneybird**.
3. Open het tabblad **Code** en kies **Edit function** of **Edit code**.
4. Open lokaal het bestand `supabase/functions/accounting-moneybird/index.ts`.
5. Selecteer en kopieer de volledige inhoud van dit bestand, van de eerste `import` tot en met de laatste `});`.
6. Vervang in de Supabase-editor de volledige bestaande inhoud door de gekopieerde code.
7. Open de instellingen van deze functie en zet **Verify JWT** of **Enforce JWT verification** uit. De Moneybird-callback komt zonder ingelogde Overuurtje-sessie terug; de functie beveiligt de overige acties zelf.
8. Klik op **Deploy updates** en wacht op de succesmelding.
9. Open daarna in een nieuw browsertabblad:

   `https://kdevseeblnjwrqnanfke.supabase.co/functions/v1/accounting-moneybird/health`

   De verwachte reactie is:

   `{"ok":true,"provider":"moneybird"}`

Alleen op **Deploy updates** drukken zonder stap 5 en 6 publiceert opnieuw de al aanwezige online code. Lokale reparaties worden daarmee niet automatisch naar Supabase gekopieerd. Een GitHub- of Netlify-deploy werkt de Supabase Edge Function evenmin bij.

Controleer onder **Edge Functions → Secrets** ook of deze vijf namen bestaan. De waarden zelf hoeven en mogen niet in de repository staan:

- `MONEYBIRD_CLIENT_ID`
- `MONEYBIRD_CLIENT_SECRET`
- `MONEYBIRD_REDIRECT_URI`
- `OVERUURTJE_APP_URL`
- `ACCOUNTING_TOKEN_ENCRYPTION_KEY`

### Met de Supabase CLI

```bash
supabase functions deploy accounting-moneybird \
  --project-ref kdevseeblnjwrqnanfke \
  --no-verify-jwt
```

Er is geen nieuwe cronjob nodig.

## 5. Optionele lokale PAT-testmodus

Gebruik dit alleen voor development met je eigen testadministratie. Maak in Moneybird een officiële Personal Access Token en zet deze uitsluitend als Supabase secret:

```bash
supabase secrets set \
  MONEYBIRD_ALLOW_DEVELOPMENT_PAT="true" \
  MONEYBIRD_DEVELOPMENT_PAT="<PERSONAL_ACCESS_TOKEN>" \
  --project-ref kdevseeblnjwrqnanfke
```

Deploy de functie opnieuw. Op `localhost` verschijnt dan in Account > Boekhouding de knop **Gebruik testadministratie**. Verwijder of deactiveer beide secrets na het testen. De normale productieflow blijft OAuth.

## 6. Eerste veilige test

1. Open Account > Boekhouding en verbind Moneybird.
2. Kies de juiste administratie en test de verbinding.
3. Open een afgeronde, opgeslagen werkdag en kies **Naar Moneybird**.
4. Selecteer een bestaand Moneybird-contact. Overuurtje maakt nooit stilzwijgend een contact aan.
5. Koppel de gebruikte btw-percentages en regelcategorieën aan Moneybird-belastingtarieven en omzetrekeningen.
6. Controleer alle regels in de preview en kies **Maak conceptfactuur**.
7. Controleer in Moneybird dat de verkoopfactuur de status concept heeft en verwijder de testfactuur daar indien gewenst.

De mappings worden voor volgende exports onthouden. Een reeds geëxporteerde werkdag wordt gemarkeerd en alleen na een bewuste bevestiging opnieuw geëxporteerd.

## 7. Problemen oplossen

- **Verbinding verlopen:** kies Opnieuw verbinden in Account > Boekhouding.
- **Klant ontbreekt:** kies een bestaand Moneybird-contact in de preview.
- **Btw-instelling ontbreekt:** koppel eerst elk zichtbaar percentage aan een Moneybird tax rate.
- **Grootboek ontbreekt:** kies voor elke zichtbare regelsoort een Moneybird omzetrekening.
- **Twee administraties:** selecteer eerst expliciet de administratie in Account of de preview.
- **Dubbele klik:** de clientknop wordt geblokkeerd en het server-side exportregister plus de Moneybird-reference voorkomen een tweede conceptfactuur.

Moneybird hanteert een API-limiet van 150 verzoeken per vijf minuten per IP-adres. Overuurtje laadt configuratie eenmaal per preview en zoekt contacten alleen tijdens invoer.
