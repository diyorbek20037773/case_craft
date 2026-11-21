# CaseCraft - Windows kompyuterda ishga tushirish

## 1. Bir marta o'rnatiladi

| Dastur | Versiya | Qayerdan |
|---|---|---|
| Python | 3.11 yoki yangi | https://www.python.org/downloads/ - o'rnatishda **"Add python.exe to PATH"** belgisini qo'ying |
| Node.js | LTS (22.x yoki 24.x; kamida 20.19) | https://nodejs.org/ |

O'rnatgandan keyin ochiq oynalarni yoping (PATH yangilanishi uchun). Birinchi ishga tushirishda internet kerak.

## 2. Gemini kaliti

1. `CaseCraft.zip` ni oching, masalan `C:\CaseCraft` ga.
2. `ISHGA_TUSHIRISH.bat` ni ikki marta bosing. Birinchi safar u `server\.env` faylini yaratib, Bloknotda ochadi.
3. Shu qatorni toping va kalitni `=` dan keyin qo'ying (bo'shliqsiz, qo'shtirnoqsiz):
   ```
   GEMINI_API_KEY=AIza...
   ```
   Zaxira kalitlar bo'lsa: `GEMINI_API_KEY2=`, `GEMINI_API_KEY3=`.
4. Saqlang (Ctrl+S), Bloknotni yoping.

Kalit yo'q bo'lsa ham dastur ishlaydi: AI javoblari tayyor (mock) matnlar bilan almashtiriladi.
Kalitni hech kimga yubormang va `.env` faylini boshqalarga bermang.

## 3. Ishga tushirish

`ISHGA_TUSHIRISH.bat` ni yana ikki marta bosing. U:
- Python va Node.js borligini tekshiradi;
- birinchi safar kutubxonalarni o'rnatadi (5-10 daqiqa, internet tezligiga bog'liq; keyingi safar o'tkazib yuboriladi);
- ikkita oyna ochadi: **CaseCraft backend** (port 8000) va **CaseCraft frontend** (port 5173) - ularni yopmang;
- frontendni tayyor (siqilgan, yengil) holatga keltiradi - har safar 10-60 soniya (`npm run build`), so'ng `npm run preview`;
- sahifa tayyor bo'lgach brauzerda kirish sahifasini ochadi.

To'xtatish: ikkala oynani yoping.

### Ishlab chiqish rejimi (kod yozayotganlar uchun)

Kod o'zgarishi darhol ko'rinishi kerak bo'lsa (build kutmasdan), cmd'da:
```
set CC_DEV=1
ISHGA_TUSHIRISH.bat
```
Bu rejim (`npm run dev`) sekinroq - sahifa yuzlab alohida fayllar bilan yuklanadi.

## 4. Manzillar

| Sahifa | Manzil |
|---|---|
| Kirish (titul, rol tanlash) | http://localhost:5173/intro.html |
| Guvoh so'roqi (3D zal) | http://localhost:5173/guvoh.html |
| O'qituvchi paneli | http://localhost:5173/teacher.html - PIN: **1234** |
| Backend tekshiruvi | http://localhost:8000/health |

## 5. Tez-tez uchraydigan muammolar

| Muammo | Yechim |
|---|---|
| "Python topilmadi" | Python'ni qayta o'rnating, "Add python.exe to PATH" ni belgilang. Windows "Store" oynasi ochilsa ham - python.org dan o'rnating. |
| "Node.js topilmadi" | nodejs.org dan LTS ni o'rnating, oynalarni yopib qayta oching. |
| "8000-port band" yoki "5173-port band" | Oldingi CaseCraft oynalari ochiq qolgan bo'lishi mumkin - ularni yoping. Yoki portni egallagan dasturni yoping (`netstat -ano \| findstr :8000` - oxirgi ustun PID, Task Manager'da shu PID ni tugating). |
| Sahifada server bilan aloqa yo'qligi haqida xabar | "CaseCraft backend" oynasini tekshiring - xato yozilgan bo'ladi. Oyna yopilgan bo'lsa, .bat ni qayta bosing. |
| Internet yo'q / Gemini javob bermaydi | Dastur to'xtamaydi: AI o'rniga mock (tayyor) javoblar ishlaydi, nutqni matnga aylantirish (mikrofon) ishlamaydi - matn bilan yozing. Ovoz (edge-tts) ham internet talab qiladi; oldindan tayyorlangan iboralar `server\cache` da bor. |
| Mikrofon ishlamaydi | Brauzer mikrofonga faqat **http://localhost** (yoki https) da ruxsat beradi - IP manzil (192.168...) orqali ochmang. Brauzer so'raganda "Ruxsat berish" ni bosing. Mikrofon matnga aylantirish uchun Gemini kaliti kerak. |
| Kutubxona o'rnatish xato berdi | Internetni tekshiring. Python kutubxonalari `%LOCALAPPDATA%\CaseCraft\venv` ga o'rnatiladi (uzun fayl yo'llari muammosidan qochish uchun) - shu papkani yoki `web\node_modules` ni o'chirib, .bat ni qayta bosing. |
| Kalitni o'zgartirish | `server\.env` ni Bloknotda oching, tahrirlang, backend oynasini yopib .bat ni qayta bosing. |

Eslatma: sahifalar Chrome yoki Edge'da eng yaxshi ishlaydi (3D zal uchun WebGL kerak).
