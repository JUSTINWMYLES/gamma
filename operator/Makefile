# operator/Makefile
# Build and test targets for the Gamma operator.

IMG ?= ghcr.io/gamma/gamma-operator:latest
GOBIN ?= $(shell go env GOPATH)/bin

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

## Build the Docker image
docker-build:
	docker build -t $(IMG) .

## Push the Docker image
docker-push:
	docker push $(IMG)

## Generate CRD manifests (placeholder — requires controller-gen)
manifests:
	@echo "CRD manifests are maintained manually in k8s/crds/"

## Generate DeepCopy methods (placeholder — requires controller-gen)
generate:
	@echo "DeepCopy methods are maintained manually in zz_generated.deepcopy.go"
