# Privacy policy — EasyStudio Photo and EasyStudio Video

*Last updated: 29 September 2026* · [Română mai jos](#politica-de-confidențialitate-română)

This policy covers the Windows apps **EasyStudio Photo** and **EasyStudio Video** (the "apps"), published in the Microsoft Store by **EasyStudio Apps**, an independent developer ("we").

## In short

- **Your photos, videos, sound and projects never leave your computer** because of us. We do not receive them, and we do not receive any personal data about you.
- There are **no accounts, no analytics or telemetry, no ads and no tracking** in the apps. We do not sell or share data, because we do not have any.
- The apps use the internet only for the things listed in section 2: downloading AI models, the optional AI assistant that you turn on yourself, checking a Pro purchase with the Microsoft Store, and links you open.

## 1. What the apps keep on your computer

The apps save the following **only on your computer**, in the app's data folder. Windows deletes that folder when you uninstall the app.

| What | Why | How to remove it |
|---|---|---|
| Your projects and exported files | You choose where to save them | Delete them like any other file |
| Settings (language, Simple / Advanced mode, AI settings) | To remember your choices | Change them in the app, or uninstall |
| List of recent files, with small thumbnails | To reopen your work quickly | *Clear list* on the start screen |
| Recovery copy of the work that is open | To bring your work back after a crash or power cut | Deleted automatically after you save or close normally |
| Downloaded AI models; in Video also the masks made by *Remove background* | So the AI tools also work offline and faster | Uninstall the app |
| API key of the optional AI assistant (only if you enter one) | To use the AI service you chose | Remove it in *AI settings*. It is **encrypted with Windows** (DPAPI), so only your Windows account can read it |
| Last known Pro status (kept up to 30 days) | So Pro keeps working when you are offline | Uninstall the app |
| Simple counters: how many times the app was opened and how many exports were made, the date of first use, the answer to the rating request, the start date of the free Pro trial, the free AI tries used today and the last version you saw | To ask for a Store rating at most every two weeks, to run the 7-day trial and the free limits, and to show "What's new" once after an update | Uninstall the app |

None of this is sent to us or to anyone else.

## 2. When the apps use the internet

**AI models (both apps).** The first time you use an AI tool, the app downloads the model file it needs from **Hugging Face** (`huggingface.co`, Hugging Face, Inc., USA) and keeps it on your computer.
- In EasyStudio Photo these tools are *Remove background*, *Select subject / object*, *Remove objects*, *Retouch portrait* and *Enlarge*.
- In EasyStudio Video these tools are *Automatic subtitles* and *Remove background*.

Only the model file is requested. **None of your pictures, videos or sound is sent**, and the AI then runs on your computer, also offline. As with any download, Hugging Face's servers see your IP address and standard technical request data; the [Hugging Face privacy policy](https://huggingface.co/privacy) applies to that.

**Optional AI assistant (EasyStudio Photo only).** It is **off by default**. You can turn it on in *AI settings* by choosing a provider:
- **Ollama:** runs on your computer, so nothing leaves it.
- **Anthropic (Claude), OpenAI (ChatGPT) or Google (Gemini):** you use **your own API key**. When you press *Ask*, *Suggest improvements* or *Generate in selection*, the app sends the following directly from your computer to the provider you chose, over an encrypted connection (HTTPS):
  - your written request;
  - for *Ask* and *Suggest improvements*: a small copy of the picture, only if *Let the AI see the picture* is on in *AI settings*;
  - for *Generate in selection*: the picture and the selected area, which this tool needs in order to paint.

We never receive any of it. That provider handles the data under its own terms and privacy policy, and you can check or delete your data with them. You can turn off *Let the AI see the picture*, remove your key or turn the assistant off at any time in *AI settings*.

**Microsoft Store (both apps).**
- Pro is bought, paid for and refunded **entirely through the Microsoft Store**. To see whether you own Pro, the app asks Windows' Microsoft Store component. The answer is only "Pro: yes or no" and the price. We never see your name, e-mail address, Microsoft account or payment details.
- If you agree to rate the app, Windows shows the Store's own rating window.
- The [Microsoft privacy statement](https://privacy.microsoft.com/privacystatement) applies to the Store.
- As the publisher, we receive from Microsoft (in Partner Center) **aggregate reports**: numbers of downloads, purchases and ratings, and the reviews you publish in the Store.
- We may also receive **crash reports** that Windows collects when an app closes unexpectedly. We use these reports only to find and fix bugs. We do not combine them with other data and do not try to identify anyone. If a crash report ever contains personal information, we delete it within 30 days.

**Links.** Links such as *Get a key*, *Privacy policy*, *Report a problem* or *Orders and refunds* open in your web browser. The website you open has its own privacy policy.

## 3. What the apps do not do

- They do not create accounts and do not ask for your name, e-mail address or contacts.
- They do not use analytics, telemetry, advertising, cookies or tracking.
- They do not use your location, camera or microphone.
- They open only the files and folders that you choose.

## 4. AI results

Some tools create new content with AI models: *Remove objects*, *Enlarge*, *Retouch portrait*, *Automatic subtitles* and the optional AI assistant. Results can be inaccurate or unexpected; check them before you use them. To report an inappropriate or harmful AI result, use **Report a problem** (in EasyStudio Photo in the *AI* and *Help* menus, in EasyStudio Video in *Help*). Reports are public GitHub issues, so do not include personal information or private pictures in them.

## 5. Security

- Your files and data stay on your computer.
- Connections to Hugging Face, the AI providers and the Microsoft Store use encryption (HTTPS).
- API keys are encrypted with Windows.
- The apps are distributed and signed by the Microsoft Store.

## 6. Your choices and rights

- Everything the apps store is on your computer, so you can see, change and delete it at any time, as shown in the table in section 1. Uninstalling an app deletes its data folder. Your own projects and exports stay where you saved them.
- We do not collect or keep personal data about you, so there is nothing for us to give you a copy of, correct or delete. If you think we hold information about you (for example something you wrote in a GitHub issue), contact us and we will help.
- **If you live in the EU/EEA (GDPR):** you have the right to access, correct, delete and move your personal data, to restrict or object to its processing, and to complain to a data protection authority. In Romania that authority is ANSPDCP ([dataprotection.ro](https://www.dataprotection.ro)); elsewhere, the authority where you live. The processing described above happens on your device when you use a feature, to give you that feature. For Store purchases, Microsoft is an independent controller.
- Hugging Face and the cloud AI providers are based in the USA. When you use those features, your computer connects to them directly.

## 7. Children

The apps are for everyone and do not collect personal information from anyone, children included. The optional cloud AI providers have their own age requirements. A parent should set up the AI assistant for a child, or leave it off.

## 8. Changes to this policy

We update this policy when features change. The date at the top shows the latest version. Earlier versions are kept in the [history of this file on GitHub](https://github.com/bucuriftimi-debug/EasyStudio/commits/main/PRIVACY.md).

## 9. Contact

Questions about privacy: open an issue at <https://github.com/bucuriftimi-debug/EasyStudio/issues>. Issues are public, so do not write personal information there.

---

# Politica de confidențialitate (română)

*Ultima actualizare: 29 septembrie 2026*

Această politică se aplică aplicațiilor Windows **EasyStudio Photo** și **EasyStudio Video** („aplicațiile”), publicate în Microsoft Store de **EasyStudio Apps**, un dezvoltator independent („noi”).

## Pe scurt

- **Pozele, videoclipurile, sunetul și proiectele tale nu pleacă de pe calculatorul tău** din cauza noastră. Nu le primim și nu primim nicio dată personală despre tine.
- Aplicațiile **nu au conturi, analiză sau telemetrie, reclame ori urmărire**. Nu vindem și nu dăm date nimănui, pentru că nu avem.
- Aplicațiile folosesc internetul doar pentru ce scrie la punctul 2: descărcarea modelelor AI, asistentul AI opțional pe care îl pornești tu, verificarea cumpărăturii Pro în Microsoft Store și link-urile pe care le deschizi.

## 1. Ce păstrează aplicațiile pe calculatorul tău

Aplicațiile salvează următoarele **doar pe calculatorul tău**, în folderul de date al aplicației. Windows șterge acest folder când dezinstalezi aplicația.

| Ce | De ce | Cum îl ștergi |
|---|---|---|
| Proiectele și fișierele exportate | Tu alegi unde le salvezi | Le ștergi ca pe orice fișier |
| Setările (limba, modul Simplu / Avansat, setările AI) | Ca să-ți țină minte alegerile | Le schimbi în aplicație sau dezinstalezi |
| Lista fișierelor recente, cu miniaturi mici | Ca să-ți redeschizi repede lucrul | *Golește lista* pe ecranul de start |
| Copia de recuperare a lucrului deschis | Ca să-ți recuperezi munca după o blocare sau o pană de curent | Se șterge singură după ce salvezi sau închizi normal |
| Modelele AI descărcate; în Video și măștile făcute de *Scoate fundalul* | Ca uneltele AI să meargă și fără internet, și mai repede | Dezinstalezi aplicația |
| Cheia API a asistentului AI opțional (doar dacă o introduci) | Ca să folosești serviciul AI ales | O ștergi din *Setări AI*. E **criptată de Windows** (DPAPI), deci doar contul tău Windows o poate citi |
| Ultima stare Pro cunoscută (păstrată până la 30 de zile) | Ca Pro să meargă și fără internet | Dezinstalezi aplicația |
| Contoare simple: de câte ori ai deschis aplicația și câte exporturi ai făcut, data primei folosiri, răspunsul la cererea de notă, data de început a probei Pro gratuite, încercările AI gratuite folosite azi și ultima versiune văzută | Ca să cerem o notă în Store cel mult o dată la două săptămâni, pentru proba de 7 zile și limitele versiunii gratuite, și ca să arătăm „Ce e nou” o singură dată după o actualizare | Dezinstalezi aplicația |

Nimic din toate acestea nu ne este trimis nouă sau altcuiva.

## 2. Când folosesc aplicațiile internetul

**Modelele AI (ambele aplicații).** Prima dată când folosești o unealtă AI, aplicația descarcă fișierul modelului de care are nevoie de la **Hugging Face** (`huggingface.co`, Hugging Face, Inc., SUA) și îl păstrează pe calculatorul tău.
- În EasyStudio Photo, uneltele sunt *Scoate fundalul*, *Selectează subiectul / obiectul*, *Șterge obiecte*, *Retușare portret* și *Mărește*.
- În EasyStudio Video, uneltele sunt *Subtitrări automate* și *Scoate fundalul*.

Se cere doar fișierul modelului. **Nu se trimite nicio poză, niciun video și niciun sunet de-al tău**, iar AI-ul rulează apoi pe calculatorul tău, și fără internet. Ca la orice descărcare, serverele Hugging Face văd adresa ta IP și datele tehnice obișnuite ale cererii; pentru ele se aplică [politica de confidențialitate Hugging Face](https://huggingface.co/privacy).

**Asistentul AI opțional (doar EasyStudio Photo).** E **oprit din start**. Îl poți porni din *Setări AI*, alegând un furnizor:
- **Ollama:** rulează pe calculatorul tău, deci nimic nu pleacă de pe el.
- **Anthropic (Claude), OpenAI (ChatGPT) sau Google (Gemini):** folosești **propria ta cheie API**. Când apeși *Cere*, *Sugerează îmbunătățiri* sau *Generează în selecție*, aplicația trimite următoarele direct de pe calculatorul tău la furnizorul ales, printr-o conexiune criptată (HTTPS):
  - cererea ta scrisă;
  - la *Cere* și *Sugerează îmbunătățiri*: o copie mică a pozei, doar dacă e bifat *Lasă AI-ul să vadă poza* în *Setări AI*;
  - la *Generează în selecție*: poza și zona selectată, de care unealta are nevoie ca să picteze.

Noi nu primim nimic din toate acestea. Furnizorul se ocupă de date după propriii termeni și propria politică de confidențialitate, iar datele tale le verifici sau le ștergi la el. Oricând poți debifa *Lasă AI-ul să vadă poza*, șterge cheia sau opri asistentul din *Setări AI*.

**Microsoft Store (ambele aplicații).**
- Pro se cumpără, se plătește și se rambursează **doar prin Microsoft Store**. Ca să afle dacă ai Pro, aplicația întreabă componenta Microsoft Store din Windows. Răspunsul e doar „Pro: da sau nu” și prețul. Noi nu vedem niciodată numele, e-mailul, contul Microsoft sau datele tale de plată.
- Dacă accepți să dai o notă aplicației, Windows îți arată fereastra de notare a Store-ului.
- Pentru Store se aplică [declarația de confidențialitate Microsoft](https://privacy.microsoft.com/privacystatement).
- Ca editor, primim de la Microsoft (în Partner Center) **rapoarte cumulate**: numărul de descărcări, cumpărături și note, plus recenziile pe care le publici în Store.
- Putem primi și **rapoarte de erori** pe care Windows le strânge când o aplicație se închide neașteptat. Le folosim doar ca să găsim și să reparăm defecte. Nu le combinăm cu alte date și nu încercăm să identificăm pe nimeni. Dacă un astfel de raport conține vreodată informații personale, îl ștergem în cel mult 30 de zile.

**Link-uri.** Link-urile precum *Obține o cheie*, *Politica de confidențialitate*, *Raportează o problemă* sau *Comenzi și rambursări* se deschid în browserul tău. Site-ul deschis are propria politică de confidențialitate.

## 3. Ce nu fac aplicațiile

- Nu creează conturi și nu-ți cer numele, e-mailul sau contactele.
- Nu folosesc analiză, telemetrie, reclame, cookie-uri sau urmărire.
- Nu folosesc locația, camera sau microfonul.
- Deschid doar fișierele și folderele pe care le alegi tu.

## 4. Rezultatele AI

Unele unelte creează conținut nou cu modele AI: *Șterge obiecte*, *Mărește*, *Retușare portret*, *Subtitrări automate* și asistentul AI opțional. Rezultatele pot fi greșite sau neașteptate, așa că verifică-le înainte să le folosești. Ca să raportezi un rezultat AI nepotrivit sau dăunător, folosește **Raportează o problemă**: în EasyStudio Photo e în meniurile *AI* și *Ajutor*, în EasyStudio Video în *Ajutor*. Rapoartele sunt probleme publice pe GitHub, deci nu pune în ele informații personale sau poze private.

## 5. Securitate

- Fișierele și datele tale rămân pe calculatorul tău.
- Conexiunile la Hugging Face, la furnizorii AI și la Microsoft Store sunt criptate (HTTPS).
- Cheile API sunt criptate de Windows.
- Aplicațiile sunt distribuite și semnate de Microsoft Store.

## 6. Alegerile și drepturile tale

- Tot ce păstrează aplicațiile e pe calculatorul tău, deci poți vedea, schimba și șterge oricând, cum scrie în tabelul de la punctul 1. Dezinstalarea unei aplicații îi șterge folderul de date. Proiectele și exporturile tale rămân unde le-ai salvat.
- Nu strângem și nu păstrăm date personale despre tine, așa că nu avem ce să-ți dăm în copie, să corectăm sau să ștergem. Dacă crezi că avem totuși informații despre tine (de exemplu ceva scris de tine într-o problemă pe GitHub), scrie-ne și te ajutăm.
- **Dacă locuiești în UE/SEE (GDPR):** ai dreptul să îți accesezi, corectezi, ștergi și muți datele personale, să restricționezi prelucrarea lor sau să te opui ei, și să faci plângere la o autoritate de protecție a datelor. În România, autoritatea este ANSPDCP ([dataprotection.ro](https://www.dataprotection.ro)); în altă țară, autoritatea de acolo. Prelucrarea descrisă mai sus are loc pe dispozitivul tău, când folosești o funcție, ca să-ți oferim acea funcție. Pentru cumpărăturile din Store, Microsoft este operator independent.
- Hugging Face și furnizorii AI din cloud se află în SUA. Când folosești acele funcții, calculatorul tău se conectează direct la ei.

## 7. Copii

Aplicațiile sunt pentru toată lumea și nu strâng informații personale de la nimeni, deci nici de la copii. Furnizorii AI din cloud au propriile limite de vârstă. Un părinte ar trebui să configureze asistentul AI pentru un copil sau să-l lase oprit.

## 8. Modificări ale politicii

Actualizăm politica atunci când se schimbă funcțiile aplicațiilor. Data de sus arată ultima versiune. Versiunile anterioare rămân în [istoricul acestui fișier pe GitHub](https://github.com/bucuriftimi-debug/EasyStudio/commits/main/PRIVACY.md).

## 9. Contact

Întrebări despre confidențialitate: deschide o problemă (issue) la <https://github.com/bucuriftimi-debug/EasyStudio/issues>. Problemele sunt publice, deci nu scrie acolo informații personale.
