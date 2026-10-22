# =============================================================================
# ChronoPlayer — project commands
# Usage: make <command>     (make help for the full list)
# On Windows: run from Git Bash (GNU Make: winget install ezwinports.make) or WSL.
# New computer: make doctor (or node scripts/doctor.mjs) lists what is missing.
# =============================================================================

SHELL := bash
.DEFAULT_GOAL := help
.PHONY: help local docker stop docker-logs setup install env dev build preview \
        db-start db-stop db-status db-reset db-migrate db-types db-migration db-lint db-test db-studio \
        db-link db-push lint lint-fix typecheck test test-unit test-nuxt test-e2e test-coverage \
        check ci clean clean-all merge doctor

PNPM     := pnpm
SUPABASE := $(PNPM) exec supabase

help: ## Show this list
	@echo "ChronoPlayer - available commands:"
	@grep -hE '^[a-zA-Z0-9_-]+:.*?## ' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

# --- One-command start --------------------------------------------------------

local: ## Start everything for development: Supabase, .env, Nuxt (http://localhost:3000)
	$(PNPM) local

docker: ## Start everything in Docker: Supabase + the app container (http://localhost:8080)
	$(PNPM) docker

stop: ## Stop the app container and Supabase (data is kept)
	$(PNPM) stop

docker-logs: ## Follow the logs of the app container
	docker compose logs -f app

# --- Setup --------------------------------------------------------------------

doctor: ## Check this computer's prerequisites (Node, pnpm, Docker…) and print the fixes
	node scripts/doctor.mjs

setup: install db-start env db-types ## First run: dependencies, local DB, .env, types
	@echo ""
	@echo "✔ Ready. Start the app with: make dev"
	@echo "  Demo user: demo@chronoplayer.local / chronoplayer"

install: ## Install dependencies
	$(PNPM) install

env: ## Create/update .env from the local Supabase stack
	$(PNPM) env:local

# --- Development --------------------------------------------------------------

dev: ## Start Nuxt in development (http://localhost:3000)
	$(PNPM) dev

build: ## Production build
	$(PNPM) build

preview: build ## Run the production build locally
	$(PNPM) preview

# --- Database (local Supabase, requires Docker) -------------------------------

db-start: ## Start Postgres, Auth and Storage in Docker
	$(SUPABASE) start

db-stop: ## Stop the local Supabase stack
	$(SUPABASE) stop

db-status: ## Show URLs and keys of the local stack
	$(SUPABASE) status

db-reset: ## Recreate the local DB: migrations + seed (deletes data!)
	$(SUPABASE) db reset

db-migrate: ## Apply new migrations to the local DB, keeping its data
	$(PNPM) db:migrate

db-types: ## Regenerate TypeScript types from the schema
	$(PNPM) db:types

db-migration: ## New migration: make db-migration name=description
	@test -n "$(name)" || { echo "Usage: make db-migration name=description"; exit 1; }
	$(SUPABASE) migration new $(name)

db-lint: ## Static analysis of the schema (security and performance)
	$(PNPM) db:lint

db-test: ## pgTAP tests for RLS and constraints
	$(SUPABASE) test db

db-studio: ## Supabase Studio address
	@echo "Supabase Studio: http://127.0.0.1:54323"

db-link: ## Link the remote Supabase project: make db-link ref=<project-ref>
	@test -n "$(ref)" || { echo "Usage: make db-link ref=<project-ref>"; exit 1; }
	$(SUPABASE) link --project-ref $(ref)

db-push: ## Apply migrations to the linked remote project
	$(SUPABASE) db push

# --- Quality and tests --------------------------------------------------------

lint: ## ESLint
	$(PNPM) lint

lint-fix: ## ESLint with automatic fixes
	$(PNPM) lint:fix

typecheck: ## Type checking (vue-tsc)
	$(PNPM) typecheck

test: ## Unit and component tests (Vitest)
	$(PNPM) test

test-unit: ## Unit tests only
	$(PNPM) test:unit

test-nuxt: ## Component tests only (Nuxt environment)
	$(PNPM) test:nuxt

test-e2e: ## End-to-end tests (Playwright, requires db-start; installs its Chromium when missing)
	$(PNPM) exec playwright install chromium
	$(PNPM) test:e2e

test-coverage: ## Tests with a coverage report
	$(PNPM) test:coverage

check: lint typecheck test ## Quick checks before a commit

ci: check db-lint db-test test-e2e ## Everything the CI runs

# --- Git ----------------------------------------------------------------------

# Make treats anything starting with "--" as one of its own options, so the
# script's --yes cannot be written after the target: it is a variable instead
# (make merge yes=1 → pnpm merge:main --yes).
merge: ## Merge the current branch into main (asks first; make merge yes=1 skips the question), delete it, back on main
	$(PNPM) merge:main $(if $(yes),--yes)

# --- Cleanup ------------------------------------------------------------------

clean: ## Remove builds and reports
	rm -rf .nuxt .output .data coverage playwright-report test-results

clean-all: clean ## Also remove node_modules
	rm -rf node_modules
