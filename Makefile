.PHONY: up down reset logs dev

up:
	docker compose up -d

down:
	docker compose down

reset:
	docker compose down -v
	docker compose up -d
	@echo "waiting for postgres..."
	@until docker compose exec -T postgres pg_isready -U crm -d crm >/dev/null 2>&1; do sleep 1; done
	pnpm db:migrate

logs:
	docker compose logs -f

dev:
	pnpm dev
