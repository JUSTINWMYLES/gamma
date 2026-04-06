.PHONY: install dev dev-server dev-client compose-up compose-down compose-logs build docker-build docker-push test test-unit test-e2e test-e2e-headed test-coverage smoke lint helm-lint helm-template helm-install-operator helm-uninstall-operator operator-manifests operator-build operator-test operator-docker-build operator-docker-push clean help

# ── Variables ────────────────────────────────────────────────────────────────
REGISTRY   ?= ghcr.io/gamma
TAG        ?= latest
NAMESPACE  ?= gamma-system

# ── Dependency installation ───────────────────────────────────────────────────
install: ## Install all workspace dependencies + Playwright browsers
	npm run install:all
	npx playwright install --with-deps chromium

# ── Local development ─────────────────────────────────────────────────────────
dev: ## Start server + unified client in watch mode
	npm run dev

dev-server: ## Start only the Colyseus server in watch mode
	npm run dev:server

dev-client: ## Start only the unified client Vite dev server
	npm run dev:client

# ── Docker Compose ────────────────────────────────────────────────────────────
compose-up: ## Bring up server + client via Docker Compose
	docker compose up --build -d

compose-down: ## Tear down Docker Compose services
	docker compose down -v

compose-logs: ## View live logs from Compose services
	docker compose logs -f

# ── Build ─────────────────────────────────────────────────────────────────────
build: ## Build server TypeScript + Svelte client bundles
	npm run build

docker-build: ## Build Docker images for server and client
	docker build -t $(REGISTRY)/gamma-server:$(TAG) -f server/Dockerfile .
	docker build -t $(REGISTRY)/gamma-client:$(TAG) -f client/app/Dockerfile .

docker-push: docker-build ## Tag and push Docker images (requires docker login)
	docker push $(REGISTRY)/gamma-server:$(TAG)
	docker push $(REGISTRY)/gamma-client:$(TAG)

# ── Tests ─────────────────────────────────────────────────────────────────────
test: test-unit test-e2e ## Run all tests (unit + e2e)

test-unit: ## Run server unit tests only (Vitest)
	npm run test --workspace=server

test-e2e: ## Run Playwright e2e tests
	npx playwright test

test-e2e-headed: ## Run e2e tests with visible browsers (headed mode)
	npx playwright test --headed

test-coverage: ## Run server unit tests with coverage report
	npm run test:coverage --workspace=server

smoke: ## Run acceptance-criteria smoke tests
	node scripts/smoke-test.mjs

lint: ## Lint server and client source files
	npm run lint

# ── Helm / Kubernetes ─────────────────────────────────────────────────────────
helm-lint: ## Lint the Helm chart
	helm lint helm/gamma-operator

helm-template: ## Template the Helm chart (dry-run render)
	helm template gamma-operator helm/gamma-operator --namespace $(NAMESPACE)

helm-install-operator: ## Install operator Helm chart into local cluster
	helm upgrade --install gamma-operator helm/gamma-operator \
		--namespace $(NAMESPACE) \
		--create-namespace \
		--values helm/gamma-operator/values.yaml

helm-uninstall-operator: ## Uninstall the operator Helm chart
	helm uninstall gamma-operator --namespace $(NAMESPACE)

# ── Operator (kubebuilder) ───────────────────────────────────────────────────
operator-manifests: ## Generate CRD manifests and Go code
	cd operator && make manifests generate

operator-build: ## Build the operator binary
	cd operator && make build

operator-test: ## Run operator unit tests (envtest)
	cd operator && make test

operator-docker-build: ## Build the operator Docker image
	cd operator && make docker-build IMG=$(REGISTRY)/gamma-operator:$(TAG)

operator-docker-push: ## Push the operator Docker image
	cd operator && make docker-push IMG=$(REGISTRY)/gamma-operator:$(TAG)

# ── Cleanup ───────────────────────────────────────────────────────────────────
clean: ## Remove all build artifacts
	rm -rf server/dist client/app/dist
	find . -name "node_modules" -not -path "*/.git/*" -prune -exec rm -rf {} + 2>/dev/null; true

# ── Help ──────────────────────────────────────────────────────────────────────
help: ## Show available make targets
	@awk 'BEGIN {FS = ":.*##"; printf "Usage: make \033[36m<target>\033[0m\n\n"} /^[a-zA-Z_][a-zA-Z0-9_-]*:.*##/ {printf "  \033[36m%-28s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)
