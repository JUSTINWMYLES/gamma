FROM golang:1.25-alpine AS builder
WORKDIR /src
COPY tts/api-go/go.mod tts/api-go/go.sum ./
RUN go mod download
COPY tts/api-go/ ./
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /out/tts-api ./main.go

FROM alpine:3.22
RUN apk add --no-cache ca-certificates
WORKDIR /app
COPY --from=builder /out/tts-api /usr/local/bin/tts-api
COPY tts/voices /app/voices
ENV PORT=8090
EXPOSE 8090
CMD ["/usr/local/bin/tts-api"]
