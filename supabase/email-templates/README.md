# Supabase Auth-e-mails voor Overuurtje.nl

Deze map bevat Nederlandstalige, e-mailveilige HTML-templates voor Supabase Auth. De mails communiceren vanuit **Overuurtje.nl** en gebruiken **The GearHarbor** uitsluitend als afzender en als bedrijf achter de dienst.

## Belangrijk voor dit Supabase-project

Dit project gebruikt een Supabase Free-project dat na 3 juni 2026 is aangemaakt. Supabase vereist voor zulke projecten eerst **Custom SMTP** voordat aangepaste e-mailtemplates kunnen worden opgeslagen. Stel daarom eerst SMTP in en plaats daarna de templates.

De gewenste afzender is:

- Sender name: `The GearHarbor`
- Sender email: `info@thegearharbor.com`

Alleen deze waarden invullen is niet voldoende. De SMTP-provider moet `thegearharbor.com` en deze afzender ook toestaan en verifiëren.

## Analyse van de huidige applicatie

De applicatie gebruikt momenteel:

- registratie met e-mail en wachtwoord via `signUp`;
- accountbevestiging per e-mail;
- inloggen met e-mail en wachtwoord via `signInWithPassword`;
- wachtwoordherstel via `resetPasswordForEmail`;
- wachtwoord wijzigen via `updateUser`.

De applicatie gebruikt momenteel niet:

- magic links;
- Supabase-beheeruitnodigingen;
- e-mailadres wijzigen;
- telefoon-authenticatie;
- externe inlogproviders;
- multi-factor authentication;
- expliciete reauthentication.

Er bestaat geen eigen `/auth/confirm`- of `/auth/callback`-route. De Supabase-client gebruikt `detectSessionInUrl: true` en verwerkt de terugkerende sessie op de bestaande pagina.

De huidige redirects zijn:

- gewone registratie: `account.html`;
- registratie via een gedeelde-werkdaguitnodiging: de bestaande `workdays.html?invite=...`-URL;
- wachtwoordherstel: `account.html?mode=reset`.

Daarom gebruiken de actietemplates `{{ .ConfirmationURL }}`. Vervang dit niet door een eigen `{{ .TokenHash }}`-link zonder eerst een callbackroute met `verifyOtp` te bouwen.

## Templates en onderwerpregels

| Supabase-template | Bestand | Onderwerp | Variabelen | Nu actief in de app |
|---|---|---|---|---|
| Confirm signup | `confirm-signup.html` | Bevestig je account bij Overuurtje.nl | `{{ .ConfirmationURL }}` | Ja |
| Invite user | `invite-user.html` | Je bent uitgenodigd voor Overuurtje.nl | `{{ .ConfirmationURL }}` | Nee, voorbereid |
| Magic link | `magic-link.html` | Log in bij Overuurtje.nl | `{{ .ConfirmationURL }}` | Nee, voorbereid |
| Change email address | `change-email.html` | Bevestig je nieuwe e-mailadres | `{{ .ConfirmationURL }}` | Nee, voorbereid |
| Reset password | `reset-password.html` | Stel een nieuw wachtwoord in | `{{ .ConfirmationURL }}` | Ja |
| Reauthentication | `reauthentication.html` | Bevestig dat jij het bent | `{{ .Token }}` | Nee, voorbereid |

### Security notifications

| Supabase-template | Bestand | Onderwerp | Variabelen | Relevantie |
|---|---|---|---|---|
| Password changed | `password-changed.html` | Je wachtwoord is gewijzigd | geen | Nu relevant |
| Email address changed | `email-changed.html` | Het e-mailadres van je account is gewijzigd | geen | Pas bij e-mailwijziging |
| Phone number changed | `phone-changed.html` | Het telefoonnummer van je account is gewijzigd | geen | Pas bij telefoon-auth |
| Identity linked | `identity-linked.html` | Een nieuwe inlogmethode is gekoppeld | `{{ .Provider }}` | Pas bij externe providers |
| Identity unlinked | `identity-removed.html` | Een inlogmethode is verwijderd | `{{ .Provider }}` | Pas bij externe providers |
| MFA factor enrolled | `mfa-added.html` | Extra beveiliging is toegevoegd | `{{ .FactorType }}` | Pas bij MFA |
| MFA factor unenrolled | `mfa-removed.html` | Extra beveiliging is verwijderd | `{{ .FactorType }}` | Pas bij MFA |

## 1. Custom SMTP instellen

Een geschikte eerste keuze is **Postmark**, omdat de dienst sterk op transactionele e-mail is gericht. **Resend** is een goed alternatief. Beide kunnen via SMTP met Supabase werken.

1. Maak bij de gekozen provider een verzenddomein voor `thegearharbor.com` aan.
2. Voeg de door de provider opgegeven DNS-records toe.
3. Wacht totdat de provider het domein en `info@thegearharbor.com` als geverifieerd toont.
4. Open in Supabase: **Authentication > SMTP Settings**. De precieze naam kan per dashboardversie licht verschillen.
5. Schakel Custom SMTP in.
6. Vul in:

   | Veld | Waarde |
   |---|---|
   | Sender name | `The GearHarbor` |
   | Sender email | `info@thegearharbor.com` |
   | Host | `SMTP_HOST` |
   | Port | `SMTP_PORT` |
   | Username | `SMTP_USERNAME` |
   | Password | `SMTP_PASSWORD` |

7. Sla de instellingen op.
8. Stel een passende Auth e-mail-rate-limit in. Gebruik tijdens productie geen extreem lage testlimiet.
9. Schakel bij de SMTP-provider klik- en linktracking voor deze authmails uit. Het herschrijven van bevestigingslinks kan authenticatielinks beschadigen.

Plaats SMTP-wachtwoorden of API-keys nooit in Git, deze map of Netlify-frontendvariabelen.

## 2. DNS controleren

Controleer bij de SMTP-provider:

- **SPF**: de provider is gemachtigd om voor `thegearharbor.com` te verzenden;
- **DKIM**: de provider toont de DKIM-records als geverifieerd;
- **DMARC**: voeg bij voorkeur minimaal een monitorbeleid toe en bouw dit later aan naar een strenger beleid;
- de zichtbare afzender is `The GearHarbor <info@thegearharbor.com>`;
- reply-to komt uit bij een mailbox die daadwerkelijk wordt gelezen.

Voeg nooit twee losse SPF-records voor hetzelfde domein toe. Combineer bestaande verzenddiensten volgens de instructies van de DNS- of mailprovider.

## 3. URL Configuration controleren

Open in Supabase: **Authentication > URL Configuration**.

Stel de Site URL in op:

```text
https://overuurtje.nl
```

Voeg voor productie minimaal deze Redirect URLs toe:

```text
https://overuurtje.nl/account.html
https://overuurtje.nl/account.html?mode=reset
https://overuurtje.nl/workdays.html?invite=*
```

De app heeft ook Netlify-routes zonder `.html`, maar de huidige JavaScript-flow bouwt bovenstaande bestands-URL's. Laat die daarom expliciet toe.

Voeg voor lokaal testen zo nodig toe:

```text
http://localhost:4173/app/account.html
http://localhost:4173/app/account.html?mode=reset
http://localhost:4173/app/workdays.html?invite=*
```

Gebruik alleen de lokale regels tijdens ontwikkeling. Houd de productie-Site URL altijd op `https://overuurtje.nl`.

## 4. Authentication-templates plaatsen

1. Open in Supabase: **Authentication > Email Templates**.
2. Open **Confirm signup**.
3. Vul het onderwerp uit de tabel hierboven in.
4. Klik in het berichtveld, gebruik `Cmd+A` om de volledige oude template te selecteren en plak daarna de volledige inhoud van `confirm-signup.html`. Plak de nieuwe template niet onder of binnen de bestaande HTML; dat veroorzaakt dubbele titels, knoppen en footers.
5. Sla op.
6. Herhaal dit voor:
   - Invite user;
   - Magic link;
   - Change email address;
   - Reset password;
   - Reauthentication.

Laat de Supabase-variabelen exact staan. Verander bijvoorbeeld `{{ .ConfirmationURL }}` niet in gewone tekst en encodeer de waarde niet nogmaals.

## 5. Security notifications plaatsen

1. Open binnen Authentication het onderdeel **Security notifications** of **Email Templates > Security notifications**.
2. Plaats per beschikbare melding het bijbehorende HTML-bestand en onderwerp.
3. Schakel nu in elk geval **Password changed** in.
4. Schakel de overige meldingen pas in wanneer de bijbehorende functie daadwerkelijk wordt gebruikt.

Niet iedere dashboardversie of abonnementsvorm toont alle securitytemplates. Sla een ontbrekende template over; verander hiervoor geen applicatiecode.

## 6. Veilig testen

Test bij voorkeur eerst met aparte testaccounts en niet met het enige beheeraccount.

### Functionele checklist

- [ ] Nieuwe registratie verstuurt de Nederlandse bevestigingsmail.
- [ ] De knop **Account bevestigen** opent Overuurtje.nl.
- [ ] Na bevestiging kan het account inloggen.
- [ ] De zichtbare fallback-link werkt.
- [ ] Een al gebruikte bevestigingslink geeft een veilige, begrijpelijke fout.
- [ ] Een verlopen bevestigingslink kan opnieuw worden aangevraagd of de gebruiker krijgt duidelijke hulp.
- [ ] **Wachtwoord vergeten** verstuurt de resetmail.
- [ ] De resetlink opent `account.html?mode=reset`.
- [ ] Een nieuw wachtwoord kan worden opgeslagen.
- [ ] Het oude wachtwoord werkt daarna niet meer.
- [ ] De securitymelding **Je wachtwoord is gewijzigd** wordt verstuurd.
- [ ] Magic link werkt wanneer deze functie later wordt geactiveerd.
- [ ] E-mailadres wijzigen werkt wanneer deze functie later wordt geactiveerd.
- [ ] Reauthentication toont een goed leesbare code wanneer deze functie later wordt geactiveerd.
- [ ] Een gedeelde-werkdaguitnodiging behoudt de `invite`-parameter na accountbevestiging.

### Weergave en aflevering

- [ ] Gmail desktop.
- [ ] Gmail mobiel.
- [ ] Apple Mail desktop en mobiel.
- [ ] Outlook.
- [ ] Donkere modus: tekst en knop blijven leesbaar.
- [ ] Lange fallback-links breken de layout niet.
- [ ] Afzendernaam toont `The GearHarbor`.
- [ ] Afzenderadres toont `info@thegearharbor.com`.
- [ ] Reply-to bereikt de bedoelde mailbox.
- [ ] SPF-resultaat is `pass`.
- [ ] DKIM-resultaat is `pass`.
- [ ] DMARC is aanwezig en geeft geen onverwachte fouten.
- [ ] De mail belandt niet structureel in spam.

## Handmatig nog in te vullen

- SMTP-provider.
- `SMTP_HOST`.
- `SMTP_PORT`.
- `SMTP_USERNAME`.
- `SMTP_PASSWORD`.
- DNS-records voor SPF en DKIM.
- DMARC-beleid.
- Reply-to-inrichting bij de provider, indien apart ondersteund.
- Dashboardtoggels voor de gewenste security notifications.

## Onderhoud

De templatenaam, onderwerpregel, gebruikte variabelen en verwachte flow staan in de tabellen in deze README. Deze metadata staat bewust niet als HTML-comment in de plakklare templates, omdat Supabase zulke comments gedeeltelijk zichtbaar kan maken in de uiteindelijke e-mail. Controleer bij toekomstige authwijzigingen altijd eerst of:

1. de gebruikte Supabase-methode is veranderd;
2. een nieuwe redirect- of callbackroute is toegevoegd;
3. de Redirect URL in Supabase is toegestaan;
4. de gebruikte templatevariabelen nog bij die template horen.

Actuele Supabase-documentatie:

- https://supabase.com/docs/guides/auth/auth-email-templates
- https://supabase.com/docs/guides/auth/auth-smtp
- https://supabase.com/docs/guides/auth/redirect-urls
