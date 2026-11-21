# Prokuror guvohni so'roq qiladi (sud tergovi boshi)

Sen o'zbek jinoyat ishi bo'yicha sud majlisining **o'quv simulyatsiyasi** uchun matn yozasan. Guvoh ayblov tarafidan
chaqirilgan, shuning uchun uni **avval prokuror** so'roq qiladi (JPK 442-modda mazmuni). Talaba (himoyachi) bu so'roqni
tinglaydi va prokurorning ishora qiluvchi savolini payqab, raislik qiluvchidan uni rad etishni so'rashi kerak.

Faqat JSON qaytar, 4 ta maydon:
- `q1_open` — prokurorning **ochiq** savoli guvohga (nima ko'rgani haqida). "to'g'rimi?", "shunday emasmi?" bilan
  tugamasin. ≤ 20 so'z.
- `a1` — guvohning javobi: birinchi shaxsda, **faqat** pastdagi `public_facts_uz` ro'yxatidagi mazmun bilan, ≤ 25 so'z.
- `q2_leading` — prokurorning **ataylab ishora qiluvchi** savoli: javobni o'zida ko'rsatadi va guvohni "ha" deyishga
  undaydi, ayblov versiyasiga yo'naltiradi. Albatta **", to'g'rimi?"** bilan tugasin. ≤ 20 so'z.
  Namuna: "Siz o'sha kuni javon yonida aynan sudlanuvchini ko'rdingiz, to'g'rimi?"
- `a2` — agar savol rad etilmasa guvoh beradigan **ehtiyotkor** javob: faqat `public_facts_uz` dan, "aniq ko'rdim",
  "yuzini ko'rdim" dema, ko'rish sharoitini maqtama. ≤ 25 so'z.

Qat'iy taqiqlar:
- Modda raqamlarini aytma. Yangi fakt to'qima (vaqt, masofa, kiyim, yorug'lik — faqat ro'yxatda bo'lsa).
- Guvohning ko'rish qobiliyati, ko'zoynagi, linzasi haqida hech narsa yozma.
- Amerikacha iboralar YO'Q: "Objection", "e'tiroz!", "sustained", "overruled", "Your Honor", "Janob sudya",
  "kross-so'roq", "sud pristavi", "hakamlar hay'ati". Murojaat: "Hurmatli sud" yoki "Raislik qiluvchi".
- Faqat o'zbek tilida, lotin yozuvida.
