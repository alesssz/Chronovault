# =============================================================================
# Chronovault — project commands
# Usage: make <command>     (make help for the full list)
# On Windows: run from Git Bash (GNU Make: winget install ezwinports.make) or WSL.
# New computer: make doctor (or node scripts/doctor.mjs) lists what is missing.
# =============================================================================

SHELL := bash
.DEFAULT_GOAL := help
.PHONY: help local docker stop docker-stop docker-logs setup install env dev build preview \
        db-start db-stop db-status db-reset db-migrate db-types db-types-check db-migration db-lint db-advisors db-test db-studio \
        db-link db-push lint lint-fix typecheck test test-unit test-nuxt test-e2e test-coverage \
        check ci clean clean-all merge doctor

PNPM     := pnpm
SUPABASE := $(PNPM) exec supabase

help: ## Show this list
	@echo "Chronovault - available commands:"
	@grep -hE '^[a-zA-Z0-9_-]+:.*?## ' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

# --- One-command start --------------------------------------------------------
# The app is two pieces (docs/05-architecture.md, 5.3):
#   1. Supabase, always in Docker: database, sign-in, covers and audio;
#   2. Nuxt: the pages AND the API (server/api) in one process, no separate API server.
# `make local` runs piece 2 on this computer with hot reload: the way to develop.
# `make docker` runs piece 2 as the production build in a container: to try the
# build only (no hot reload, rebuild after every change).

local: ## Develop: Supabase in Docker, then Nuxt (pages + API) here with hot reload (http://localhost:3100)
	$(PNPM) local

docker: ## Try the production build: Supabase + the app in a container, no hot reload (http://localhost:8180)
	$(PNPM) docker

stop: ## Stop the app container and Supabase (data is kept)
	$(PNPM) stop

docker-stop: ## Stop only the app container of `make docker` (Supabase keeps running)
	docker compose stop app

docker-logs: ## Follow the logs of the app container
	docker compose logs -f app

# --- Setup --------------------------------------------------------------------

doctor: ## Check this computer's prerequisites (Node, pnpm, Docker…) and print the fixes
	node scripts/doctor.mjs

setup: install db-start env db-types ## First run: dependencies, local DB, .env, types
	@echo ""
	@echo "✔ Ready. Start the app with: make dev (Nuxt, pages + API; Supabase is already up)"
	@echo "  Demo user: demo@chronovault.local / chronovault"

install: ## Install dependencies
	$(PNPM) install

env: ## Create/update .env from the local Supabase stack
	$(PNPM) env:local

# --- Development --------------------------------------------------------------

dev: ## Start Nuxt in development (http://localhost:3100)
	$(PNPM) dev

build: ## Production build
	$(PNPM) build

preview: build ## Run the production build locally (http://localhost:3100)
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

db-types-check: ## Fail when the committed types differ from the schema (run by CI)
	$(PNPM) db:types:check

db-migration: ## New migration: make db-migration name=description
	@test -n "$(name)" || { echo "Usage: make db-migration name=description"; exit 1; }
	$(SUPABASE) migration new $(name)

db-lint: ## Type check of the SQL functions (plpgsql); fails on any warning
	$(PNPM) db:lint

db-advisors: ## Supabase's security and performance advisors; fails on warnings
	$(PNPM) db:advisors

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

test-coverage: ## Tests with a coverage report; fails below the floors in vitest.config.ts
	$(PNPM) test:coverage

check: lint typecheck test-coverage ## Quick checks before a commit (tests with the coverage floors)

ci: check db-lint db-advisors db-types-check db-test test-e2e ## Everything the CI runs

# --- Git ----------------------------------------------------------------------

# Make treats anything starting with "--" as one of its own options, so the
# script's --yes cannot be written after the target: it is a variable instead
# (make merge yes=1 → pnpm merge:main --yes; make merge checks=0 → --no-checks).
merge: ## Run pnpm check, merge the current branch into main (asks first; yes=1 skips the question, checks=0 the checks), delete it
	$(PNPM) merge:main $(if $(yes),--yes) $(if $(filter 0,$(checks)),--no-checks)

# --- Cleanup ------------------------------------------------------------------

clean: ## Remove builds and reports
	rm -rf .nuxt .output .data coverage playwright-report test-results

clean-all: clean ## Also remove node_modules
	rm -rf node_modules
