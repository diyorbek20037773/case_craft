# CaseCraft — Docker va DevOps

## Tuzilma

```
brauzer ──► web (nginx, :8080) ──► statik build (Vite)
                    │
                    └── /api/* ──► server (FastAPI/uvicorn, :8000, faqat ichki tarmoqda)
                                      ├─ volume: tts-cache  (/app/server/cache — mp3 kesh)
                                      └─ volume: session-logs (/app/server/logs)
```

Frontend va backend bitta manzilda (`/api` prefiksi) — CORS sozlash kerak emas.

| Fayl | Vazifasi |
|---|---|
| `server/Dockerfile` | Backend: `deps` → `test` (pytest) → `runtime` (root bo'lmagan foydalanuvchi, healthcheck) |
| `web/Dockerfile` | Frontend: `build` (Vite) → `runtime` (nginx); `dev` — hot reload |
| `web/nginx.conf` | Statik fayllar, gzip, kesh, `/api` → backend proxy |
| `docker-compose.yml` | Prod stek |
| `docker-compose.dev.yml` | Ishlab chiqish (kod o'zgarsa avtomatik qayta yuklanadi) |
| `.github/workflows/ci.yml` | Har push/PR: backend testlari, frontend lint+build, Docker build |
| `.github/workflows/docker-publish.yml` | `main` / `v*` teg → `ghcr.io` ga image'lar |
| `.github/dependabot.yml` | Kutubxonalar yangilanishi |
| `Makefile` | Qisqa buyruqlar |

## 1. Kalitlar

```bash
cp server/.env.example server/.env   # Windows: copy server\.env.example server\.env
```

`server/.env` da `GEMINI_API_KEY=` ni to'ldiring. Fayl bo'lmasa ham stek ishlaydi (mock AI javoblari).
`.env` git'ga tushmaydi va Docker image'ga ham kirmaydi — faqat ishga tushganda o'qiladi.

## 2. Ishga tushirish (prod)

```bash
docker compose up -d --build
```

| Sahifa | Manzil |
|---|---|
| Kirish | http://localhost:8080/ |
| Guvoh so'roqi (3D) | http://localhost:8080/guvoh.html |
| O'qituvchi paneli | http://localhost:8080/teacher.html (PIN: `TEACHER_PIN`, standart 1234) |
| API hujjatlari | http://localhost:8080/api/docs |
| Backend holati | http://localhost:8080/api/health |

Boshqa port: `WEB_PORT=9000 docker compose up -d`.

```bash
docker compose ps              # holat (healthy bo'lishi kerak)
docker compose logs -f server  # backend loglari
docker compose down            # to'xtatish
docker compose down -v         # + TTS kesh va loglarni o'chirish
```

## 3. Ishlab chiqish rejimi

```bash
docker compose -f docker-compose.dev.yml up --build
```

Frontend: http://localhost:5173/intro.html, backend: http://localhost:8000/docs. `server/`, `content/`, `web/`
papkalari konteynerga ulangan — kod o'zgarsa avtomatik qayta yuklanadi.

## 4. Testlar

```bash
make test
# yoki
docker build -f server/Dockerfile --target test -t casecraft-server:test . && docker run --rm casecraft-server:test
```

## 5. Serverga joylash

1. `main` ga push → GitHub Actions image'larni `ghcr.io/<owner>/casecraft-server` va `casecraft-web` ga yuklaydi.
2. Serverda: repo'ni (yoki faqat `docker-compose.yml`) ko'chiring, `server/.env` yarating va:
   ```bash
   docker compose pull && docker compose up -d
   ```
3. Tashqi domen uchun `server/.env` ga `CORS_ORIGINS=https://sizning-domen.uz` qo'shing va oldiga HTTPS beruvchi
   proxy (Caddy, Traefik yoki Cloudflare) qo'ying.

> Eslatma: brauzer mikrofonga faqat `https://` yoki `http://localhost` da ruxsat beradi.
> ghcr.io paketlari standart holatda private — kerak bo'lsa GitHub → Packages → paket sozlamalaridan public qiling.

## Muhim

- Backend sessiyalarni xotirada saqlaydi, shuning uchun `server` bitta nusxada (1 worker) ishlaydi. Konteyner qayta
  ishga tushsa, faol sessiyalar yo'qoladi.
- Docker dasturni tezlashtirmaydi: 3D sahnani brauzer va videokarta chizadi. Docker bitta buyruq bilan bir xil
  muhitda ishga tushirishni ta'minlaydi; frontend esa tayyor build (nginx, gzip, kesh) sifatida beriladi.
