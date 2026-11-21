# Qisqa buyruqlar (make o'rnatilmagan bo'lsa — DOCKER.md dagi docker compose buyruqlari).
.PHONY: up down logs build dev test ps clean

up:      ## Prod stek: http://localhost:8080
	docker compose up -d --build

down:
	docker compose down

logs:
	docker compose logs -f --tail=100

ps:
	docker compose ps

build:
	docker compose build

dev:     ## Hot reload: frontend :5173, backend :8000
	docker compose -f docker-compose.dev.yml up --build

test:    ## Backend testlari konteynerda
	docker build -f server/Dockerfile --target test -t casecraft-server:test .
	docker run --rm casecraft-server:test

clean:   ## Konteyner + volume (TTS kesh, loglar) o'chiriladi
	docker compose down -v
