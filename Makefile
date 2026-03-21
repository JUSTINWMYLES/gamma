.PHONY: install dev compose-up compose-down build test test-unit test-e2e smoke docker-push helm-install-operator clean dev-server dev-client

# ── Variables ────────────────────────────────────────────────────────────────
REGISTRY   ?= ghcr.io/gamma
TAG        ?= latest
NAMESPACE  ?= gamma-system

# ── Dependency installation ───────────────────────────────────────────────────
## Install all workspace dependencies
install:
	npm run install:all
	npx playwright install --with-deps chromium

# ── Local development ─────────────────────────────────────────────────────────
## Start server + unified client in watch mode (requires concurrently)
dev:
	npm run dev

## Start only the Colyseus server in watch mode
dev-server:
	npm run dev:server

## Start only the unified client Vite dev server
dev-client:
	npm run dev:client

# ── Docker Compose ────────────────────────────────────────────────────────────
## Bring up server + static client servers via Docker Compose
compose-up:
	docker compose up --build -d

## Tear down Docker Compose services
compose-down:
	docker compose down -v

## View live logs from Compose services
compose-logs:
	docker compose logs -f

# ── Build ─────────────────────────────────────────────────────────────────────
## Build server TypeScript + both Svelte client bundles
build:
	npm run build

## Build Docker images for server and client
docker-build:
	docker build -t $(REGISTRY)/gamma-server:$(TAG) -f server/Dockerfile .
	docker build -t $(REGISTRY)/gamma-client:$(TAG) -f client/app/Dockerfile .

## Tag and push Docker images (requires docker login)
docker-push: docker-build
	docker push $(REGISTRY)/gamma-server:$(TAG)
	docker push $(REGISTRY)/gamma-client:$(TAG)

# ── Tests ─────────────────────────────────────────────────────────────────────
## Run all tests (unit + e2e)
test: test-unit test-e2e

## Run server unit tests only (Vitest)
test-unit:
	npm run test --workspace=server

## Run Playwright e2e tests
test-e2e:
	npx playwright test

## Run e2e tests with visible browsers (headed mode)
test-e2e-headed:
	npx playwright test --headed

## Run acceptance-criteria smoke tests (requires all three services to be running)
smoke:
	node scripts/smoke-test.mjs

# ── Helm / Kubernetes ─────────────────────────────────────────────────────────
## Lint the Helm chart
helm-lint:
	helm lint helm/gamma-operator

## Install the operator Helm chart into a local kind/minikube cluster
helm-install-operator:
	helm upgrade --install gamma-operator helm/gamma-operator \
		--namespace $(NAMESPACE) \
		--create-namespace \
		--values helm/gamma-operator/values.yaml

## Uninstall the operator Helm chart
helm-uninstall-operator:
	helm uninstall gamma-operator --namespace $(NAMESPACE)

# ── Cleanup ───────────────────────────────────────────────────────────────────
## Remove all build artifacts
clean:
	rm -rf server/dist client/app/dist
	find . -name "node_modules" -not -path "*/.git/*" -prune -exec rm -rf {} + 2>/dev/null; true
