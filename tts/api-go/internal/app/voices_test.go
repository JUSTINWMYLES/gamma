package app

import (
	"os"
	"path/filepath"
	"testing"
)

func TestVoiceRegistryResolveAvailableAndReadiness(t *testing.T) {
	t.Parallel()

	tempDir := t.TempDir()
	promptPath := filepath.Join(tempDir, "prompts", "anchor.wav")
	if err := os.MkdirAll(filepath.Dir(promptPath), 0o755); err != nil {
		t.Fatalf("create prompt directory: %v", err)
	}
	if err := os.WriteFile(promptPath, []byte("wav"), 0o644); err != nil {
		t.Fatalf("write prompt file: %v", err)
	}

	manifestPath := filepath.Join(tempDir, "manifest.json")
	manifest := `{
		"version": 1,
		"description": "test voices",
		"voices": [
			{
				"id": "builtin-ok",
				"label": "Builtin OK",
				"source": "builtin",
				"engineVoiceName": "alloy"
			},
			{
				"id": "pack-ok",
				"label": "Pack OK",
				"source": "voice_pack",
				"packPromptAudio": "prompts/anchor.wav",
				"placeholder": true
			},
			{
				"id": "pack-missing",
				"label": "Pack Missing",
				"source": "voice_pack",
				"packPromptAudio": "prompts/missing.wav"
			}
		]
	}`
	if err := os.WriteFile(manifestPath, []byte(manifest), 0o644); err != nil {
		t.Fatalf("write manifest: %v", err)
	}

	registry, err := NewVoiceRegistry(manifestPath)
	if err != nil {
		t.Fatalf("create registry: %v", err)
	}

	availableVoice, err := registry.ResolveAvailable("pack-ok")
	if err != nil {
		t.Fatalf("resolve available voice: %v", err)
	}
	if !availableVoice.Available {
		t.Fatal("expected pack-ok to be available")
	}
	if availableVoice.Placeholder {
		t.Fatal("expected available packaged voice to clear placeholder flag")
	}

	if _, err := registry.ResolveAvailable("pack-missing"); err == nil || err.Error() != "packaged prompt audio not found" {
		t.Fatalf("expected missing prompt error, got %v", err)
	}

	if ready, reason := registry.Readiness(false); !ready || reason != "ok" {
		t.Fatalf("expected registry readiness without custom pack requirement, got ready=%v reason=%q", ready, reason)
	}

	if ready, reason := registry.Readiness(true); ready || reason != "custom voice pack \"pack-missing\" is not packaged yet" {
		t.Fatalf("expected custom pack readiness failure, got ready=%v reason=%q", ready, reason)
	}

	if _, err := registry.ResolveAvailable("missing-id"); err == nil || err.Error() != "voice preset \"missing-id\" not found" {
		t.Fatalf("expected missing voice error, got %v", err)
	}
}

func TestVoiceRegistryRefreshIfChangedRebuildsAvailabilityWithoutReloadingManifest(t *testing.T) {
	t.Parallel()

	tempDir := t.TempDir()
	promptDir := filepath.Join(tempDir, "prompts")
	if err := os.MkdirAll(promptDir, 0o755); err != nil {
		t.Fatalf("create prompt directory: %v", err)
	}

	manifestPath := filepath.Join(tempDir, "manifest.json")
	manifest := `{
		"version": 1,
		"description": "test voices",
		"voices": [
			{
				"id": "pack-ok",
				"label": "Pack OK",
				"source": "voice_pack",
				"packPromptAudio": "prompts/anchor.wav",
				"placeholder": true
			}
		]
	}`
	if err := os.WriteFile(manifestPath, []byte(manifest), 0o644); err != nil {
		t.Fatalf("write manifest: %v", err)
	}

	registry, err := NewVoiceRegistry(manifestPath)
	if err != nil {
		t.Fatalf("create registry: %v", err)
	}

	if _, err := registry.ResolveAvailable("pack-ok"); err == nil || err.Error() != "packaged prompt audio not found" {
		t.Fatalf("expected missing prompt error before file exists, got %v", err)
	}

	promptPath := filepath.Join(promptDir, "anchor.wav")
	if err := os.WriteFile(promptPath, []byte("wav"), 0o644); err != nil {
		t.Fatalf("write prompt file: %v", err)
	}

	if err := registry.RefreshIfChanged(); err != nil {
		t.Fatalf("refresh registry after prompt creation: %v", err)
	}

	availableVoice, err := registry.ResolveAvailable("pack-ok")
	if err != nil {
		t.Fatalf("resolve available voice after prompt creation: %v", err)
	}
	if !availableVoice.Available {
		t.Fatal("expected pack-ok to become available after prompt creation")
	}
}

func TestNormalizeTTSInputAndBuildArtifactKey(t *testing.T) {
	t.Parallel()

	if got := normalizeTTSInput("  Breaking\n\t news!!!   Now??  "); got != "Breaking news! Now?" {
		t.Fatalf("unexpected normalized text: %q", got)
	}

	if got := buildArtifactKey("room/one", "round two", "player#3", "job-4", "mp3"); got != "news-broadcast/room_one/round_two/player_3/job-4/final.mp3" {
		t.Fatalf("unexpected artifact key: %q", got)
	}
}
