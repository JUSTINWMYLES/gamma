FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates ffmpeg libgomp1 libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY tts/worker/requirements.txt /tmp/tts-worker-requirements.txt
RUN pip install --no-cache-dir -r /tmp/tts-worker-requirements.txt

COPY tts/worker /app/tts/worker
COPY tts/voices /app/tts/voices

RUN useradd --system --create-home --home-dir /home/gamma gamma && chown -R gamma:gamma /app
USER gamma

CMD ["python", "-m", "tts.worker.worker"]
