# Publicare în Microsoft Store (fără avertismentul SmartScreen)

## De ce Store

Windows arată „Windows protected your PC” (SmartScreen) la programele descărcate care nu sunt semnate digital. Ai trei variante:

| Variantă | Cost | Scapă de SmartScreen? |
|---|---|---|
| **Microsoft Store** (recomandat) | **gratuit** pentru dezvoltatori individuali (din septembrie 2025) | **Da, imediat.** Microsoft semnează pachetul la publicare. |
| Certificat de semnare pentru persoane fizice (de ex. Certum Cloud Code Signing) | ~100–120 $ pe an, cu verificare de identitate | **Nu imediat.** Avertismentul dispare după ce semnătura strânge reputație (câteva sute de descărcări). Din martie 2024 nici certificatele EV nu mai dau reputație instant. |
| Azure Artifact Signing (fostul Trusted Signing), ~10 $ pe lună | — | Pentru persoane fizice, doar în SUA și Canada. În România merge doar cu firmă. |

Installerele `.exe` de pe GitHub rămân nesemnate. Pentru ele, README-ul explică: **More info → Run anyway**, plus sumele SHA-256.

## Pașii, o singură dată (îi faci tu, contul e pe numele tău)

1. **Cont de dezvoltator.** Intri pe <https://storedeveloper.microsoft.com> → *Get started* → cont **individual** (gratuit, cu verificare scurtă a identității).
2. **Rezervi numele aplicației** în Partner Center: *Apps and games* → *New product* → *MSIX or PWA app*:
   - „EasyStudio Photo”;
   - apoi, separat, „EasyStudio Video”.
3. **Copiezi datele de identitate.** Pentru fiecare aplicație: *Product management → Product identity*. Copiezi trei valori:
   - `Package/Identity/Name` (de ex. `12345Bucuriftimi.EasyStudioPhoto`);
   - `Package/Identity/Publisher` (de ex. `CN=AB12CD34-…`);
   - `Package/Properties/PublisherDisplayName`.
4. **Pui valorile în proiect.** În `apps/photo/electron-builder.yml` (și la fel în `apps/video/…`), secțiunea `appx:`:
   - `identityName`;
   - `publisher`;
   - `publisherDisplayName`.
   (Sau mi le dai mie și le pun eu.)

## Construirea pachetului

```powershell
. .\env.ps1
npm run photo:store      # → dist\photo\EasyStudio Photo 1.0.0.appx
npm run video:store      # → dist\video\EasyStudio Video 1.0.0.appx
```

Pachetul nu e semnat, intenționat: Store-ul îl semnează la publicare.

## Trimiterea în Store (Partner Center → aplicația → *Start submission*)

- **Packages:** încarci fișierul `.appx`.
- **Store listing:**
  - descriere (poți folosi textul din README);
  - capturi de ecran din `docs/images/`, minim una, 1366×768 sau mai mare.
- **Privacy policy URL:** `https://github.com/bucuriftimi-debug/EasyStudio/blob/main/PRIVACY.md`. Aplicațiile folosesc internetul (modelele AI, asistentul opțional), deci e obligatorie.
- **Age ratings:** chestionarul IARC. Aplicația nu are conținut special, deci iese „3+”.
- **Pricing and availability:** aplicația e **Free**. Banii vin din add-on-ul Pro (mai jos).

Verificarea Microsoft durează de obicei 1–3 zile. După aprobare, oamenii instalează aplicația din Store fără niciun avertisment, iar actualizările vin automat când încarci o versiune nouă (crești `version` în `package.json`).

## Versiunea Pro (add-on), pentru fiecare aplicație

Aplicațiile sunt gratuite, iar Pro se cumpără din interiorul lor. Tehnic, Pro e un **add-on** al aplicației din Store: Microsoft se ocupă de cont, plată, TVA, facturi și rambursări, iar cumpărătura îl urmează pe om pe toate PC-urile cu același cont Microsoft. Nu avem nevoie de conturi, bază de date sau server propriu.

1. Partner Center → aplicația → **Add-ons** → **Create a new add-on**.
2. **Product type: Durable** (se plătește o singură dată și rămâne pentru totdeauna).
3. **Product ID: `pro`**, exact așa, cu litere mici. Aplicația caută după acest nume.
4. În submisia add-on-ului completezi:
   - **Properties:** Product lifetime *Forever*, Content type *Software as a service* (sau cel mai apropiat).
   - **Pricing:** prețul, de exemplu 7,99 $.
   - **Store listing:** titlul („EasyStudio Photo Pro”) și o descriere scurtă a ce deblochează.
5. Trimiți add-on-ul la verificare, împreună cu aplicația sau după ea.

Ca să primești banii: **Account settings → Payout and tax profiles**. Acolo completezi contul bancar (IBAN) și formularul de taxe (W-8BEN pentru persoane fizice din România).

**Ce e gratuit și ce e Pro** (regulile sunt în `apps/photo/src/renderer/src/state/pro.ts` și `apps/video/src/renderer/src/state/pro.ts`):

| | Gratuit | Pro |
|---|---|---|
| Foto | toate uneltele de editare, 3 șabloane, AI de 3 ori pe zi, export până la 1920 px (JPG/PNG) | AI nelimitat, export la rezoluție completă și WebP, toate șabloanele, import PSD, ștampila de clonare |
| Video | tot editorul, export 720p curat, 1080p cu semnul „Made with EasyStudio”, până la 30 fps | 1440p și 4K, 50/60 fps, fără semn, calitate mare, WebM |

Ca să folosești tu Pro fără să-l cumperi, generează-ți un **cod promoțional** gratuit: Partner Center → add-on-ul → **Promo codes**.

## Note

- În versiunea din Store, datele aplicației stau în folderul Windows al pachetului (`AppData\Local\Packages\…`), pentru că folderul de instalare al aplicațiilor din Store e doar pentru citire. Pe calculatorul tău poți folosi mai departe installerul `.exe`, care ține totul pe E:.
- Pachetele din Store trebuie să treacă testele automate ale Microsoft (Windows App Certification Kit). Pe calculatorul tău le poți rula din Windows SDK, dacă vrei să verifici înainte.
