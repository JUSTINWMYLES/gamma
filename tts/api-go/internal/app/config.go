package app

import (
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Port                   string
	RedisURL               string
	RedisKeyPrefix         string
	MinIOEndpoint          string
	MinIOUseSSL            bool
	MinIOAccessKey         string
	MinIOSecretKey         string
	MinIOBucketName        string
	Retention              time.Duration
	CleanupInterval        time.Duration
	LeaseRecoveryInterval  time.Duration
	MaxRetries             int
	VoiceManifestPath      string
	RequireWorkerReady     bool
	RequireCustomVoicePack bool
	WorkerHeartbeatMaxAge  time.Duration
	ModelVersion           string
}

func LoadConfig() Config {
	return Config{
		Port:                   envString("PORT", "8090"),
		RedisURL:               envString("REDIS_URL", "redis://localhost:6379/0"),
		RedisKeyPrefix:         envString("TTS_REDIS_KEY_PREFIX", "gamma:tts"),
		MinIOEndpoint:          envString("MINIO_ENDPOINT", "localhost:9000"),
		MinIOUseSSL:            envBool("MINIO_USE_SSL", false),
		MinIOAccessKey:         envString("MINIO_ACCESS_KEY", "gamma"),
		MinIOSecretKey:         envString("MINIO_SECRET_KEY", "gammalocal"),
		MinIOBucketName:        envString("MINIO_BUCKET_NAME", "gamma-tts-artifacts"),
		Retention:              envDuration("TTS_RETENTION", 2*time.Hour),
		CleanupInterval:        envDuration("TTS_CLEANUP_INTERVAL", 10*time.Minute),
		LeaseRecoveryInterval:  envDuration("TTS_LEASE_RECOVERY_INTERVAL", 15*time.Second),
		MaxRetries:             envInt("TTS_MAX_RETRIES", 3),
		VoiceManifestPath:      envString("TTS_VOICE_MANIFEST_PATH", "/app/voices/manifest.json"),
		RequireWorkerReady:     envBool("TTS_REQUIRE_WORKER_READY", false),
		RequireCustomVoicePack: envBool("TTS_REQUIRE_CUSTOM_VOICE_PACK", false),
		WorkerHeartbeatMaxAge:  envDuration("TTS_WORKER_HEARTBEAT_MAX_AGE", 45*time.Second),
		ModelVersion:           envString("TTS_MODEL_VERSION", "OpenMOSS-Team/MOSS-TTS-Nano-100M-ONNX"),
	}
}

func envString(name string, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(name)); value != "" {
		return value
	}
	return fallback
}

func envBool(name string, fallback bool) bool {
	value := strings.TrimSpace(os.Getenv(name))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.ParseBool(value)
	if err != nil {
		return fallback
	}
	return parsed
}

func envInt(name string, fallback int) int {
	value := strings.TrimSpace(os.Getenv(name))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return parsed
}

func envDuration(name string, fallback time.Duration) time.Duration {
	value := strings.TrimSpace(os.Getenv(name))
	if value == "" {
		return fallback
	}
	parsed, err := time.ParseDuration(value)
	if err == nil {
		return parsed
	}
	if seconds, convErr := strconv.Atoi(value); convErr == nil {
		return time.Duration(seconds) * time.Second
	}
	return fallback
}
