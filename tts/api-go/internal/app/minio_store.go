package app

import (
	"context"
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

type ObjectStore struct {
	client *minio.Client
	bucket string
}

func NewObjectStore(ctx context.Context, cfg Config) (*ObjectStore, error) {
	client, err := minio.New(cfg.MinIOEndpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(cfg.MinIOAccessKey, cfg.MinIOSecretKey, ""),
		Secure: cfg.MinIOUseSSL,
	})
	if err != nil {
		return nil, fmt.Errorf("create minio client: %w", err)
	}

	store := &ObjectStore{client: client, bucket: cfg.MinIOBucketName}
	if err := store.EnsureBucket(ctx); err != nil {
		return nil, err
	}
	return store, nil
}

func (s *ObjectStore) EnsureBucket(ctx context.Context) error {
	exists, err := s.client.BucketExists(ctx, s.bucket)
	if err != nil {
		return fmt.Errorf("check minio bucket: %w", err)
	}
	if exists {
		return nil
	}
	if err := s.client.MakeBucket(ctx, s.bucket, minio.MakeBucketOptions{}); err != nil {
		return fmt.Errorf("create minio bucket: %w", err)
	}
	return nil
}

func (s *ObjectStore) PutFile(ctx context.Context, objectKey string, filePath string, metadata map[string]string, contentType string) (int64, error) {
	info, err := s.client.FPutObject(ctx, s.bucket, objectKey, filePath, minio.PutObjectOptions{
		ContentType:  contentType,
		UserMetadata: metadata,
	})
	if err != nil {
		return 0, fmt.Errorf("upload object %q: %w", objectKey, err)
	}
	return info.Size, nil
}

func (s *ObjectStore) GetObject(ctx context.Context, objectKey string) (*minio.Object, minio.ObjectInfo, error) {
	object, err := s.client.GetObject(ctx, s.bucket, objectKey, minio.GetObjectOptions{})
	if err != nil {
		return nil, minio.ObjectInfo{}, fmt.Errorf("get object %q: %w", objectKey, err)
	}
	info, err := object.Stat()
	if err != nil {
		return nil, minio.ObjectInfo{}, fmt.Errorf("stat object %q: %w", objectKey, err)
	}
	return object, info, nil
}

func (s *ObjectStore) DeleteObject(ctx context.Context, objectKey string) error {
	if strings.TrimSpace(objectKey) == "" {
		return nil
	}
	if err := s.client.RemoveObject(ctx, s.bucket, objectKey, minio.RemoveObjectOptions{}); err != nil {
		return fmt.Errorf("delete object %q: %w", objectKey, err)
	}
	return nil
}

func (s *ObjectStore) Healthcheck(ctx context.Context) error {
	if err := s.EnsureBucket(ctx); err != nil {
		return err
	}
	tmpFile, err := os.CreateTemp("", "gamma-tts-healthcheck-*.txt")
	if err != nil {
		return err
	}
	defer os.Remove(tmpFile.Name())
	_, _ = io.WriteString(tmpFile, "ok")
	_ = tmpFile.Close()

	objectKey := "healthcheck/last-readyz.txt"
	if _, err := s.PutFile(ctx, objectKey, tmpFile.Name(), map[string]string{"healthcheck": "true"}, "text/plain"); err != nil {
		return err
	}
	return s.DeleteObject(ctx, objectKey)
}
