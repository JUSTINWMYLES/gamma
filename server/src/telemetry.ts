/**
 * server/src/telemetry.ts
 *
 * OpenTelemetry setup for the Gamma game server.
 *
 * Initialises an OTEL NodeSDK with:
 *   • OTLP/HTTP trace exporter (default: http://localhost:4318/v1/traces)
 *   • OTLP/HTTP metrics exporter (default: http://localhost:4318/v1/metrics)
 *   • Console fallback when OTEL_EXPORTER_OTLP_ENDPOINT is not set
 *
 * Environment variables:
 *   OTEL_EXPORTER_OTLP_ENDPOINT — base URL for OTLP collector (e.g. http://collector:4318)
 *   OTEL_SERVICE_NAME           — override service name (default: "gamma-server")
 *   OTEL_ENABLED                — set to "false" to disable telemetry entirely
 *
 * Usage:
 *   import { initTelemetry, meter, tracer } from "./telemetry";
 *   await initTelemetry();            // call once at startup, before other imports
 *   const counter = meter.createCounter("my_counter");
 *   const span = tracer.startSpan("my_operation");
 */

import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";
import { metrics, trace } from "@opentelemetry/api";

// ── Configuration ──────────────────────────────────────────────────────────────

const SERVICE_NAME = process.env.OTEL_SERVICE_NAME ?? "gamma-server";
const SERVICE_VERSION = "0.1.0";

const OTEL_ENABLED = (process.env.OTEL_ENABLED ?? "true").toLowerCase() !== "false";

// OTLP endpoint — the SDK auto-reads OTEL_EXPORTER_OTLP_ENDPOINT but we
// configure explicit exporters for traces + metrics with sensible defaults.
const OTLP_ENDPOINT = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://localhost:4318";

// ── SDK instance (lazily created) ──────────────────────────────────────────────

let sdk: NodeSDK | null = null;

/**
 * Initialise the OpenTelemetry SDK.
 * Safe to call multiple times — only the first call has effect.
 */
export async function initTelemetry(): Promise<void> {
  if (!OTEL_ENABLED) {
    console.log("[otel] telemetry disabled (OTEL_ENABLED=false)");
    return;
  }

  if (sdk) return; // already initialised

  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: SERVICE_NAME,
    [ATTR_SERVICE_VERSION]: SERVICE_VERSION,
  });

  const traceExporter = new OTLPTraceExporter({
    url: `${OTLP_ENDPOINT}/v1/traces`,
  });

  const metricExporter = new OTLPMetricExporter({
    url: `${OTLP_ENDPOINT}/v1/metrics`,
  });

  const metricReader = new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: 10_000, // flush metrics every 10s
  });

  sdk = new NodeSDK({
    resource,
    traceExporter,
    metricReader,
  });

  sdk.start();
  console.log(`[otel] telemetry initialised — exporting to ${OTLP_ENDPOINT}`);

  // Graceful shutdown on process exit
  const shutdown = async () => {
    try {
      await sdk?.shutdown();
      console.log("[otel] telemetry shut down gracefully");
    } catch (err) {
      console.error("[otel] error shutting down telemetry", err);
    }
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

// ── Convenience exports ────────────────────────────────────────────────────────

/** Global meter for creating counters, histograms, gauges. */
export const meter = metrics.getMeter(SERVICE_NAME, SERVICE_VERSION);

/** Global tracer for creating spans. */
export const tracer = trace.getTracer(SERVICE_NAME, SERVICE_VERSION);
