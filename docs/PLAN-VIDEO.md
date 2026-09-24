# EasyStudio Video: plan detaliat

> **Stare (2026-09-24):** fazele V0–V4 sunt gata. Versiunea 1.0.0 are installer în `dist\video\`. Detalii și teste în README.

Un editor video pentru oameni fără experiență: tai clipuri, pui text, muzică, filtre și tranziții, apoi exporți la calitatea dorită. Tot ce se poate rulează pe placa video.

## Decizii tehnice

| Ce | Alegere | De ce |
|---|---|---|
| Aplicația | Electron 44 + React 19 + Vite + zustand, în `apps/video` | Aceeași bază ca EasyStudio Photo |
| Cod comun | `packages/ui` (temă, componente, i18n), `packages/core` (undo/redo), `packages/gpu` (compunere pe GPU, ajustări, filtre) | Filtrele și ajustările din foto merg identic pe video |
| Citire și scriere video | **Mediabunny** (MPL-2.0) peste **WebCodecs** | Decodare și codare hardware pe GTX 1650 (H.264, HEVC, VP9, AV1 la citire), fără FFmpeg |
| Fișiere mari | Servite prin `app://video/media/<id>` cu cereri „Range” | Un film de câțiva GB nu se încarcă întreg în RAM; se citesc doar bucățile necesare |
| Sunet | Web Audio | Pistele se mixează în timp real; ceasul sunetului conduce redarea (sincron sunet-imagine) |
| Export | Același compozitor, pe un `OffscreenCanvas` la rezoluția finală → Mediabunny `Output`, scris pe disc pe bucăți | Ce vezi în previzualizare e ce exporți; nu umple memoria |
| Proiect | Fișier `.esv` (JSON cu căile către clipuri) | Mic, ușor de salvat automat |

## Cronologia (timeline), ca la CapCut, nu ca la Premiere

- **Pista principală e „magnetică”.** Clipurile stau lipite unul de altul. Dacă ștergi unul, golul se închide singur, iar dacă muți unul, celelalte fac loc.
- **Deasupra ei vin piste libere:**
  - suprapuneri (picture-in-picture, poze, logo);
  - text;
  - audio (muzică, voce).
- **Totul se „lipește”** de capul de redare, de marginile altor clipuri și de început.
- **Fiecare clip are:**
  - punct de început și de sfârșit în sursă;
  - viteză 0,25×–4×;
  - volum, cu fade in și fade out;
  - poziție, mărime și rotire;
  - opacitate;
  - ajustări și filtre (aceleași ca în foto);
  - tranziție la început: dizolvare, fade la negru, alunecare, zoom, ștergere.

## Redarea (previzualizarea)

- **Imagine.**
  - În timpul redării, fiecare clip vizibil are un iterator Mediabunny care decodează cadrele în ordine.
  - La derulare cu mouse-ul se cere direct cadrul de la momentul respectiv.
  - Cadrele (`VideoFrame`) se urcă direct în texturi WebGL, fără copii.
- **Sunet.** Clipurile audio se decodează pe bucăți în `AudioBuffer`-e și se programează pe `AudioContext`. Ora lui `AudioContext` e ceasul după care se aleg cadrele.
- **Viteză.** Previzualizarea se face la rezoluție redusă (~720p). Exportul se face la rezoluție completă.

## Exportul

- **Formate:** MP4 (H.264 hardware + AAC/Opus) și WebM (VP9 + Opus).
- **Rezoluție:** 720p / 1080p / 1440p / 4K, la 30 sau 60 fps.
- **Calitate:** Mică / Medie / Mare, cu estimarea mărimii fișierului.
- **Format imagine:** 16:9 (YouTube), 9:16 (TikTok/Reels/Shorts), 1:1 (Instagram), 4:5.
- **Sunet final:** toate pistele se mixează într-un `OffscreenAudioContext`/`OfflineAudioContext`.
- **În timpul exportului:** bară de progres cu timp rămas și buton Anulează.
- **Verificare:** după export, fișierul se redeschide și se verifică durata și numărul de cadre.

## Faze

| Faza | Ce conține |
|---|---|
| **V0 Fundație** | Aplicația Electron `apps/video`; import media (dialog și drag & drop); citire cu Mediabunny (durată, rezoluție, fps, codec, sunet); miniaturi; bibliotecă media; player simplu pentru un clip (imagine pe GPU + sunet); teste automate cu clipuri de test generate chiar de aplicație |
| **V1 Cronologie** | Pista magnetică + piste libere; tragi din bibliotecă; muți, tai capetele, împarți (S), ștergi; lipire; zoom; filmstrip și formă de undă; redarea întregului proiect sincronizată; undo/redo; salvare/deschidere `.esv` |
| **V2 Editare** | Panou de proprietăți (poziție, mărime, rotire, opacitate, viteză, volum, fade); ajustări și filtre din `packages/gpu`; tranziții; clipuri de text cu stiluri (textul din foto mutat într-un pachet comun); format 16:9 / 9:16 / 1:1 / 4:5; poze în cronologie |
| **V3 Export** | MP4 / WebM, presetări, codare hardware, progres, anulare, verificare automată |
| **V4 Finisare** | Română/engleză, salvare automată + recuperare, fișiere recente, sfaturi la prima pornire, installer 1.0 |
| **Mai târziu** | Subtitrări automate (whisper.cpp local, știe română); keyframes; green screen (shader chroma key); „taie pauzele” cu AI; FFmpeg LGPL pentru formate rare și copii mici (proxy) pentru 4K |

## Cum testăm

- **Testele nu depind de fișiere externe.** Folosesc clipuri generate chiar de aplicație cu Mediabunny: animație colorată cu numărul cadrului desenat pe ea și un ton audio cunoscut.
- **În testele automate Electron (`--selftest`) verific:**
  - importul;
  - redarea: cadrul corect la momentul corect, iar sunetul și imaginea sincrone;
  - tăierea;
  - exportul, apoi redeschiderea fișierului exportat și verificarea duratei și a numărului de cadre.
- **Capturi de ecran** după fiecare fază.
