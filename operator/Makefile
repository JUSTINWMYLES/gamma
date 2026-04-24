# operator/Makefile
# Build and test targets for the Gamma operator.

IMG ?= ghcr.io/gamma/gamma-operator:latest
GOBIN ?= $(shell go env GOPATH)/bin
LOCALBIN ?= $(CURDIR)/bin
CONTROLLER_GEN ?= $(LOCALBIN)/controller-gen

.PHONY: build test fmt vet manifests generate docker-build docker-push run

## Build the operator binary
build: fmt vet
	go build -o bin/manager ./cmd/main.go

## Run unit tests
test: fmt vet
	go test ./... -coverprofile cover.out

## Format Go code
fmt:
	go fmt ./...

## Run Go vet
vet:
	go vet ./...

## Run the operator locally (requires kubeconfig)
run: fmt vet
	go run ./cmd/main.go

$(CONTROLLER_GEN):
	@mkdir -p $(LOCALBIN)
	GOBIN=$(LOCALBIN) go install sigs.k8s.io/controller-tools/cmd/controller-gen@latest

## Build the Docker image
docker-build:
	docker build -t $(IMG) .

## Push the Docker image
docker-push:
	docker push $(IMG)

## Generate CRD manifests and sync repo copies
manifests: $(CONTROLLER_GEN)
	@mkdir -p ../k8s/crds ../helm/gamma-operator/templates/crds
	$(CONTROLLER_GEN) crd paths="./api/..." output:crd:artifacts:config=../k8s/crds
	python3 -c 'from pathlib import Path; root = Path("..").resolve(); raw_path = root / "k8s" / "crds" / "gamma.io_gammainstances.yaml"; helm_path = root / "helm" / "gamma-operator" / "templates" / "crds" / "gamma.io_gammainstances.yaml"; raw_lines = raw_path.read_text(encoding="utf-8").splitlines(); out_lines = ["{{- if .Values.crds.install }}"]; [out_lines.extend([line, "  labels:", "    {{- include \"gamma-operator.labels\" . | nindent 4 }}"]) if line == "metadata:" else out_lines.append(line) for line in raw_lines]; out_lines.append("{{- end }}"); helm_path.write_text("\n".join(out_lines) + "\n", encoding="utf-8")'

## Generate DeepCopy methods
generate: $(CONTROLLER_GEN)
	$(CONTROLLER_GEN) object:headerFile=/dev/null paths="./api/..."
