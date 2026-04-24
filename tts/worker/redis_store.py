from __future__ import annotations

import math
from datetime import datetime, timedelta

import redis

try:  # pragma: no cover - import path compatibility
    from .models import Job, PRIORITY_BACKGROUND, PRIORITY_BLOCKER, PRIORITY_NEXT, format_timestamp, json_dumps, utc_now
    from .settings import WorkerConfig
except ImportError:  # pragma: no cover - direct script execution
    from models import Job, PRIORITY_BACKGROUND, PRIORITY_BLOCKER, PRIORITY_NEXT, format_timestamp, json_dumps, utc_now
    from settings import WorkerConfig


_CLAIM_JOB_LUA = """
local candidate_ids = redis.call('ZRANGEBYSCORE', KEYS[1], '-inf', ARGV[1], 'LIMIT', 0, ARGV[2])
for _, job_id in ipairs(candidate_ids) do
  local job_key = ARGV[3] .. job_id
  local payload = redis.call('GET', job_key)
  if not payload then
    redis.call('ZREM', KEYS[2], job_id)
    redis.call('ZREM', KEYS[3], job_id)
    redis.call('ZREM', KEYS[4], job_id)
    redis.call('ZREM', KEYS[5], job_id)
  else
    local ok, job = pcall(cjson.decode, payload)
    if not ok then
      redis.call('ZREM', KEYS[2], job_id)
      redis.call('ZREM', KEYS[3], job_id)
      redis.call('ZREM', KEYS[4], job_id)
      redis.call('ZREM', KEYS[5], job_id)
    else
      local status = tostring(job['status'] or '')
      if status == 'queued' or status == 'failed_retryable' then
        job['status'] = 'processing'
        job['leaseOwner'] = ARGV[4]
        job['leaseExpiresAt'] = ARGV[5]
        job['updatedAt'] = ARGV[6]
        job['error'] = nil
        job['completedAt'] = nil
        if job['startedAt'] == nil or job['startedAt'] == cjson.null then
          job['startedAt'] = ARGV[7]
        end
        local encoded = cjson.encode(job)
        redis.call('SET', job_key, encoded)
        redis.call('ZREM', KEYS[2], job_id)
        redis.call('ZREM', KEYS[3], job_id)
        redis.call('ZREM', KEYS[4], job_id)
        redis.call('ZADD', KEYS[5], ARGV[8], job_id)
        return encoded
      else
        redis.call('ZREM', KEYS[2], job_id)
        redis.call('ZREM', KEYS[3], job_id)
        redis.call('ZREM', KEYS[4], job_id)
      end
    end
  end
end
return nil
"""


_RENEW_LEASE_LUA = """
local payload = redis.call('GET', KEYS[1])
if not payload then
  redis.call('ZREM', KEYS[2], ARGV[1])
  return nil
end
local ok, job = pcall(cjson.decode, payload)
if not ok then
  return nil
end
if tostring(job['leaseOwner'] or '') ~= ARGV[2] then
  return nil
end
if tostring(job['status'] or '') ~= 'processing' then
  return nil
end
job['leaseExpiresAt'] = ARGV[3]
job['updatedAt'] = ARGV[4]
local encoded = cjson.encode(job)
redis.call('SET', KEYS[1], encoded)
redis.call('ZADD', KEYS[2], ARGV[5], ARGV[1])
return encoded
"""


_MARK_READY_LUA = """
local payload = redis.call('GET', KEYS[1])
if not payload then
  redis.call('ZREM', KEYS[2], ARGV[1])
  return nil
end
local ok, job = pcall(cjson.decode, payload)
if not ok then
  return nil
end
if tostring(job['leaseOwner'] or '') ~= ARGV[2] then
  return nil
end
job['status'] = 'ready'
job['leaseOwner'] = nil
job['leaseExpiresAt'] = nil
job['error'] = nil
job['updatedAt'] = ARGV[3]
job['completedAt'] = ARGV[4]
job['artifactBytes'] = tonumber(ARGV[5])
job['durationMs'] = tonumber(ARGV[6])
if ARGV[7] ~= '' then
  job['mimeType'] = ARGV[7]
end
if ARGV[8] ~= '' then
  job['modelVersion'] = ARGV[8]
end
local encoded = cjson.encode(job)
redis.call('SET', KEYS[1], encoded)
redis.call('ZREM', KEYS[2], ARGV[1])
redis.call('ZREM', KEYS[3], ARGV[1])
redis.call('ZREM', KEYS[4], ARGV[1])
redis.call('ZREM', KEYS[5], ARGV[1])
return encoded
"""


_MARK_FAILURE_LUA = """
local payload = redis.call('GET', KEYS[1])
if not payload then
  redis.call('ZREM', KEYS[2], ARGV[1])
  return nil
end
local ok, job = pcall(cjson.decode, payload)
if not ok then
  return nil
end
if tostring(job['leaseOwner'] or '') ~= ARGV[2] then
  return nil
end
job['status'] = ARGV[3]
job['error'] = ARGV[4]
job['retryCount'] = tonumber(ARGV[5])
job['leaseOwner'] = nil
job['leaseExpiresAt'] = nil
job['updatedAt'] = ARGV[6]
if ARGV[7] ~= '' then
  job['completedAt'] = ARGV[7]
else
  job['completedAt'] = nil
end
local encoded = cjson.encode(job)
redis.call('SET', KEYS[1], encoded)
redis.call('ZREM', KEYS[2], ARGV[1])
redis.call('ZREM', KEYS[3], ARGV[1])
redis.call('ZREM', KEYS[4], ARGV[1])
redis.call('ZREM', KEYS[5], ARGV[1])
if ARGV[3] == 'failed_retryable' and ARGV[9] ~= '' then
  local queue_key = KEYS[5]
  if ARGV[8] == 'blocker' then
    queue_key = KEYS[3]
  elseif ARGV[8] == 'next' then
    queue_key = KEYS[4]
  end
  redis.call('ZADD', queue_key, ARGV[9], ARGV[1])
end
return encoded
"""


class RedisStore:
    def __init__(self, config: WorkerConfig) -> None:
        self.prefix = config.redis_key_prefix
        self.client = redis.Redis.from_url(config.redis_url, decode_responses=True)
        self._claim_script = self.client.register_script(_CLAIM_JOB_LUA)
        self._renew_lease_script = self.client.register_script(_RENEW_LEASE_LUA)
        self._mark_ready_script = self.client.register_script(_MARK_READY_LUA)
        self._mark_failure_script = self.client.register_script(_MARK_FAILURE_LUA)

    def ping(self) -> None:
        self.client.ping()

    def job_key(self, job_id: str) -> str:
        return f"{self.prefix}:job:{job_id}"

    def job_key_prefix(self) -> str:
        return f"{self.prefix}:job:"

    def queue_key(self, priority: str) -> str:
        return f"{self.prefix}:queue:{priority}"

    def leases_key(self) -> str:
        return f"{self.prefix}:leases"

    def worker_heartbeat_key(self, worker_id: str) -> str:
        return f"{self.prefix}:worker:heartbeat:{worker_id}"

    def write_heartbeat(self, worker_id: str, ttl: timedelta, now: datetime | None = None) -> None:
        timestamp = now or utc_now()
        payload = json_dumps({"workerId": worker_id, "updatedAt": format_timestamp(timestamp)})
        self.client.set(
            self.worker_heartbeat_key(worker_id),
            payload,
            ex=max(1, math.ceil(ttl.total_seconds())),
        )

    def claim_next_job(
        self,
        priority: str,
        *,
        worker_id: str,
        lease_duration: timedelta,
        batch_size: int,
    ) -> Job | None:
        now = utc_now()
        lease_until = now + lease_duration
        payload = self._claim_script(
            keys=[
                self.queue_key(priority),
                self.queue_key(PRIORITY_BLOCKER),
                self.queue_key(PRIORITY_NEXT),
                self.queue_key(PRIORITY_BACKGROUND),
                self.leases_key(),
            ],
            args=[
                int(now.timestamp() * 1000),
                max(1, int(batch_size)),
                self.job_key_prefix(),
                worker_id,
                format_timestamp(lease_until),
                format_timestamp(now),
                format_timestamp(now),
                int(lease_until.timestamp() * 1000),
            ],
        )
        if not payload:
            return None
        return Job.from_json(payload)

    def renew_lease(self, job_id: str, *, worker_id: str, lease_duration: timedelta) -> bool:
        now = utc_now()
        lease_until = now + lease_duration
        payload = self._renew_lease_script(
            keys=[self.job_key(job_id), self.leases_key()],
            args=[
                job_id,
                worker_id,
                format_timestamp(lease_until),
                format_timestamp(now),
                int(lease_until.timestamp() * 1000),
            ],
        )
        return bool(payload)

    def mark_ready(
        self,
        job_id: str,
        *,
        worker_id: str,
        artifact_bytes: int,
        duration_ms: int,
        mime_type: str,
        model_version: str,
    ) -> Job | None:
        now = utc_now()
        payload = self._mark_ready_script(
            keys=[
                self.job_key(job_id),
                self.leases_key(),
                self.queue_key(PRIORITY_BLOCKER),
                self.queue_key(PRIORITY_NEXT),
                self.queue_key(PRIORITY_BACKGROUND),
            ],
            args=[
                job_id,
                worker_id,
                format_timestamp(now),
                format_timestamp(now),
                int(artifact_bytes),
                int(duration_ms),
                mime_type or "",
                model_version or "",
            ],
        )
        if not payload:
            return None
        return Job.from_json(payload)

    def mark_failure(
        self,
        job_id: str,
        *,
        worker_id: str,
        status: str,
        error: str,
        retry_count: int,
        priority: str,
        run_at: datetime | None,
    ) -> Job | None:
        now = utc_now()
        completed_at = format_timestamp(now) if status != "failed_retryable" else ""
        payload = self._mark_failure_script(
            keys=[
                self.job_key(job_id),
                self.leases_key(),
                self.queue_key(PRIORITY_BLOCKER),
                self.queue_key(PRIORITY_NEXT),
                self.queue_key(PRIORITY_BACKGROUND),
            ],
            args=[
                job_id,
                worker_id,
                status,
                error,
                int(retry_count),
                format_timestamp(now),
                completed_at,
                priority,
                "" if run_at is None else int(run_at.timestamp() * 1000),
            ],
        )
        if not payload:
            return None
        return Job.from_json(payload)
