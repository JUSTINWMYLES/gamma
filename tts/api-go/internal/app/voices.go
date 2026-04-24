package app

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"sync"
)

type VoiceRegistry struct {
	manifestPath string
	manifestDir  string
	mu           sync.RWMutex
	voices       map[string]VoicePreset
	ordered      []VoicePreset
}

func NewVoiceRegistry(manifestPath string) (*VoiceRegistry, error) {
	registry := &VoiceRegistry{
		manifestPath: manifestPath,
		manifestDir:  filepath.Dir(manifestPath),
	}
	if err := registry.Refresh(); err != nil {
		return nil, err
	}
	return registry, nil
}

func (r *VoiceRegistry) Refresh() error {
	data, err := os.ReadFile(r.manifestPath)
	if err != nil {
		return fmt.Errorf("read voice manifest: %w", err)
	}

	var manifest VoiceManifestFile
	if err := json.Unmarshal(data, &manifest); err != nil {
		return fmt.Errorf("decode voice manifest: %w", err)
	}

	voices := make(map[string]VoicePreset, len(manifest.Voices))
	ordered := make([]VoicePreset, 0, len(manifest.Voices))
	for _, voice := range manifest.Voices {
		resolved := voice
		switch voice.Source {
		case "builtin":
			if voice.EngineVoiceName != "" {
				resolved.Available = true
			} else {
				resolved.AvailabilityReason = "missing builtin engine voice mapping"
			}
		case "voice_pack":
			if voice.PackPromptAudio == "" {
				resolved.AvailabilityReason = "missing packaged prompt audio path"
				break
			}
			promptPath := filepath.Join(r.manifestDir, voice.PackPromptAudio)
			if _, err := os.Stat(promptPath); err == nil {
				resolved.Available = true
				resolved.Placeholder = false
			} else {
				resolved.AvailabilityReason = "packaged prompt audio not found"
			}
		default:
			resolved.AvailabilityReason = "unknown voice source"
		}

		voices[resolved.ID] = resolved
		ordered = append(ordered, resolved)
	}

	sort.SliceStable(ordered, func(i, j int) bool {
		return ordered[i].Label < ordered[j].Label
	})

	r.mu.Lock()
	defer r.mu.Unlock()
	r.voices = voices
	r.ordered = ordered
	return nil
}

func (r *VoiceRegistry) List() []VoicePreset {
	r.mu.RLock()
	defer r.mu.RUnlock()
	voices := make([]VoicePreset, len(r.ordered))
	copy(voices, r.ordered)
	return voices
}

func (r *VoiceRegistry) ResolveAvailable(id string) (VoicePreset, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	voice, ok := r.voices[id]
	if !ok {
		return VoicePreset{}, fmt.Errorf("voice preset %q not found", id)
	}
	if !voice.Available {
		reason := voice.AvailabilityReason
		if reason == "" {
			reason = "voice preset is unavailable"
		}
		return VoicePreset{}, errors.New(reason)
	}
	return voice, nil
}

func (r *VoiceRegistry) Readiness(requireCustomVoicePack bool) (bool, string) {
	voices := r.List()
	availableCount := 0
	for _, voice := range voices {
		if voice.Available {
			availableCount++
		}
	}
	if availableCount == 0 {
		return false, "no voice presets are currently available"
	}

	if requireCustomVoicePack {
		for _, voice := range voices {
			if voice.Source == "voice_pack" && !voice.Available {
				return false, fmt.Sprintf("custom voice pack %q is not packaged yet", voice.ID)
			}
		}
	}

	return true, "ok"
}
