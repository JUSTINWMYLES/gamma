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
	manifestSize int64
	manifestTime int64
	rawVoices    []VoicePreset
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
	manifestInfo, err := os.Stat(r.manifestPath)
	if err != nil {
		return fmt.Errorf("stat voice manifest: %w", err)
	}

	data, err := os.ReadFile(r.manifestPath)
	if err != nil {
		return fmt.Errorf("read voice manifest: %w", err)
	}

	var manifest VoiceManifestFile
	if err := json.Unmarshal(data, &manifest); err != nil {
		return fmt.Errorf("decode voice manifest: %w", err)
	}

	r.mu.Lock()
	r.manifestSize = manifestInfo.Size()
	r.manifestTime = manifestInfo.ModTime().UnixNano()
	r.rawVoices = append([]VoicePreset(nil), manifest.Voices...)
	r.rebuildLocked()
	r.mu.Unlock()
	return nil
}

func (r *VoiceRegistry) RefreshIfChanged() error {
	manifestInfo, err := os.Stat(r.manifestPath)
	if err != nil {
		return fmt.Errorf("stat voice manifest: %w", err)
	}

	r.mu.RLock()
	unchanged := len(r.rawVoices) > 0 && manifestInfo.Size() == r.manifestSize && manifestInfo.ModTime().UnixNano() == r.manifestTime
	r.mu.RUnlock()
	if !unchanged {
		data, err := os.ReadFile(r.manifestPath)
		if err != nil {
			return fmt.Errorf("read voice manifest: %w", err)
		}

		var manifest VoiceManifestFile
		if err := json.Unmarshal(data, &manifest); err != nil {
			return fmt.Errorf("decode voice manifest: %w", err)
		}

		r.mu.Lock()
		r.manifestSize = manifestInfo.Size()
		r.manifestTime = manifestInfo.ModTime().UnixNano()
		r.rawVoices = append([]VoicePreset(nil), manifest.Voices...)
		r.rebuildLocked()
		r.mu.Unlock()
		return nil
	}

	r.mu.Lock()
	r.rebuildLocked()
	r.mu.Unlock()
	return nil
}

func (r *VoiceRegistry) rebuildLocked() {
	voices := make(map[string]VoicePreset, len(r.rawVoices))
	ordered := make([]VoicePreset, 0, len(r.rawVoices))
	for _, voice := range r.rawVoices {
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

	r.voices = voices
	r.ordered = ordered
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
