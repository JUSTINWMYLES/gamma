from __future__ import annotations


class WorkerError(Exception):
    """Base worker exception."""


class RetryableJobError(WorkerError):
    """Failure that should be retried when retry budget remains."""


class FatalJobError(WorkerError):
    """Failure that should mark the job failed_final immediately."""
