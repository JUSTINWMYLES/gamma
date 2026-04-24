package app

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

type RedisStore struct {
	client *redis.Client
	prefix string
}

func NewRedisStore(cfg Config) *RedisStore {
	options, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		options = &redis.Options{Addr: strings.TrimPrefix(cfg.RedisURL, "redis://")}
	}
	return &RedisStore{
		client: redis.NewClient(options),
		prefix: cfg.RedisKeyPrefix,
	}
}

func (s *RedisStore) Client() *redis.Client {
	return s.client
}

func (s *RedisStore) Ping(ctx context.Context) error {
	return s.client.Ping(ctx).Err()
}

func (s *RedisStore) jobKey(jobID string) string {
	return fmt.Sprintf("%s:job:%s", s.prefix, jobID)
}

func (s *RedisStore) roomJobsKey(roomID string) string {
	return fmt.Sprintf("%s:room:%s:jobs", s.prefix, roomID)
}

func (s *RedisStore) queueKey(priority JobPriority) string {
	return fmt.Sprintf("%s:queue:%s", s.prefix, priority)
}

func (s *RedisStore) expiriesKey() string {
	return fmt.Sprintf("%s:expiries", s.prefix)
}

func (s *RedisStore) leasesKey() string {
	return fmt.Sprintf("%s:leases", s.prefix)
}

func (s *RedisStore) workerHeartbeatPattern() string {
	return fmt.Sprintf("%s:worker:heartbeat:*", s.prefix)
}

func (s *RedisStore) SaveJob(ctx context.Context, job *Job) error {
	payload, err := json.Marshal(job)
	if err != nil {
		return fmt.Errorf("marshal job: %w", err)
	}
	pipe := s.client.TxPipeline()
	pipe.Set(ctx, s.jobKey(job.ID), payload, 0)
	pipe.ZAdd(ctx, s.expiriesKey(), redis.Z{Score: float64(job.ExpiresAt.UnixMilli()), Member: job.ID})
	_, err = pipe.Exec(ctx)
	if err != nil {
		return fmt.Errorf("save job: %w", err)
	}
	return nil
}

func (s *RedisStore) CreateJob(ctx context.Context, job *Job) error {
	payload, err := json.Marshal(job)
	if err != nil {
		return fmt.Errorf("marshal job: %w", err)
	}
	pipe := s.client.TxPipeline()
	pipe.Set(ctx, s.jobKey(job.ID), payload, 0)
	pipe.SAdd(ctx, s.roomJobsKey(job.RoomID), job.ID)
	pipe.ZAdd(ctx, s.expiriesKey(), redis.Z{Score: float64(job.ExpiresAt.UnixMilli()), Member: job.ID})
	pipe.ZAdd(ctx, s.queueKey(job.Priority), redis.Z{Score: float64(job.CreatedAt.UnixMilli()), Member: job.ID})
	_, err = pipe.Exec(ctx)
	if err != nil {
		return fmt.Errorf("create job: %w", err)
	}
	return nil
}

func (s *RedisStore) LoadJob(ctx context.Context, jobID string) (*Job, error) {
	payload, err := s.client.Get(ctx, s.jobKey(jobID)).Result()
	if err != nil {
		if err == redis.Nil {
			return nil, nil
		}
		return nil, fmt.Errorf("load job: %w", err)
	}
	var job Job
	if err := json.Unmarshal([]byte(payload), &job); err != nil {
		return nil, fmt.Errorf("decode job payload: %w", err)
	}
	return &job, nil
}

func (s *RedisStore) RemoveFromQueues(ctx context.Context, jobID string) error {
	pipe := s.client.TxPipeline()
	pipe.ZRem(ctx, s.queueKey(PriorityBlocker), jobID)
	pipe.ZRem(ctx, s.queueKey(PriorityNext), jobID)
	pipe.ZRem(ctx, s.queueKey(PriorityBackground), jobID)
	_, err := pipe.Exec(ctx)
	return err
}

func (s *RedisStore) EnqueueJob(ctx context.Context, jobID string, priority JobPriority, runAt time.Time) error {
	if err := s.RemoveFromQueues(ctx, jobID); err != nil {
		return err
	}
	return s.client.ZAdd(ctx, s.queueKey(priority), redis.Z{Score: float64(runAt.UnixMilli()), Member: jobID}).Err()
}

func (s *RedisStore) UpdatePriority(ctx context.Context, job *Job, priority JobPriority) error {
	job.Priority = priority
	job.UpdatedAt = time.Now().UTC()
	if err := s.SaveJob(ctx, job); err != nil {
		return err
	}
	if job.Status == JobStatusQueued || job.Status == JobStatusFailedRetryable {
		return s.EnqueueJob(ctx, job.ID, priority, time.Now().UTC())
	}
	return nil
}

func (s *RedisStore) SetLease(ctx context.Context, jobID string, leaseUntil time.Time) error {
	return s.client.ZAdd(ctx, s.leasesKey(), redis.Z{Score: float64(leaseUntil.UnixMilli()), Member: jobID}).Err()
}

func (s *RedisStore) ClearLease(ctx context.Context, jobID string) error {
	return s.client.ZRem(ctx, s.leasesKey(), jobID).Err()
}

func (s *RedisStore) DeleteJob(ctx context.Context, job *Job) error {
	if job == nil {
		return nil
	}
	pipe := s.client.TxPipeline()
	pipe.Del(ctx, s.jobKey(job.ID))
	pipe.SRem(ctx, s.roomJobsKey(job.RoomID), job.ID)
	pipe.ZRem(ctx, s.expiriesKey(), job.ID)
	pipe.ZRem(ctx, s.leasesKey(), job.ID)
	pipe.ZRem(ctx, s.queueKey(PriorityBlocker), job.ID)
	pipe.ZRem(ctx, s.queueKey(PriorityNext), job.ID)
	pipe.ZRem(ctx, s.queueKey(PriorityBackground), job.ID)
	_, err := pipe.Exec(ctx)
	if err != nil {
		return fmt.Errorf("delete job metadata: %w", err)
	}
	return nil
}

func (s *RedisStore) ListRoomJobIDs(ctx context.Context, roomID string) ([]string, error) {
	result, err := s.client.SMembers(ctx, s.roomJobsKey(roomID)).Result()
	if err != nil {
		return nil, err
	}
	sort.Strings(result)
	return result, nil
}

func (s *RedisStore) ListExpiredJobIDs(ctx context.Context, now time.Time, limit int64) ([]string, error) {
	return s.client.ZRangeByScore(ctx, s.expiriesKey(), &redis.ZRangeBy{
		Min:   "-inf",
		Max:   fmt.Sprintf("%d", now.UnixMilli()),
		Count: limit,
	}).Result()
}

func (s *RedisStore) ListExpiredLeaseJobIDs(ctx context.Context, now time.Time, limit int64) ([]string, error) {
	return s.client.ZRangeByScore(ctx, s.leasesKey(), &redis.ZRangeBy{
		Min:   "-inf",
		Max:   fmt.Sprintf("%d", now.UnixMilli()),
		Count: limit,
	}).Result()
}

func (s *RedisStore) ListWorkerHeartbeats(ctx context.Context) ([]WorkerHeartbeat, error) {
	keys, err := s.client.Keys(ctx, s.workerHeartbeatPattern()).Result()
	if err != nil {
		return nil, err
	}
	beats := make([]WorkerHeartbeat, 0, len(keys))
	for _, key := range keys {
		payload, err := s.client.Get(ctx, key).Result()
		if err != nil {
			continue
		}
		var beat WorkerHeartbeat
		if err := json.Unmarshal([]byte(payload), &beat); err != nil {
			continue
		}
		beats = append(beats, beat)
	}
	sort.Slice(beats, func(i, j int) bool {
		return beats[i].UpdatedAt.After(beats[j].UpdatedAt)
	})
	return beats, nil
}
