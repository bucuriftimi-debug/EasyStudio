# EasyStudio

Două aplicații desktop (Windows), ușor de folosit, care fac toată munca pe placa video:

- **EasyStudio Photo** (v1.0.0, gata): editor foto, cu funcțiile importante din Photoshop, dar simplu. În română și engleză.
- **EasyStudio Video** (v1.0.0, gata): editor video ușor, ca CapCut: tai clipuri, pui titluri, muzică, filtre și tranziții, exporți MP4 până la 4K. În română și engleză.

Totul (cod, cache-uri, date) stă pe **E:**, în folderul ăsta. Nimic nu se instalează pe C:.

## Pornire rapidă

| Ce vrei | Comandă |
|---|---|
| Pornești aplicația foto / video | dublu-click pe `Porneste-Photo.bat` / `Porneste-Video.bat` |
| Instalezi aplicațiile | `dist\photo\EasyStudio-Photo-Setup-1.0.0.exe` și `dist\video\EasyStudio-Video-Setup-1.0.0.exe`: alege un folder pe E: la instalare |
| Test automat AI (pe o poză) | `node_modules\electron\dist\electron.exe apps\photo --selftest --selftest-script tools\selftest-ai.js --selftest-image <poză.png>` |
| Test automat asistent AI (cu Ollama pornit) | `node_modules\electron\dist\electron.exe apps\photo --selftest --selftest-script tools\selftest-assist.js --selftest-image <poză.png> --selftest-shot <captură.png>` |
| Descarci / inspectezi modelele AI (dezvoltare) | `node tools\models.mjs` · `node tools\onnx-inspect.mjs <model.onnx>` |
| Test automat al aplicației reale | `node_modules\electron\dist\electron.exe apps\photo --selftest` |
| Dezvoltare cu reîncărcare automată | `. .\env.ps1` apoi `npm run photo:dev` |
| Doar interfața, în browser | `npm run photo:web`, apoi deschizi http://localhost:5190 |
| Teste | `npm test` |
| Refaci installerul | `. .\env.ps1` apoi `npm run photo:dist` |

> Rulează **mereu** `. .\env.ps1` înainte de `npm install` sau build. Scriptul mută pe E: cache-urile npm, Electron și electron-builder și folderul TEMP.
> npm 12 blochează scripturile de instalare. După un `npm install` curat, rulează o dată `node node_modules\electron\install.js`, ca să se descarce Electron.

## Structură

```
packages/core   istoric undo/redo, geometria straturilor, presetări (dimensiuni, crop, export)
packages/gpu    renderer WebGL2: ajustări, filtre, blur/claritate, moduri de amestec, export
packages/ui     temă + componente comune (butoane, glisoare, ferestre, meniuri), traduceri
packages/draw   text desenat pe canvas (titluri), stiluri rapide, fonturile incluse — comun foto + video
apps/photo      aplicația foto (Electron: main, preload, interfața React)
apps/video      aplicația video (Electron; Mediabunny + WebCodecs pentru citire / export)
tools/          scripturi ajutătoare (iconiță)
.cache/ .data/  cache-uri și date de rulare (pe E:)
```

## Ce știe acum editorul foto (fazele F0 + F1)

- **Deschidere:** poze prin dialog, drag & drop oriunde sau lipire cu Ctrl+V. Imaginile trase peste un proiect deschis devin straturi.
- **Ecran de start:** „Ce vrei să faci?”, cu dimensiuni gata setate (Instagram, Story, YouTube, A4…).
- **Mod Simplu / Pro:** în Pro apar în plus modurile de amestec și glisoarele avansate.
- **Unelte:**
  - **Mută**: mutare, redimensionare, rotire, cu ghidaje care se „lipesc” de centru și margini.
  - **Crop**: proporții gata setate, 1:1, 4:5, 9:16, 16:9, A4.
  - **Mână**: mutare prin imagine. Merge și cu Space, iar rotița face zoom.
- **Ajustări pe GPU:**
  - expunere, luminozitate, contrast, lumini/umbre;
  - căldură, nuanță, saturație, vibrance, rotire de nuanță;
  - claritate, clarificare, blur, vignetă, grain, fade;
  - buton **Auto** care îmbunătățește poza singur.
- **12 filtre:** Vivid, Warm, Cool, Golden hour, Matte, Film, Cinematic, Dramatic, Vintage, B&W, Noir, Sepia. Au miniaturi randate pe GPU și un glisor de intensitate.
- **Straturi:** adaugă, duplică, șterge, reordonează, ascunde, opacitate, 16 moduri de amestec, redenumire.
- **Operații pe imagine:** rotire 90°, oglindire, redimensionare, dimensiunea canvasului (cu punct de ancorare).
- **Istoric:** undo/redo nelimitat, plus panou de istoric. Dai click pe un pas și te întorci la el.
- **Before / After:** ții apăsat butonul sau tasta `\`.
- **Export:** JPG, PNG, WebP, cu calitate, dimensiune și estimarea mărimii fișierului.
- **Proiecte `.esp`:** păstrează straturile și toate setările, nedistructiv.

## Performanță

Poză de 4000×3000 (12 MP), măsurată pe placa **integrată** AMD. În aplicația Electron rulează pe GTX 1650, care e mai rapidă.

| Situație | Timp |
|---|---|
| Ajustări de culoare, imagine potrivită pe ecran | ~2 ms pe cadru |
| Toate efectele (claritate + blur + grain…), imagine potrivită pe ecran | ~6 ms pe cadru |
| Export la rezoluție completă, inclusiv codarea JPG | ~1,3 s |

Pe ecran, efectele se calculează la rezoluția de afișare. Exportul se face mereu la rezoluția completă.

## Faza F2: desen, selecții, text, forme, măști

- **Pensulă, radieră, ștampilă de clonare:** mărime, duritate, opacitate, netezire, presiune pentru creion de tabletă.
  - Alt+click cu pensula ia culoarea din imagine.
  - Shift+click trage o linie dreaptă.
  - La clonare, Alt+click alege sursa.
- **Umplere:** găleată (toleranță, doar zona conectată) și gradient (liniar sau radial, spre transparent).
- **Selecții:**
  - dreptunghi, elipsă, lasso, baghetă magică;
  - combinare: nouă, adaugă (Shift), scade (Alt), intersectează;
  - margine animată („furnici”) desenată de GPU;
  - Select all, Deselect, Invert, Soften / Grow / Shrink;
  - șterge / umple / copiază în strat nou / decupează la selecție;
  - copiere în clipboard.
- **Text:** strat editabil oricând.
  - 13 fonturi incluse (Montserrat, Poppins, Anton, Pacifico…) plus fonturile din Windows;
  - 8 stiluri rapide (Titlu, Neon, Contur, Etichetă, Meme…);
  - contur, umbră, fundal colorat;
  - culoarea se alege singură, ca textul să se citească;
  - redimensionarea din mâner schimbă mărimea fontului, deci textul rămâne clar.
- **Forme:** dreptunghi (colțuri rotunjite), elipsă, triunghi, stea, linie, săgeată. Sunt editabile și clare la orice mărime.
- **Măști de strat** (Pro): ascunzi părți fără să ștergi nimic. Pensula ascunde, radiera arată din nou, iar gradientul face o estompare.
- **Culori:** principală și secundară, selector cu paletă, culori recente și pipetă de ecran. X schimbă între ele, D revine la alb/negru.
- **Pictatul pe text sau formă** creează singur un strat nou, ca textul să rămână editabil.
- **Undo eficient:** se salvează doar tile-urile de 256×256 atinse. O linie diagonală pe 12 MP ocupă ~33 de tile-uri, nu imaginea întreagă.
- **Viteză pensulă:** ~2,5 ms la fiecare mișcare pe o imagine de 12 MP (placa integrată).

## Faza F3: AI local, gratuit, fără cont (butonul „AI” din bara de sus)

Totul rulează pe placa video prin WebGPU (ONNX Runtime Web, într-un Web Worker). Fiecare model se descarcă o singură dată, după o întrebare cu mărimea lui, în folderul de date al aplicației (pe E:). Apoi merge offline.

| Funcție | Model (licență) | Timp pe GTX 1650 (poză 512 px) |
|---|---|---|
| Scoate fundalul (devine **mască**, deci o poți corecta cu pensula) | IS-Net / DIS general-use (Apache-2.0), 179 MB | ~0,5 s (+1,5 s prima dată) |
| Selectează subiectul | același IS-Net | ~0,5 s |
| Selectează un obiect cu un click (unealta Select → Object) | MobileSAM encoder + decoder multi-mask (Apache-2.0/MIT), 45 MB | ~1 s prima dată, apoi ~0,07 s pe click |
| Șterge obiecte (unealta **Remove**, tasta R): pictezi peste obiect | LaMa (Apache-2.0), 208 MB | câteva secunde |
| Mărire 2× / 4× cu detalii | Real-ESRGAN general-x4v3 (BSD-3), 5 MB | ~2 s pentru 512 → 2048 |

Detalii tehnice aflate pe parcurs:
- **BiRefNet nu merge pe GTX 1650.** Decoderul lui are operatori `Split`/`Concat` cu 17 până la 1024 de intrări/ieșiri, peste limita de 16 „storage buffers” a plăcii, iar pe CPU rămâne fără memorie. De aceea folosim IS-Net.
- **MobileSAM vrea imaginea exact la latura de 1024.** Pozele mici trebuie mărite înainte, altfel masca iese deplasată.
- **Selecția prin click folosește decoderul „multi”.** Dintre variantele cu încredere mare se alege cea mai mare, ca să iasă obiectul întreg, nu doar un petic.
- **Dacă un model cade pe GPU, trece automat pe CPU.** Dacă rămâne fără memorie, worker-ul AI repornește.

## Faza F4: AI „spune ce vrei” (opțional, cu cheia ta sau Ollama gratuit)

Meniul **AI** are acum și:

- **Ask AI to edit… (Ctrl+K)**: scrii ce vrei, de exemplu *„fă-o mai caldă, decupeaz-o pătrat pentru Instagram și pune titlul Vară sus”*.
  - AI-ul alege din lista fixă de comenzi ale editorului (tool calling).
  - Tu vezi imediat o **previzualizare** și poți debifa ce nu vrei.
  - **Apply** face totul un singur pas de undo. **Cancel** lasă poza neatinsă.
- **Suggest improvements**: AI-ul se uită la poză și propune ajustări (lumină, culoare, filtru). Nu face crop și nu adaugă text.
- **Generate in selection…**: selectezi o zonă, descrii ce să apară acolo, iar OpenAI / Gemini o pictează pe un **strat nou**, cu selecția ca mască. Restul pozei rămâne neatins.
- **AI settings…**: alegi furnizorul.

| Furnizor | Cost | Ce face |
|---|---|---|
| Off (implicit) | — | doar uneltele AI locale din F3 |
| **Ollama** | gratuit, local (modelele tale din E:\ollama-data) | comenzi; vede poza doar cu modele „vision” (llava, gemma3, qwen2.5-vl…) |
| **Claude** | cheie API de la console.anthropic.com (abonamentul claude.ai **nu** include credite API) | comenzi + vede poza; implicit `claude-opus-5` ($5 / $25 pe milion de tokeni), la alegere Sonnet 5 / Haiku 4.5; arată costul fiecărei cereri |
| **ChatGPT (OpenAI)** | cheie API (platform.openai.com) | comenzi + vede poza + umplere generativă |
| **Gemini** | cheie API (aistudio.google.com, are nivel gratuit) | comenzi + vede poza + umplere generativă |

- **Cheile sunt criptate cu Windows (DPAPI, `safeStorage`).** Stau în `ai-settings.json`, în folderul de date de pe E:, și nu ajung niciodată în interfață: cererile pleacă doar din procesul principal.
- **Tot ce propune AI-ul e verificat de aplicație înainte să fie aplicat.** Nume de comenzi cunoscute, valori limitate la intervalul permis.
- **Modelele care nu văd poza primesc câteva cifre despre ea:** luminozitate, contrast, saturație, tentă de culoare.
- **Testat:**
  - cu Ollama + qwen2.5:7b:
    - comandă cu 3–4 editări: ~12–16 s;
    - sugestii: ~20 s;
    - previzualizare, debifare, undo și Cancel verificate;
  - Claude / OpenAI / Gemini: verificat cu chei false că serverele răspund „cheie invalidă” (adrese și format corecte). Cu o cheie reală nu a fost testat încă.

## Faza F5: finisare (versiunea 1.0.0)

- **Română și engleză.**
  - Prima dată aplicația pornește în limba Windows-ului.
  - Limba se schimbă din Ajutor → English / Română sau de jos, de pe ecranul de start.
  - Sunt traduse și ferestrele native: „modificări nesalvate”, tipurile de fișiere și erorile AI.
  - Un test verifică să nu lipsească nicio traducere.
- **Import Photoshop (.psd).**
  - Fiecare strat rămâne strat, cu poziție, opacitate, mod de amestec, vizibilitate și mască.
  - Grupurile se aplatizează.
  - Pozele pe 16/32 biți se convertesc.
  - Straturile de ajustare, stilurile de strat și modurile de amestec care nu există la noi sunt numărate, iar utilizatorul primește un mesaj.
- **Fișiere recente.**
  - Apar pe ecranul de start, cu miniaturi, și în meniul Fișier.
  - Dublu-click pe un `.esp` în Windows deschide proiectul în aplicația deja pornită (o singură fereastră).
- **Salvare automată și recuperare după crash.**
  - La fiecare minut, dacă ai modificări, se păstrează o copie în folderul de date de pe E:.
  - Dacă aplicația cade, la repornire apare „Ultima ta lucrare nu a fost salvată”, cu butoanele Recuperează / Renunță.
  - La o închidere normală, copia se șterge.
- **6 șabloane pe ecranul de start:** citat, miniatură YouTube, anunț Story, reduceri, felicitare, afiș. Sunt făcute din straturi editabile (text, forme, fundal), iar textele se micșorează singure dacă traducerea e mai lungă.
- **Sfaturi la prima pornire:** un tur în 5 pași cu evidențiere (unelte, panou, AI, Simplu/Pro, Export). Se poate relua din Ajutor → Arată sfaturile.
- **Poze mari.** Limita reală a plăcii video se citește la pornire (16384 px pe GTX 1650; înainte se folosea greșit 8192). Pe o poză de 12000 × 8000 (96 MP):

  | Operație | Timp |
  |---|---|
  | Deschidere | 0,3 s |
  | Glisor cu claritate activă | 7 ms pe cadru |
  | Export JPG la rezoluție completă | 5,7 s |

Teste automate F5:

| Test | Comandă (din folderul proiectului) |
|---|---|
| Faci PSD-ul de test | `node tools\make-test-psd.mjs` |
| Import PSD, șabloane, fișiere recente, salvare automată, română | `...electron.exe apps\photo --selftest --selftest-script tools\selftest-f5.js --selftest-image .cache\testimg\test.psd` |
| Recuperare după crash (rulezi de 2 ori) | `...electron.exe apps\photo --selftest --selftest-session --selftest-script tools\selftest-f5-recover.js [--selftest-shot captură.png]` |
| Fișier trimis de Windows | `... --selftest --selftest-open <fișier> --selftest-script <script>` |

Opțiuni utile pentru `--selftest`:
- `--selftest-shot <png>`: face o captură la final;
- `--selftest-visible`: fereastra e „vizibilă”, dar în afara ecranului. Altfel Chromium nu mai desenează cadre și măsurătorile de viteză ies greșit.

## EasyStudio Video (v1.0.0)

Planul complet e în `docs/PLAN-VIDEO.md`. Fazele V0–V4 sunt gata, fiecare cu teste automate.

- **Import:**
  - video MP4 / MOV / WebM / MKV, muzică MP3 / WAV / M4A / OGG / FLAC, poze;
  - prin dialog sau drag & drop;
  - fișierele mari se citesc pe bucăți, nu întregi în memorie;
  - clipurile de pe telefon, filmate vertical, se rotesc corect.
- **Player pe GPU.** Decodarea e hardware (WebCodecs), iar ceasul sunetului conduce imaginea. Pe GTX 1650:

  | Material | Cadre afișate |
  |---|---|
  | 4K 30 fps | 111 din 116 |
  | 1080p 60 fps | 230 din 232 |

  Derularea arată exact cadrul cerut.
- **Cronologie ca la CapCut:**
  - pista principală e „magnetică”: fără goluri, ștergerea închide golul, clipurile se reordonează trăgându-le;
  - peste ea, piste libere pentru clipuri „deasupra” (picture-in-picture, poze, titluri) și pentru sunet;
  - tai (S), scurtezi din margini, ștergi, lipire de margini și de capul de redare;
  - zoom (Ctrl+rotiță), filmstrip și formă de undă;
  - undo / redo nelimitat.
- **Fiecare clip:**
  - poziție, mărime și rotire, direct în player, cu mânere;
  - încadrare sau umplere a cadrului, opacitate;
  - viteză 0,25×–4×;
  - volum, apariție și stingere treptată;
  - filtrele și glisoarele de culoare din aplicația foto;
  - tranziții: dizolvare, prin negru, alunecare, zoom (cu sunetul trecut treptat de la un clip la altul).
- **Titluri** cu cele 8 stiluri rapide și fonturile din foto (pachetul comun `packages/draw`).
- **Formatul filmului:** 16:9, 9:16, 1:1, 4:5.
- **Export:**
  - MP4 (H.264 + AAC) sau WebM (VP9 + Opus);
  - 720p / 1080p / 1440p / 4K, la 24–60 fps;
  - calitate Mică / Bună / Cea mai bună, cu mărimea estimată;
  - codare hardware, fișierul se scrie pe disc pe bucăți;
  - progres, timp rămas, anulare (care șterge fișierul neterminat);
  - 1080p30 se exportă la ~85–95 de cadre pe secundă (de ~3× mai repede decât timpul real).
- **Proiecte `.esv`:**
  - salvare / deschidere și proiecte recente;
  - dublu-click în Windows deschide proiectul;
  - salvare automată la 30 s, cu recuperare după crash.
- **Pentru începători:** tur de prima pornire, fereastră de ajutor cu scurtăturile (butonul „?”), română / engleză după limba Windows.

Teste (după `node_modules\electron\dist\electron.exe apps\video --selftest --selftest-visible --selftest-script …`):

| Script | Ce verifică |
|---|---|
| `tools\video-make-testmedia.js` | face clipurile de test (numărul cadrului desenat în biți, ton audio, clip „de telefon” rotit) |
| `tools\selftest-video-v0.js` | import, cadre exacte la derulare, sincronizare la redare, rotire |
| `tools\selftest-video-v1.js` | cronologie: tăiere, scurtare, reordonare, undo, redare peste tăieturi, salvare / deschidere |
| `tools\selftest-video-v2.js` | tranziții, filtre, viteză, titluri, mărime, format |
| `tools\selftest-video-v3.js` | export MP4 / WebM, anulare, verificarea cadrelor din fișierul exportat |
| `tools\selftest-video-v4.js` | recuperare după crash (rulat de 3 ori, cu `--selftest-session` la pașii 2 și 3) |
| `tools\video-perf.js` | fluiditatea redării la 4K30 și 1080p60 |

## Următorii pași (idei)
- **Video:**
  - subtitrări automate cu whisper.cpp local (știe română);
  - keyframes, green screen;
  - „taie pauzele” cu AI;
  - FFmpeg LGPL pentru formate rare.
