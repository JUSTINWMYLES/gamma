package app

import "time"

type JobStatus string

const (
	JobStatusQueued          JobStatus = "queued"
	JobStatusProcessing      JobStatus = "processing"
	JobStatusReady           JobStatus = "ready"
	JobStatusFailedRetryable JobStatus = "failed_retryable"
	JobStatusFailedFinal     JobStatus = "failed_final"
	JobStatusExpired         JobStatus = "expired"
)

type JobPriority string

const (
	PriorityBlocker    JobPriority = "blocker"
	PriorityNext       JobPriority = "next"
	PriorityBackground JobPriority = "background"
)

type Job struct {
	ID                string      `json:"id"`
	RoomID            string      `json:"roomId"`
	RoundID           string      `json:"roundId"`
	PlayerID          string      `json:"playerId"`
	Locale            string      `json:"locale"`
	VoicePresetID     string      `json:"voicePresetId"`
	VoiceEngineName   string      `json:"voiceEngineName,omitempty"`
	VoiceSource       string      `json:"voiceSource,omitempty"`
	Text              string      `json:"text"`
	Priority          JobPriority `json:"priority"`
	Status            JobStatus   `json:"status"`
	ArtifactKey       string      `json:"artifactKey,omitempty"`
	MimeType          string      `json:"mimeType,omitempty"`
	DurationMs        int         `json:"durationMs,omitempty"`
	EstimatedSpeechMs int         `json:"estimatedSpeechMs,omitempty"`
	ArtifactBytes     int64       `json:"artifactBytes,omitempty"`
	ContentHash       string      `json:"contentHash,omitempty"`
	ModelVersion      string      `json:"modelVersion"`
	RetryCount        int         `json:"retryCount"`
	Error             string      `json:"error,omitempty"`
	LeaseOwner        string      `json:"leaseOwner,omitempty"`
	LeaseExpiresAt    *time.Time  `json:"leaseExpiresAt,omitempty"`
	CreatedAt         time.Time   `json:"createdAt"`
	UpdatedAt         time.Time   `json:"updatedAt"`
	StartedAt         *time.Time  `json:"startedAt,omitempty"`
	CompletedAt       *time.Time  `json:"completedAt,omitempty"`
	ExpiresAt         time.Time   `json:"expiresAt"`
}

type CreateJobRequest struct {
	RoomID            string `json:"roomId"`
	RoundID           string `json:"roundId"`
	PlayerID          string `json:"playerId"`
	Locale            string `json:"locale"`
	VoicePresetID     string `json:"voicePresetId"`
	Text              string `json:"text"`
	Priority          string `json:"priority"`
	EstimatedSpeechMs int    `json:"estimatedSpeechMs"`
}

type UpdatePriorityRequest struct {
	Priority string `json:"priority"`
}

type DeleteRoomArtifactsResponse struct {
	RoomID      string   `json:"roomId"`
	DeletedJobs []string `json:"deletedJobs"`
	Count       int      `json:"count"`
}

type WorkerHeartbeat struct {
	WorkerID  string    `json:"workerId"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type VoiceManifestFile struct {
	Version     int           `json:"version"`
	Description string        `json:"description"`
	Voices      []VoicePreset `json:"voices"`
}

type VoicePreset struct {
	ID                 string `json:"id"`
	Label              string `json:"label"`
	Tone               string `json:"tone"`
	Source             string `json:"source"`
	EngineVoiceName    string `json:"engineVoiceName,omitempty"`
	PackPromptAudio    string `json:"packPromptAudio,omitempty"`
	PreviewPath        string `json:"previewPath,omitempty"`
	Placeholder        bool   `json:"placeholder,omitempty"`
	Available          bool   `json:"available,omitempty"`
	AvailabilityReason string `json:"availabilityReason,omitempty"`
}
