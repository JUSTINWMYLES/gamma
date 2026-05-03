package app

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

var (
	jobsCreatedTotal = prometheus.NewCounter(prometheus.CounterOpts{
		Name: "gamma_tts_jobs_created_total",
		Help: "Total async TTS jobs created.",
	})
	jobsDeletedTotal = prometheus.NewCounter(prometheus.CounterOpts{
		Name: "gamma_tts_jobs_deleted_total",
		Help: "Total TTS jobs deleted or expired.",
	})
	jobsRequeuedTotal = prometheus.NewCounter(prometheus.CounterOpts{
		Name: "gamma_tts_jobs_requeued_total",
		Help: "Total TTS jobs requeued after lease recovery.",
	})
	cleanupRunsTotal = prometheus.NewCounter(prometheus.CounterOpts{
		Name: "gamma_tts_cleanup_runs_total",
		Help: "Total backup cleanup loop executions.",
	})
	queueDepthGauge = prometheus.NewGaugeVec(prometheus.GaugeOpts{
		Name: "gamma_tts_queue_depth",
		Help: "Approximate queue depth per priority lane.",
	}, []string{"lane"})
)

func init() {
	prometheus.MustRegister(jobsCreatedTotal, jobsDeletedTotal, jobsRequeuedTotal, cleanupRunsTotal, queueDepthGauge)
}

type Server struct {
	cfg         Config
	store       *RedisStore
	objectStore *ObjectStore
	voices      *VoiceRegistry
	router      *gin.Engine
}

func NewServer(ctx context.Context, cfg Config) (*Server, error) {
	store := NewRedisStore(cfg)
	if err := store.Ping(ctx); err != nil {
		return nil, fmt.Errorf("connect redis: %w", err)
	}
	objectStore, err := NewObjectStore(ctx, cfg)
	if err != nil {
		return nil, err
	}
	voices, err := NewVoiceRegistry(cfg.VoiceManifestPath)
	if err != nil {
		return nil, err
	}

	gin.SetMode(gin.ReleaseMode)
	router := gin.New()
	router.Use(gin.Logger(), gin.Recovery())

	server := &Server{
		cfg:         cfg,
		store:       store,
		objectStore: objectStore,
		voices:      voices,
		router:      router,
	}
	server.registerRoutes()
	return server, nil
}

func (s *Server) RunBackgroundLoops(ctx context.Context) {
	go s.cleanupExpiredJobsLoop(ctx)
	go s.recoverExpiredLeasesLoop(ctx)
	go s.refreshQueueDepthLoop(ctx)
}

func (s *Server) Handler() http.Handler {
	return s.router
}

func (s *Server) registerRoutes() {
	s.router.GET("/healthz", s.handleHealthz)
	s.router.GET("/readyz", s.handleReadyz)
	s.router.GET("/metrics", gin.WrapH(promhttp.Handler()))
	s.router.GET("/tts/voices", s.handleListVoices)
	s.router.POST("/tts/jobs", s.handleCreateJob)
	s.router.GET("/tts/jobs/:jobId", s.handleGetJob)
	s.router.PATCH("/tts/jobs/:jobId/priority", s.handleUpdatePriority)
	s.router.GET("/tts/jobs/:jobId/artifact", s.handleGetArtifact)
	s.router.DELETE("/tts/jobs/:jobId", s.handleDeleteJob)
	s.router.DELETE("/tts/rooms/:roomId/artifacts", s.handleDeleteRoomArtifacts)
}

func (s *Server) handleHealthz(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"status": "ok", "time": time.Now().UTC()})
}

func (s *Server) handleReadyz(c *gin.Context) {
	if err := s.voices.RefreshIfChanged(); err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"ready": false, "error": err.Error()})
		return
	}
	if err := s.store.Ping(c.Request.Context()); err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"ready": false, "error": err.Error()})
		return
	}
	if err := s.objectStore.Healthcheck(c.Request.Context()); err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"ready": false, "error": err.Error()})
		return
	}
	if ok, reason := s.voices.Readiness(s.cfg.RequireCustomVoicePack); !ok {
		c.JSON(http.StatusServiceUnavailable, gin.H{"ready": false, "error": reason})
		return
	}
	workerHeartbeats, err := s.store.ListWorkerHeartbeats(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"ready": false, "error": err.Error()})
		return
	}
	if s.cfg.RequireWorkerReady {
		if len(workerHeartbeats) == 0 || time.Since(workerHeartbeats[0].UpdatedAt) > s.cfg.WorkerHeartbeatMaxAge {
			c.JSON(http.StatusServiceUnavailable, gin.H{"ready": false, "error": "no healthy worker heartbeat detected"})
			return
		}
	}
	c.JSON(http.StatusOK, gin.H{
		"ready":             true,
		"availableVoices":   len(filterAvailableVoices(s.voices.List())),
		"workerHeartbeats":  workerHeartbeats,
		"retention":         s.cfg.Retention.String(),
		"cleanupInterval":   s.cfg.CleanupInterval.String(),
		"voicePackRequired": s.cfg.RequireCustomVoicePack,
	})
}

func (s *Server) handleListVoices(c *gin.Context) {
	if err := s.voices.RefreshIfChanged(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"voices": s.voices.List()})
}

func (s *Server) handleCreateJob(c *gin.Context) {
	if err := s.voices.RefreshIfChanged(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var req CreateJobRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	text := normalizeTTSInput(req.Text)
	if text == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "text is required"})
		return
	}

	voice, err := s.voices.ResolveAvailable(req.VoicePresetID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	now := time.Now().UTC()
	jobID := uuid.NewString()
	priority := normalizePriority(req.Priority)
	artifactKey := buildArtifactKey(req.RoomID, req.RoundID, req.PlayerID, jobID, "mp3")
	job := &Job{
		ID:                jobID,
		RoomID:            strings.TrimSpace(req.RoomID),
		RoundID:           strings.TrimSpace(req.RoundID),
		PlayerID:          strings.TrimSpace(req.PlayerID),
		Locale:            firstNonEmpty(strings.TrimSpace(req.Locale), "en"),
		VoicePresetID:     voice.ID,
		VoiceEngineName:   voice.EngineVoiceName,
		VoiceSource:       voice.Source,
		Text:              text,
		Priority:          priority,
		Status:            JobStatusQueued,
		ArtifactKey:       artifactKey,
		MimeType:          "audio/mpeg",
		EstimatedSpeechMs: req.EstimatedSpeechMs,
		ContentHash:       hashContent(text, voice.ID, s.cfg.ModelVersion),
		ModelVersion:      s.cfg.ModelVersion,
		CreatedAt:         now,
		UpdatedAt:         now,
		ExpiresAt:         now.Add(s.cfg.Retention),
	}

	if job.RoomID == "" || job.RoundID == "" || job.PlayerID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "roomId, roundId, playerId, and voicePresetId are required"})
		return
	}

	if err := s.store.CreateJob(c.Request.Context(), job); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	jobsCreatedTotal.Inc()
	c.JSON(http.StatusAccepted, job)
}

func (s *Server) handleGetJob(c *gin.Context) {
	job, err := s.store.LoadJob(c.Request.Context(), c.Param("jobId"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if job == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "job not found"})
		return
	}
	c.JSON(http.StatusOK, job)
}

func (s *Server) handleUpdatePriority(c *gin.Context) {
	job, err := s.store.LoadJob(c.Request.Context(), c.Param("jobId"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if job == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "job not found"})
		return
	}
	var req UpdatePriorityRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := s.store.UpdatePriority(c.Request.Context(), job, normalizePriority(req.Priority)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, job)
}

func (s *Server) handleGetArtifact(c *gin.Context) {
	job, err := s.store.LoadJob(c.Request.Context(), c.Param("jobId"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if job == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "job not found"})
		return
	}
	if job.Status != JobStatusReady || strings.TrimSpace(job.ArtifactKey) == "" {
		c.JSON(http.StatusConflict, gin.H{"error": "artifact is not ready"})
		return
	}
	object, info, err := s.objectStore.GetObject(c.Request.Context(), job.ArtifactKey)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	defer object.Close()
	c.Header("Content-Type", firstNonEmpty(info.ContentType, job.MimeType, "audio/mpeg"))
	c.Header("Content-Length", fmt.Sprintf("%d", info.Size))
	c.Header("Cache-Control", "private, max-age=7200, immutable")
	c.Status(http.StatusOK)
	_, _ = io.Copy(c.Writer, object)
}

func (s *Server) handleDeleteJob(c *gin.Context) {
	job, err := s.store.LoadJob(c.Request.Context(), c.Param("jobId"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if job == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "job not found"})
		return
	}
	if err := s.deleteJob(c.Request.Context(), job); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"deleted": true, "jobId": job.ID})
}

func (s *Server) handleDeleteRoomArtifacts(c *gin.Context) {
	roomID := strings.TrimSpace(c.Param("roomId"))
	jobIDs, err := s.store.ListRoomJobIDs(c.Request.Context(), roomID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	deleted := make([]string, 0, len(jobIDs))
	for _, jobID := range jobIDs {
		job, err := s.store.LoadJob(c.Request.Context(), jobID)
		if err != nil || job == nil {
			continue
		}
		if err := s.deleteJob(c.Request.Context(), job); err != nil {
			continue
		}
		deleted = append(deleted, job.ID)
	}
	c.JSON(http.StatusOK, DeleteRoomArtifactsResponse{RoomID: roomID, DeletedJobs: deleted, Count: len(deleted)})
}

func (s *Server) cleanupExpiredJobsLoop(ctx context.Context) {
	ticker := time.NewTicker(s.cfg.CleanupInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			cleanupRunsTotal.Inc()
			now := time.Now().UTC()
			jobIDs, err := s.store.ListExpiredJobIDs(ctx, now, 200)
			if err != nil {
				continue
			}
			for _, jobID := range jobIDs {
				job, err := s.store.LoadJob(ctx, jobID)
				if err != nil || job == nil || now.Before(job.ExpiresAt) {
					continue
				}
				_ = s.deleteJob(ctx, job)
			}
		}
	}
}

func (s *Server) recoverExpiredLeasesLoop(ctx context.Context) {
	ticker := time.NewTicker(s.cfg.LeaseRecoveryInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			now := time.Now().UTC()
			jobIDs, err := s.store.ListExpiredLeaseJobIDs(ctx, now, 200)
			if err != nil {
				continue
			}
			for _, jobID := range jobIDs {
				job, err := s.store.LoadJob(ctx, jobID)
				if err != nil || job == nil {
					continue
				}
				if job.LeaseExpiresAt == nil || now.Before(*job.LeaseExpiresAt) {
					continue
				}
				if job.Status != JobStatusProcessing {
					_ = s.store.ClearLease(ctx, job.ID)
					continue
				}
				job.RetryCount++
				job.LeaseOwner = ""
				job.LeaseExpiresAt = nil
				job.UpdatedAt = now
				if job.RetryCount > s.cfg.MaxRetries {
					job.Status = JobStatusFailedFinal
					job.Error = "lease expired too many times"
					_ = s.store.SaveJob(ctx, job)
					_ = s.store.ClearLease(ctx, job.ID)
					continue
				}
				job.Status = JobStatusQueued
				job.Error = "lease expired, job requeued"
				_ = s.store.SaveJob(ctx, job)
				_ = s.store.ClearLease(ctx, job.ID)
				_ = s.store.EnqueueJob(ctx, job.ID, job.Priority, now.Add(time.Duration(job.RetryCount)*time.Second))
				jobsRequeuedTotal.Inc()
			}
		}
	}
}

func (s *Server) refreshQueueDepthLoop(ctx context.Context) {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			for _, lane := range []JobPriority{PriorityBlocker, PriorityNext, PriorityBackground} {
				depth, err := s.store.client.ZCard(ctx, s.store.queueKey(lane)).Result()
				if err == nil {
					queueDepthGauge.WithLabelValues(string(lane)).Set(float64(depth))
				}
			}
		}
	}
}

func (s *Server) deleteJob(ctx context.Context, job *Job) error {
	_ = s.objectStore.DeleteObject(ctx, job.ArtifactKey)
	if err := s.store.DeleteJob(ctx, job); err != nil {
		return err
	}
	jobsDeletedTotal.Inc()
	return nil
}

func normalizePriority(value string) JobPriority {
	switch strings.TrimSpace(value) {
	case string(PriorityBlocker):
		return PriorityBlocker
	case string(PriorityNext):
		return PriorityNext
	default:
		return PriorityBackground
	}
}

var multiSpaceRegex = regexp.MustCompile(`\s+`)

func normalizeTTSInput(value string) string {
	normalized := strings.TrimSpace(value)
	normalized = multiSpaceRegex.ReplaceAllString(normalized, " ")
	normalized = collapseRepeatedPunctuation(normalized)
	return strings.TrimSpace(normalized)
}

func collapseRepeatedPunctuation(value string) string {
	if value == "" {
		return ""
	}

	var builder strings.Builder
	builder.Grow(len(value))

	var prev rune
	for i, current := range value {
		if i > 0 && current == prev && isCollapsiblePunctuation(current) {
			continue
		}
		builder.WriteRune(current)
		prev = current
	}

	return builder.String()
}

func isCollapsiblePunctuation(value rune) bool {
	switch value {
	case '!', '?', '.', ',':
		return true
	default:
		return false
	}
}

func buildArtifactKey(roomID string, roundID string, playerID string, jobID string, extension string) string {
	segments := []string{
		"news-broadcast",
		safeObjectSegment(roomID),
		safeObjectSegment(roundID),
		safeObjectSegment(playerID),
		safeObjectSegment(jobID),
		fmt.Sprintf("final.%s", extension),
	}
	return filepath.ToSlash(filepath.Join(segments...))
}

var unsafePathRegex = regexp.MustCompile(`[^a-zA-Z0-9._-]+`)

func safeObjectSegment(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return "unknown"
	}
	return unsafePathRegex.ReplaceAllString(trimmed, "_")
}

func hashContent(parts ...string) string {
	h := sha256.New()
	for _, part := range parts {
		_, _ = h.Write([]byte(part))
		_, _ = h.Write([]byte{0})
	}
	return hex.EncodeToString(h.Sum(nil))
}

func filterAvailableVoices(voices []VoicePreset) []VoicePreset {
	filtered := make([]VoicePreset, 0, len(voices))
	for _, voice := range voices {
		if voice.Available {
			filtered = append(filtered, voice)
		}
	}
	return filtered
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}
