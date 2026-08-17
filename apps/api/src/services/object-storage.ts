import fs from "node:fs/promises";
import path from "node:path";
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "../config.js";
import { logger } from "./logger.js";

let s3: S3Client | null = null;

function getS3(): S3Client {
  if (!s3) {
    s3 = new S3Client({
      region: config.s3Region,
      ...(config.s3Endpoint ? { endpoint: config.s3Endpoint } : {}),
      forcePathStyle: config.s3ForcePathStyle,
      ...(config.s3AccessKeyId && config.s3SecretAccessKey
        ? {
            credentials: {
              accessKeyId: config.s3AccessKeyId,
              secretAccessKey: config.s3SecretAccessKey
            }
          }
        : {})
    });
  }
  return s3;
}

export function objectStorageMode(): "s3" | "local" {
  return config.objectStorageEnabled ? "s3" : "local";
}

/**
 * Persist a blob. Returns a storage key/path usable later with readObject / signedUrl.
 * Prefers S3 when configured (horizontal-safe); otherwise local disk (single-instance only).
 */
export async function putObject(
  key: string,
  body: Buffer,
  contentType?: string
): Promise<{ storageKey: string; mode: "s3" | "local" }> {
  if (config.objectStorageEnabled) {
    await getS3().send(
      new PutObjectCommand({
        Bucket: config.s3Bucket,
        Key: key,
        Body: body,
        ContentType: contentType
      })
    );
    return { storageKey: `s3://${config.s3Bucket}/${key}`, mode: "s3" };
  }

  if (process.env.NODE_ENV === "production") {
    logger.warn("object_storage_local_in_production", {
      hint: "Set S3_BUCKET for multi-replica deployments"
    });
  }
  await fs.mkdir(config.uploadsDir, { recursive: true });
  const full = path.join(config.uploadsDir, key);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, body);
  return { storageKey: full, mode: "local" };
}

export async function readObject(storageKey: string): Promise<Buffer> {
  if (storageKey.startsWith("s3://")) {
    const without = storageKey.slice("s3://".length);
    const slash = without.indexOf("/");
    const bucket = without.slice(0, slash);
    const key = without.slice(slash + 1);
    const out = await getS3().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const bytes = await out.Body?.transformToByteArray();
    if (!bytes) throw new Error("Empty S3 object");
    return Buffer.from(bytes);
  }
  return fs.readFile(storageKey);
}

export async function getSignedDownloadUrl(
  storageKey: string,
  expiresInSeconds = 3600
): Promise<string | null> {
  if (!storageKey.startsWith("s3://")) return null;
  const without = storageKey.slice("s3://".length);
  const slash = without.indexOf("/");
  const bucket = without.slice(0, slash);
  const key = without.slice(slash + 1);
  return getSignedUrl(
    getS3(),
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: expiresInSeconds }
  );
}
