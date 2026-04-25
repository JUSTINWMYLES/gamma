from __future__ import annotations

from io import BytesIO

from minio import Minio
from minio.error import S3Error

try:  # pragma: no cover - import path compatibility
    from .settings import WorkerConfig
except ImportError:  # pragma: no cover - direct script execution
    from settings import WorkerConfig


class ObjectStore:
    def __init__(self, config: WorkerConfig) -> None:
        self.bucket_name = config.minio_bucket_name
        self.client = Minio(
            config.minio_endpoint,
            access_key=config.minio_access_key,
            secret_key=config.minio_secret_key,
            secure=config.minio_use_ssl,
        )

    def ensure_bucket(self) -> None:
        if self.client.bucket_exists(self.bucket_name):
            return
        try:
            self.client.make_bucket(self.bucket_name)
        except S3Error as exc:
            if exc.code not in {"BucketAlreadyOwnedByYou", "BucketAlreadyExists"}:
                raise

    def put_bytes(
        self,
        object_key: str,
        payload: bytes,
        *,
        content_type: str,
        metadata: dict[str, str] | None = None,
    ) -> int:
        data = BytesIO(payload)
        self.client.put_object(
            self.bucket_name,
            object_key,
            data,
            length=len(payload),
            content_type=content_type,
            metadata=metadata or {},
        )
        return len(payload)
