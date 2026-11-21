# Sud trenajyori — backend (FastAPI)

AI o'quv simulyatsiyasi, real sud qarori emas. Raislik qiluvchi, prokuror va guvoh — AI; talaba — himoyachi.

## Ishga tushirish

```bash
cd server
pip install -r requirements.txt
cp .env.example .env            # kalitlar bo'sh bo'lsa: LLM=mock, STT=none, TTS=edge-tts (kalitsiz)
uvicorn app.main:app --reload --port 8000
# http://localhost:8000/docs
python -m pytest -q             # kalitsiz, mock bilan (edge-tts testi internet bo'lmasa skip)
python scripts/prewarm_cache.py # tayyor iboralarni mp3 keshga yozish (server ham fon rejimida qiladi)
```

Kontent: `../content/case.json` + `rules.json` (+ `tests.json`) bo'lsa o'sha, aks holda `fixtures/` (xuddi shu sxema).
Fayl o'zgarsa keyingi sessiyada avtomatik qayta yuklanadi.

## Endpointlar

| Metod | Yo'l | Nima |
|---|---|---|
| GET | `/health` | provayderlar, kontent manbai, ogohlantirishlar |
| GET | `/case` | ish materiali (yashirin faktsiz), bosqichlar, moddalar (`verified` bilan) |
| POST | `/session/start` `{case_id?, student_name?, mode?: "majlis"\|"talim"}` | `session_id`, birinchi bosqich, sudyaning ochilish so'zi, `audio_url` + `mode, floor, record_delta, tutor, window` |
| POST | `/turn` `{session_id, text? \| audio? (base64 webm), audio_mime?, action?}` | `{speaker, text_uz, stage_id, stage_kind, stage_changed, can_advance, finished, violation:{id, article_ref, article_verified, warning_uz}\|null, revealed_hidden_fact, audio_url, followups[], log_id, transcript_uz, timings, mode, floor, record_delta[], tutor\|null, window\|null}` |
| POST | `/stt` `{audio_b64, mime?}` | `{text_uz, ms, provider}` — Gemini flash-lite, audio saqlanmaydi; xatoda `422 stt_failed` / `bad_audio` |
| POST | `/finish` `{session_id}` | `{rubric:{criteria[4\|5], total, max, violations, mode, trap, hints_used, hints_left, pauses}, bayonnoma_html, record[], transcript}`. **Sessiyani yopadi**: keyingi `/turn` → `409 session_finished`; takroriy `/finish` keshdagi o'sha natijani qaytaradi (qayta baholanmaydi) |
| GET | `/session/{id}/bayonnoma` | bayonnoma HTML sahifasi (390 px da ham o'qiladi). Yakunlangan sessiya — keshdagi yakuniy bayonnoma; faol sessiya — joriy holatdan **oraliq bayonnoma** (dastlabki kod rubrikasi, LLM siz); ko'rish sessiyani yakunlamaydi va holatini o'zgartirmaydi |
| GET | `/session/{id}/approval` | talaba natija ekrani uchun, PIN siz: `{session_id, approved, teacher_name, at, at_uz, comment}` (tasdiqlanmagan bo'lsa `approved:false`, qolgani `null`); yo'q sessiya — `404 session_not_found` |
| GET | `/session/{id}` | holat va jurnal (debug) |
| GET | `/audio/{fayl}.mp3`, `/tts/{kalit}.mp3[?stream=1]` | keshdagi mp3 / deferred TTS |
| GET | `/teacher/sessions` (header `x-teacher-pin`) | o'qituvchi paneli: xotiradagi sessiyalar `{sessions:[{id, student_name, mode, started_at, last_activity, status: active\|finished, status_uz, stage_uz, score, max, violations, revealed_hidden_fact, trap_caught: true\|false\|null, hints_used, approval}], count}` |
| GET | `/teacher/sessions/{id}` (header `x-teacher-pin`) | yuqoridagi + `rubric` (yakunlanmagan bo'lsa kod bo'yicha dastlabki, `rubric_final:false`), `bayonnoma_url` |
| POST | `/teacher/sessions/{id}/approve` `{teacher_name, comment?}` (header `x-teacher-pin`) | tasdiq vaqti xotirada saqlanadi, bayonnomaga «O'qituvchi tasdiqladi: ism, vaqt — tasdiqlangan baho: X / Y» qatori qo'shiladi (`approval.total/max`); yakunlanmagan sessiya avval `/finish` dagi kabi yakunlanadi va yopiladi |

**O'qituvchi paneli (R14).** Yakuniy baho — odamniki (O'RQ-1115 ruhida): AI rubrikasi tavsiya, o'qituvchi tasdiqlaydi.
Himoya — oddiy PIN: `.env` da `TEACHER_PIN=...` (standart **`1234`**, demo uchun; real foydalanishda almashtiring),
so'rovda `x-teacher-pin` header; noto'g'ri bo'lsa `401 bad_pin`. Bir IP dan 1 daqiqada 10 ta noto'g'ri urinishdan keyin
`429 too_many_attempts` (`Retry-After`, `retry_after_s`; oyna o'tguncha to'g'ri PIN ham qabul qilinmaydi). PIN standart
`1234` bo'lsa server ishga tushganda ogohlantirish logi yoziladi. Ma'lumot faqat xotirada — server qayta ishga tushsa
sessiyalar va tasdiqlar yo'qoladi. Frontend: `web/teacher.html` (`?api=` yoki `VITE_API_URL`).

Xatolar: `422 {detail:{code, message_uz}}` — `stt_failed` (frontend matn kiritishga o'tadi), `empty`, `bad_audio`;
`404 session_not_found`; `409 session_finished` — `/finish` dan keyin `/turn` (frontend natija ekranini ko'rsatsin).

**Kirill yozuvi.** Talaba o'zbekcha kirillda yozsa (yoki STT kirill bersa) ham ishlaydi: barcha kod tekshiruvlaridan
oldin matn lotinga o'giriladi (`textutil.norm`) — ishora qiluvchi savol regexi, yashirin fakt kalit so'zlari, bosqichni
yakunlash iboralari. Bayonnomada talabaning asl matni saqlanadi.

**Yashirin fakt nazorati.** Fakt faqat kod ruxsati bilan ochiladi (LLM «so'radi» deydi + savolda kalit so'z + savol
ishora qiluvchi emas) va guvoh faqat kanonik `reveal_line_uz` ni aytadi. Fakt ochilmaguncha promptda mavzu so'zlari
(ko'zoynak va h.k.) berilmaydi; guvohning LLM javobi shu mavzuga kod ruxsatisiz tegsa — «Buni aniq eslay olmayman.»
bilan almashtiriladi. Ish materialida yo'q raqam yoki hodisa (politsiya, chiroq ...) bor gaplar ham olib tashlanadi.

**Sud muzokarasi tartibi (JPK 449, `mode` berilganda).** Muzokaraga o'tish javobida `followups` = prokuror nutqi
(`prosecutor_position_uz` asosida) → «Himoyachi, so'z sizga. Muzokara nutqingizni so'zlang.» Himoyachi nutqidan keyin
prokuror qayta gapirmaydi (oxirgi nutq himoyada), so'ng sudlanuvchining oxirgi so'zi va majlis yopiladi.

`followups` — asosiy gapdan keyin ketma-ket ijro qilinadigan gaplar `{speaker, text_uz, audio_url, log_id, kind}`
(`kind`: `utterance | motion | ruling | record`): oxirgi bosqichda sudlanuvchining oxirgi so'zi va yopilish gapi,
majlisda prokuror so'rog'i, murojaat va qarorlar.

## Rejimlar, so'z navbati, ustoz, jonli bayonnoma (shartnoma: `../prompts/api-rejimlar.md`)

**`mode`** (`/session/start`): `majlis` — imtihon (maslahat yo'q, prokuror guvohni avval so'roq qiladi, 5-mezon, /10);
`talim` — ustoz bor (`tutor`), xatoda «vaqt to'xtadi», 3 ta maslahat (/8 + maslahatlar soni). **`mode` yuborilmasa**
— eski xatti-harakat (javobda `mode:"majlis"`, lekin prokuror so'rog'i yo'q, rubrika 4 mezon /8). Yangi frontend
`mode` ni doim aniq yuborsin.

**`action`** (`/turn`, `text` bo'sh bo'lishi mumkin):

| action | Nima bo'ladi |
|---|---|
| `next_stage` | keyingi bosqich (bor edi). Tuzoq savol kutilayotganda — `continue` kabi |
| `request_floor` | so'z so'rash. Prokuror so'roq qilayotganda: raislik qiluvchi «Himoyachi, eshitaman.» (so'z beriladi, oyna yangilanadi). So'z allaqachon talabada bo'lsa: «so'z sizda» (bayonnomaga yozilmaydi) |
| `motion_reject_question` | «Hurmatli sud, savolni rad etishni so'rayman: savol ishora qiluvchi (JPK 102-modda).» Tuzoq savoldan keyingi birinchi harakat bo'lsa: «Iltimos qanoatlantirildi, savol rad etiladi…» + kotib «Bayonnomaga kiritildi.» + prokuror «savollarim tugadi» + «Himoyachi, so'z sizga» (guvoh javob bermaydi). Aks holda «Iltimos rad etildi…». Tuzoq kutilayotganda matn/ovozdagi murojaat («…rad etishni so'rayman», «…yo'naltiruvchi») ham shunday tushuniladi |
| `hint` | faqat `talim`: `speaker:"tutor"`, qisqa maslahat (javobni bermaydi), `tutor.hints_left` 3 → 0. Majlisda `422 hint_unavailable` |
| `continue` | `window` vaqti tugadi (frontend avtomatik yuboradi): guvoh tuzoq savolga javob beradi, prokuror «savollarim tugadi», so'z himoyachiga. Majlisda jim (bahoda 5-mezon 0), talimda ustoz tushuntiradi (`pause:true`) |

**Guvoh so'rog'i (majlis va talim, `mode` berilganda).** Sud tergoviga o'tish javobi: raislik qiluvchi e'loni +
`followups` = prokurorning ochiq savoli → guvoh javobi → prokurorning **ishora qiluvchi** savoli; `window =
{kind:"motion_opportunity", until_ms:8000, hint_uz}` (`hint_uz` faqat talimda, majlisda `null` — oynani ko'rsatmang),
`floor.holder="prosecutor"`. Savollarni LLM yozadi (sessiya boshida fonda, `prompts/prosecutor_exam.md`), kod
tekshiradi: 2-savol `yonaltiruvchi_savol` regexi / «…, to'g'rimi?» ga mos kelmasa, taqiqlangan ibora, modda raqami,
yashirin fakt so'zi yoki «aniq ko'rdim» bo'lsa — o'sha maydon tayyor shablon bilan almashtiriladi (`exam_source`:
`llm | llm+shablon | shablon`). Mock da doim shablon.
**Birinchi manba — `content/case.json` `witness.prosecutor_exam` `{q1_open, a1, q2_leading, a2}`** (deterministik
demo): bo'lsa LLM chaqirilmaydi, matn qisqartirilmaydi (`exam_source: kontent`). Kafolat saqlanadi: bo'sh yoki
taqiqlangan iborali maydon, ishora qiluvchi bo'lmagan `q2_leading` (yoki ishora qiluvchi `q1_open`) shablon bilan
almashtiriladi (`kontent+shablon`, logda ogohlantirish). Murojaat qilinmasa guvoh `a2` ni aytadi. `/case` javobida
`prosecutor_exam` (va `hidden_fact`) ko'rsatilmaydi.
Tuzoq kutilayotganda talaba so'z olmasdan oddiy gap yuborsa — `ruxsatsiz_gapirish` qoidabuzarligi (JPK 408, 424),
guvoh tuzoq savolga javob beradi va so'z himoyachiga o'tadi. Majlisda talaba ishora qiluvchi savol bersa: avval
**prokuror** («Raislik qiluvchi, himoyachining savolini rad etishni so'rayman…», `kind:"motion"`), keyin raislik
qiluvchi qarori followup (`kind:"ruling"`, «Iltimos qanoatlantirildi. » + `warning_uz`). Talimda — eskicha, raislik
qiluvchining o'zi + ustoz pauzasi. LLM javobidagi taqiqlangan iboralar («Objection», «sustained», «Your Honor»,
«kross-so'roq», «sud pristavi» ...) bor gaplar olib tashlanadi.

**`floor`** har javobda: `{holder, requested_by[], expected, label_uz}`. Prokuror so'roq qilayotganda
`holder:"prosecutor", expected:null`; so'z berilgach va boshqa paytlarda `holder:"defense", expected:"defense"`;
majlis yopilgach `holder:"judge", expected:null, label_uz:"Majlis yakunlandi"`.

**`tutor`** (faqat talim, aks holda `null`): `{event, say_uz|null, choices[{id, label_uz, text_uz, action?}],
hints_left, hints_used, pause, rule|null, audio_url|null}`. **`event`** — ustoz xabari qaysi hodisaga tegishli
(xabar faqat joriy hodisa haqida, eski matn qayta yuborilmaydi):

| event | Qachon | say_uz / pause |
|---|---|---|
| `stage_start` | sessiya boshi va har yangi bosqich | bosqich gapi + 2–3 karta, `pause:false` |
| `violation` | qoidabuzarlik (kod pre-check, LLM yoki tuzoq paytida ruxsatsiz gapirish) | «Vaqt to'xtadi…Qayta urinib ko'ring.», `pause:true`, `rule` va 1 ta qayta urinish kartasi **doim** |
| `motion_ok` | tuzoq savolni rad etish iltimosi qanoatlantirildi | yagona maqtov joyi, `pause:false` |
| `motion_missed` | tuzoq o'tkazib yuborildi (`continue` yoki so'z olib murojaat qilmadi) | tushuntirish, `pause:true`, `rule` = JPK 102, «Guvohga ochiq savol» kartasi |
| `motion_denied` | rad etiladigan savol yo'q paytda murojaat | qisqa tushuntirish, `pause:false` |
| `hint` | `action:"hint"` | maslahat (`speaker:"tutor"`) |
| `none` | boshqa navbatlar | `say_uz:null`, `choices:[]` — frontend eski ustoz kartasini yopishi/tozalashi kerak |

Bosqich boshida kartalar: `action` bo'lsa — o'sha harakatni yuboring, aks holda `text_uz` ni matn sifatida.
Qoidabuzarlikda `say_uz` = «Vaqt to'xtadi. <qoidabuzarlik>. <modda ref: sarlavha. matnning 1-gapi>. Qayta urinib
ko'ring.» (tuzoq paytida bo'lsa + tuzoq tushuntirishi), `rule = {ref, title_uz, text_uz, verified}` (modda topilmasa —
raislik qiluvchi ogohlantirishi, `verified:false`), `choices` = qayta urinish kartasi: qoidabuzarlikka xos, bosqichga
mos kelmasa (masalan muzokarada guvohga savol) — bosqich kartasi. So'z olib (`request_floor`) murojaat o'rniga o'zi
ishora qiluvchi savol bersa — bu ham `violation`. Ustoz ovozi — `uz-UZ-MadinaNeural` (-6%, -8Hz; kotibdan farqli).
Ustoz gaplari bayonnomaga yozilmaydi.

**Ustoz matnlari `content/rules.json` dan** (har bosqichda, ixtiyoriy; bo'lmasa kod defaulti): `tutor_uz` →
bosqich boshidagi `say_uz`; `tutor_choices[{id, label_uz, text_uz, action?}]` → kartalar; `hints_uz[3]` →
`hint` javoblari (indeks = sessiyadagi umumiy `hints_used`, oxirgisi takrorlanadi). Tuzoq oynasi ochiq paytdagi
maslahat — vaziyatga oid kod matni. Kartaning `action` i: (1) kontentda aniq `action` bo'lsa o'sha; (2) aks holda
shu bosqich turidagi default karta bilan **sarlavha** bir xil bo'lsa — o'sha kartaning harakati (masalan «So'z
so'rash» → `request_floor`); (3) guvoh so'rog'ida sarlavha/matnda «rad etish / ishora qiluvchi / yo'naltiruvchi»
bo'lsa → `motion_reject_question` («Raislik qiluvchiga murojaat»); (4) sarlavha «So'z so'ra…» bilan boshlansa →
`request_floor`; aks holda `action` yo'q (matn yuboriladi). `id` bo'yicha moslanmaydi — kontentdagi a/b/c tartibi
defaultdan farq qiladi.

**`record_delta`** har javobda (va `/session/start` da): oxirgi javobdan beri bayonnomaga tushgan yangi yozuvlar
`{t:"mm:ss" (sessiya boshidan), speaker, text_uz, type: normal|violation|fact|ruling|motion, log_id, stage_id,
article_ref}`. Barcha javoblardagi `record_delta` ketma-ket qo'shilsa — `/finish` dagi `record` va bayonnoma HTML
qatorlari bilan aynan bir xil (HTML da vaqt «HH:MM:SS (mm:ss)»).

**Rubrika.** Majlisda (`mode:"majlis"`) 5-mezon `tinglash` — «Tinglash va protsessual hushyorlik» (0–2, faqat kod
jurnalidan): tuzoq savolga murojaat qilingan bo'lsa 2 (asossiz murojaatlar ≥ 2 bo'lsa 1), aks holda 0; iqtibos —
talabaning murojaati, modda JPK 102. `total/max` = /10. Talimda `hints_used`, `hints_left`, `pauses` (bayonnomada ham).
Har mezon iqtibosi **boshqa** mezonlarnikidan farqli (bir-birining ichida emas, ketma-ket 3 so'z umumiy emas):
nomzodlar — talaba gaplari va uzun gaplarning bo'laklari (dalil uchun dalil tilga olingan bo'lak, nutq uchun so'rov
bo'lagi); mos nomzod bo'lmasa `evidence_quote:""` va `quote_note_uz:"iqtibos topilmadi"`. Mezon izohlari va
bayonnomada «e'tiroz» o'rniga «raislik qiluvchiga murojaat», ichki atamalar (fayl nomlari, qoidabuzarlik id lari)
o'rniga nomlar (`violations[].name_uz` ham qo'shildi).

## Oqim (`/turn`)

STT (audio bo'lsa, xotirada, saqlanmaydi) → **kod pre-check** (`violations.regex_uz`, yashirin faktdan OLDIN) →
holat mashinasi (talaba so'rovi + minimal savollar soni) → LLM (JSON schema) → kod tekshiruvi (speaker bosqichda
ruxsat etilganmi, `rule_ids` faqat rules.json dan, javobdagi noma'lum modda raqami bor gap olib tashlanadi,
yashirin fakt faqat `asked_hidden_fact=true` + kalit so'z mosligida va matnini kod qo'shadi, ≤ 25 so'z) → TTS → jurnal.

## Ovoz

- TTS `edge` (kalitsiz): sudya, prokuror, guvoh va sudlanuvchi — `uz-UZ-SardorNeural` (har biri boshqa tezlik/ohangda; guvoh +3%, -16Hz), kotib va talaba savoli — `uz-UZ-MadinaNeural`.
  `TTS_MODE=deferred` (standart): `/turn` matnni darhol qaytaradi, mp3 brauzer `audio_url` ni so'raganda yaratiladi.
  `?stream=1` birinchi bayt kelishi bilan uzatadi (Android Chrome); iOS Safari uchun standart (to'liq fayl).
- Tayyor iboralar (ogohlantirishlar, bosqich e'lonlari, yashirin fakt) keshda: ~30–300 ms.
- STT (`STT_PROVIDER=auto`): Gemini kalitlari bo'lsa **Gemini flash-lite audio** (LLM bilan bir xil kalitlar navbati va
  zaxira modellar; inline base64 audio + «faqat o'zbekcha, so'zma-so'z» ko'rsatmasi + ish atamalari ro'yxati;
  `text_uz` JSON). webm/opus to'g'ridan-to'g'ri qabul qilindi (sinovda); rad etilsa va `ffmpeg` bo'lsa xotirada mp3
  ga o'girib qayta yuboriladi. Aisha kaliti bo'lsa — zaxira (Aisha v1 REST). Audio diskka yozilmaydi.
  Sinov: `python scripts/stt_test.py [--webm] [--url ...]` — edge-tts bilan 5 ta sud savoli, WER va ms (sintetik ovoz:
  real mikrofonda natija pastroq bo'ladi). 2026-11-21: mp3 — o'rtacha WER 2,9 %, server p50 2,6 s (max 4,2 s, birinchi
  so'rov — sovuq ulanish); webm/opus — WER 2,9 %, p50 3,2 s. Yagona xato: «ko'rishingizga» → «qarshingizga» /
  «korishingizga» (kalit so'z mosligi endi tutuq belgisiz yozuvni ham taniydi).
- Real LLM bilan majlis sinovi: `python scripts/majlis_live_check.py [--miss]`.

## Kalit qo'yilgach (real LLM / STT testi)

1. `server/.env` ga `GEMINI_API_KEY=` (https://aistudio.google.com/apikey), xohlasangiz `GEMINI_API_KEY2=`,
   `GEMINI_API_KEY3=` ... yoki `GEMINI_API_KEYS=k1,k2` va kerak bo'lsa `AISHA_API_KEY=` yozing. Zaxira: `ANTHROPIC_API_KEY`.
   Model: `GEMINI_MODEL=gemini-3.1-flash-lite`, `GEMINI_FALLBACK_MODELS=gemini-flash-lite-latest` (pastga qarang).
2. `curl localhost:8000/health` → `"llm":"gemini"`. Server logida: `LLM gemini: 2 ta kalit (#2 #3), model ...`.
3. Tez tekshiruv: `python scripts/latency_test.py --rounds 1` — har navbatda LLM/TTS/jami ms.
4. **20 daqiqalik test:** `python scripts/latency_test.py --minutes 20` (jarayon ichida) yoki deploydan keyin
   `python scripts/latency_test.py --url https://<server> --minutes 20`. STT uchun telefondagi 10 s lik yozuvlar:
   `--audio-dir <papka>`. Natija: p50/p95 jadvali va `logs/latency-*.csv`. Maqsad: oddiy navbat < 4 s, qoidabuzarlik ~1 s.
5. Sifat: `content/tests.json` dagi kiritmalarni real LLM bilan ham o'tkazing (`latency_test` ularni ishlatadi) va
   javoblarni CSV da ko'zdan kechiring. LLM xato/timeout bersa navbat mock bilan davom etadi (`source: llm:mock:fallback`).

## Mock nima qiladi

`LLM=mock` deterministik: guvoh `public_facts_uz` dan so'z mosligi bo'yicha javob beradi, yashirin fakt kalit so'z bo'yicha,
prokuror `prosecutor_position_uz` ni qisqartiradi, sudya bosqich iboralarini aytadi. Qoidabuzarliklar mock da ham
ishlaydi (ular kod pre-check da). Rubrika mock da kod bilan hisoblanadi; real LLM bo'lsa LLM bahosi iqtibos
so'zma-so'z tekshiruvidan o'tgandagina qabul qilinadi, protsessual tartib darajasi doim kod jurnalidan.

## Gemini kalitlari navbati va model

Kalitlar `#1` (`GEMINI_API_KEY`), `#2` (`GEMINI_API_KEY2`), `#3` ... so'ng `GEMINI_API_KEYS` (vergul bilan) tartibida
o'qiladi; bo'sh qiymat va takror tashlanadi, bo'shliqli / juda uzun (> 120 belgi) / g'alati belgili qiymat
`GEMINI_API_KEY noto'g'ri formatda (...) — o'tkazib yuborildi` ogohlantirishi bilan tashlanadi. So'rov REST orqali
(`x-goog-api-key` sarlavhasida — kalit URL ga ham, logga ham tushmaydi). Ishlab turgan kalit "yopishqoq": u xato
bermaguncha shu ishlatiladi.

| Javob | Nima bo'ladi |
|---|---|
| 400 `API_KEY_INVALID`, 401, 403 | kalit jarayon davomida "o'lik", keyingisiga o'tiladi |
| 429 / `RESOURCE_EXHAUSTED` | keyingi kalit; eskisi shu model uchun 60 s (Google `retryDelay` bo'lsa o'sha, ko'pi bilan 1 soat) dam oladi. Free tier limiti loyiha+model bo'yicha, shuning uchun zaxira modelda o'sha kalit ishlayveradi |
| timeout / 5xx | keyingi kalit (zaxira model bo'lsa — o'sha model bilan) **bir marta**; 5xx yoki ketma-ket 2 timeoutdan keyin asosiy model 60 s chetga qo'yiladi |
| 404 (model yo'q) | `GEMINI_FALLBACK_MODELS` dagi keyingi model |
| 400 boshqa (masalan thinking sozlamasi qo'llanmaydi) | soddaroq so'rov varianti, model uchun eslab qolinadi |
| hammasi ishlamasa | navbat mock bilan davom etadi (`source: llm:mock:fallback`) |

Vaqt budjeti: navbat uchun `LLM_TIMEOUT_S` (8 s; rubrika 3×). Birinchi urinishga budjetning 60 % i, qolgani bitta
qayta urinishga. Log faqat yorliq bilan: `gemini key #2 ishlatildi (model gemini-3.1-flash-lite)`.

**Model tanlovi (2026-11-20, `/v1beta/models` + real so'rovlar):** `gemini-flash-latest` ro'yxatda bor, lekin free tierda
kuniga 20 so'rov (`GenerateRequestsPerDayPerProjectPerModel-FreeTier`) va tez-tez 503 "high demand"/timeout; eng yangi
`gemini-3.8-flash`, `gemini-3.7-flash`, `gemini-3.5-flash` ham 503/timeout; `gemini-2.5-flash` yangi foydalanuvchilarga 404.
Barqaror ishlagani: `gemini-3.1-flash-lite` (`thinkingBudget: 0` bilan, LLM p50 ≈ 2.3 s, lekin Google yuklamasida 5–8 s gacha
sakraydi) va `gemini-flash-lite-latest` (= `gemini-3.5-flash-lite`, `thinkingBudget: 0` ni qabul qilmaydi — kod o'zi
`thinkingLevel` variantiga o'tadi). Shu sababli standart: `GEMINI_MODEL=gemini-3.1-flash-lite`,
`GEMINI_FALLBACK_MODELS=gemini-flash-lite-latest`. `GEMINI_FALLBACK_MODELS` umuman yozilmasa zaxira ro'yxat
`gemini-3.1-flash-lite,gemini-flash-lite-latest` (eski `.env` dagi `GEMINI_MODEL=gemini-flash-latest` ham shu bilan o'zini
tiklaydi, lekin birinchi navbatlar sekin bo'ladi). Pullik tarif ulansa `gemini-flash-latest` ni qayta sinab ko'ring.

