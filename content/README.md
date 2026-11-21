# content/ — sud trenajyori kontenti (to'qima ish, JPK qoidalari)

Fayllar: `case.json`, `rules.json`, `tests.json`, `glossary.json`. Barcha ish va shaxslar TO'QIMA (sintetik); real shaxs/ishga aloqasi yo'q.
Ekranda «AI o'quv simulyatsiyasi, real sud qarori emas» yorlig'i bo'lishi shart.

## Server uchun eslatmalar (sxema bo'yicha)
- Rol id lari (`allowed_speakers`): `raislik_qiluvchi`, `kotib`, `prokuror`, `himoyachi`, `guvoh`, `sudlanuvchi`.
- Bosqich id lari: `ochilish` -> `guvoh_soroq` -> `muzokara` -> `oxirgi_soz`.
- `rules.json`: 28 ta modda (427 qo'shildi), 6 ta qoidabuzarlik. Har bir qoidabuzarlikda ikki ogohlantirish: `warning_uz` (ekran uchun, to'liq) va `warning_short_uz` (ovoz uchun, ≤ 12 so'z, modda raqami bilan).
- `case.json`: `witness.public_facts_uz` guvoh tilida (birinchi shaxs), `witness.hidden_fact.reveal_line_uz` — fakt ochilganda guvohning o'z gapi. `text_uz` o'zgarmagan (uchinchi shaxs, ichki tavsif).
- `regex_uz` — `re.IGNORECASE` bilan, kirishdagi apostrof belgilari (`'`, `’`, `ʻ`, `ʼ`, `‘`) normallashtirilgan holda ishlating. Regexlar shablon sifatida, LLM tekshiruvi bilan birga.
- `bosqichdan_tashqari` regexlari («oqlashni so'rayman» va h.k.) FAQAT `guvoh_soroq` bosqichida qo'llanadi. `muzokara` da bu harakat to'g'ri (tests.json 9-kiritma). `muzokara` da guvohga savol berish ham shu qoidabuzarlik (LLM aniqlaydi).
- Avval qoidabuzarlik tekshiriladi, keyin yashirin fakt. Yo'naltiruvchi savolda (masalan «ko'zoynaksiz edingiz, to'g'rimi?») `reveal_keywords` mos kelsa ham fakt OCHILMASLIGI kerak. `reveal_keywords` ichida «ko'rdingiz» yakka kalit so'z sifatida yo'q: shunday qoldiring.
- `violations[].article_ids` faqat `articles[].id` dan.
- Muzokara nutqining davomiyligi cheklanmaydi (JPK 449): raislik qiluvchi faqat ishga aloqasi yo'q gapni to'xtatadi.

## Yangi maydonlar (talim/majlis rejimlari)
- `case.json` -> `witness.prosecutor_exam`: `q1_open` (prokurorning ochiq savoli), `a1` (guvoh javobi, faqat ochiq faktlar, ko'zoynak YO'Q), `q2_leading` (atayin ishora qiluvchi savol, «, to'g'rimi?» bilan tugaydi), `a2` (talaba e'tibor bermasa guvohning ehtiyotkor javobi). Bo'lmasa server o'z shablonini ishlatadi.
- `rules.json` -> `stages[]`: `tutor_uz` (1-2 gap: maqsad + modda), `tutor_choices` (`{id, label_uz, text_uz}`), `hints_uz` (3 ta yo'naltiruvchi maslahat, javobni aytmaydi).

## Agentlar dialogida to'g'ri iboralar (manba: research/rejim-huquq.md)
JPK da amerikacha «objection» instituti yo'q. Savolga qarshi turish vositalari: ishora qiluvchi savol taqiqi (102-m, sudda 442-m orqali), raislik qiluvchining ishga aloqasizni chetlashtirishi (408-m), iltimos (438-m), raislik qiluvchining harakatiga e'tiroz: bayonnomaga kiritiladi, majlis to'xtamaydi (408-m 4-qism), bayonnomaga mulohaza: majlisdan keyin 5 sutka ichida (427-m).

**(a) To'g'ri iboralar**
- Prokuror (o'rnidan turib): «Raislik qiluvchi, himoyachining savolini rad etishni so'rayman: savol ishora qiluvchi (JPK 102-m).»
- Raislik qiluvchi: «Savol rad etiladi. Qayta shakllantiring.» (yoki o'zi: «Savol ishora qiluvchi, bunday savol berishga yo'l qo'yilmaydi.»). Iltimosga javob: «Iltimos qanoatlantirildi» / «Iltimos rad etildi».
- Ishga aloqasiz savol: «Iltimos qanoatlantirildi. Himoyachi, ish holatlariga oid savol bering.»
- Raislik qiluvchi harakatiga e'tiroz: himoyachi «e'tirozim bayonnomaga kiritilishini so'rayman» → raislik qiluvchi «E'tiroz bayonnomaga kiritilsin» → kotib «Kiritildi».
- Kotib faqat «bayonnomaga kiritildi» deydi. Murojaat: «Raislik qiluvchi», «Hurmatli sud» (odat, qonun talabi emas). Ishtirokchilar o'rnidan turib gapiradi (424-m), raislik qiluvchiga murojaat qiladi, bir-biriga emas.

**(b) Taqiqlangan iboralar:** «Objection!»; «Sustained / Overruled», «e'tiroz qo'llab-quvvatlandi»; «Your Honor», «Janob sudya»; «kross-so'roq», «qayta so'roq (redirect)»; «sud pristavi», «All rise»; «hakamlar hay'ati»; sudya himoyachi nutqini vaqt bilan cheklashi; oxirgi so'zda sudlanuvchiga savol berish.

## Manbalar va tekshiruv holati
Asosiy manba: JPK, https://lex.uz/uz/docs/-111460 (22.09.1994). JK: https://lex.uz/docs/-111453.
Tekshirish usuli: lex.uz sahifasining mundarijasi (sarlavhalar) ochildi. Sahifaning modda MATNI lex.uz dan olinmadi (faqat mundarija). 102, 408, 424, 426, 427 mazmuni prg.kz dagi rus tahriridan o'qilgan (research/rejim-huquq.md): «rus tahriri bo'yicha tekshirildi, o'zbekcha matn lex.uz da tasdiqlanishi kerak».
- «Sarlavha tekshirilgan» = modda raqami va nomi lex.uz mundarijasida ko'rilgan (yuqori ishonch).
- Barcha `text_uz` — qisqa MAZMUN (so'zma-so'z emas). Hech biri o'zbekcha matn bilan so'zma-so'z tasdiqlanmagan. Yurist tasdiqlaydi.

| Modda | Nomi (mundarijada ko'rilgan) | Sarlavha | Matn mazmuni |
|---|---|---|---|
| JPK 22, 23, 24, 25, 26 | Haqiqatni aniqlash; Aybsizlik prezumpsiyasi; Himoyalanish huquqi; Tortishuv; Dalillarni bevosita va og'zaki tekshirish | tekshirilgan | tekshirilmagan |
| JPK 32 | Sud majlisi kotibi | tekshirilgan (research/fakt-tekshiruv.md ham) | tekshirilmagan |
| JPK 49 | Himoyachi | tekshirilgan | tekshirilmagan |
| JPK 102 | Ishora qiluvchi savollar berishga yo'l qo'yilmasligi | tekshirilgan | rus tahriri bo'yicha tekshirildi (javobni to'g'ridan-to'g'ri yoki bilvosita ko'rsatadigan savol taqiqlanadi); o'zbekcha matn lex.uz da tasdiqlanishi kerak |
| JPK 114, 117 | Guvoh va jabrlanuvchini so'roq qilish tartibi; ogohlantirish | tekshirilgan | tekshirilmagan |
| JPK 408 | Sud majlisida raislik qiluvchi | tekshirilgan | rus tahriri bo'yicha tekshirildi (1-4 qism, e'tiroz bayonnomaga kiritiladi); o'zbekcha matn lex.uz da tasdiqlanishi kerak |
| JPK 409 | Sud muhokamasida prokurorning ishtiroki | tekshirilgan | tekshirilmagan |
| JPK 424 | Sud majlisining tartibi | tekshirilgan | rus tahriri bo'yicha tekshirildi (o'rnidan turish, o'rnidan turib murojaat, bo'ysunish); o'zbekcha matn lex.uz da tasdiqlanishi kerak |
| JPK 425 | Tartibni buzuvchilarga choralar | tekshirilgan | tekshirilmagan |
| JPK 426 | Sud majlisining bayonnomasi | tekshirilgan | rus tahriri bo'yicha tekshirildi (kotib yuritadi, mazmuni); o'zbekcha matn lex.uz da tasdiqlanishi kerak |
| JPK 427 | Bayonnoma yuzasidan mulohazalar berish va ularni ko'rib chiqish tartibi | tekshirilgan | rus tahriri bo'yicha tekshirildi (5 sutka); o'zbekcha matn lex.uz da tasdiqlanishi kerak |
| JPK 428, 429, 432, 435, 438 | Majlisni ochish; kelganlikni tekshirish; guvohlarni zaldan chiqarish; sudlanuvchi huquqlari; iltimoslar | tekshirilgan (432 sarlavhasi bitta so'rovda ko'rildi) | tekshirilmagan |
| JPK 439, 440, 441, 442, 448 | Sud tergovining boshlanishi; navbat; qasamyod; Sudda so'roq qilish tartibi; tamomlanishi | tekshirilgan | tekshirilmagan. 442: «dastlab uni taklif qilgan taraf so'roq qiladi» — rejim-huquq.md da o'rta ishonch; so'zma-so'z ko'rilmagan |
| JPK 449, 451 | Taraflar muzokarasining mazmuni va tartibi; Sudlanuvchining oxirgi so'zi | tekshirilgan | tekshirilmagan (rejim-huquq.md: 449 da davomiylikni cheklab bo'lmaydi, 451 da savol berilmaydi: o'rta) |
| JK 169 | O'g'rilik (lex.uz JK mundarijasi: «Oʻgʻrilik») | tekshirilgan | qism va miqdor belgisi tekshirilmagan |

## Yurist ko'rib chiqishi kerak bo'lgan joylar
1. Har bir `articles[].text_uz` ni lex.uz o'zbekcha matni bilan solishtirish (ayniqsa 102, 408, 424, 426, 427, 442, 449, 451).
2. JPK 442: sud tergovida yo'naltiruvchi savol taqiqi shu modda orqali (102-moddaga havola) amalda to'g'rimi. «Savolni rad etish» alohida mexanizmi yo'q: prokuror iltimos qiladi, raislik qiluvchi hal qiladi yoki o'zi chetlashtiradi.
3. 408-modda 4-qism: raislik qiluvchining harakatiga e'tiroz bayonnomaga kiritiladi, majlis to'xtamaydi: lex.uz o'zbekcha matnida tasdiqlansin.
4. Muzokara tartibi (449): ayblovchi → himoyachi → sudlanuvchi, replika, davomiylik cheklanmasligi.
5. Oxirgi so'z (451): savol berish va to'xtatish taqiqi, mashqda «ixtiyoriy» bo'lishi.
6. Guvohni so'roq qilish ketma-ketligi va qasamyod (441).
7. JK 169: qism, miqdor chegarasi (bazaviy hisoblash miqdoriga nisbatan; ish 5 400 000 so'm), ma'muriy mayda o'g'rilik bilan chegarasi. Zarur bo'lsa qiymatni oshiring.
8. «Sudlanuvchi» atamasi; «Hurmatli sud» murojaati (odat).
9. JPK tahriri: lex.uz da «05.02.2027» sanasi ko'ringan (kelajak sanasi): amaldagi tahrirni brauzerda qayta tekshirish.
10. Ish mazmuni: fotosuratdan tanib olish tartibi aniq tasvirlanmagan; ssenariy faqat o'quv uchun.
11. `warning_uz` va `warning_short_uz` matnlari rasmiy ohangda, moddaga havola bilan.
12. Guvohning birinchi shaxsdagi gaplari (`public_facts_uz`, `reveal_line_uz`) tabiiy o'zbek tilida ekanini tekshirish.
13. 442-moddadagi «xalq maslahatchilari» eskirgan bo'lishi mumkin: sahnada faqat yakka raislik qiluvchi.
14. ⚖️ «Iltimos qanoatlantirildi, savol rad etiladi» iborasi: iltimos (438-m) bo'yicha qaror shakli JPK da aynan shunday belgilanmagan, bu odat/amaliyot shakli. Yurist tasdiqlasin.
15. ⚖️ Raislik qiluvchining o'z tashabbusi bilan ishora qiluvchi savolni rad etishi (JPK 102-m, sudda 442-m orqali, 408-m 2-qism bilan birga): prokuror iltimosisiz ham raislik qiluvchi savolni to'xtata oladimi. Yurist tasdiqlasin.
16. `rules.json` dagi yangi `tutor_uz`, `tutor_choices`, `hints_uz` matnlari va `case.json` dagi `witness.prosecutor_exam` (rasmiy ohang, moddalarga havola) yurist ko'zidan o'tsin.

## Yashirin fakt (case.json)
Guvoh M. Rahimova uzoqni ko'rish uchun ko'zoynak taqadi, voqea kuni ko'zoynagi sinib, 20 m dan yuzni aniq ko'rmagan, kurtka va bo'yiga qarab «o'xshaydi» degan. Ochiq savolda ochiladi, yo'naltiruvchi savolda ochilmaydi.
