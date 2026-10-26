import crypto from "node:crypto";

export type BulkImportRowResult = {
  row: number;
  name: string;
  status: "created" | "failed";
  inviteSent?: boolean;
  error?: string;
};

export type BulkImportJobStatus = "running" | "completed" | "failed";

export type BulkImportJobRecord = {
  id: string;
  ownerUserId: string;
  status: BulkImportJobStatus;
  total: number;
  processed: number;
  created: number;
  failed: number;
  results: BulkImportRowResult[];
  error?: string;
  startedAt: string;
  finishedAt?: string;
};

const jobs = new Map<string, BulkImportJobRecord>();
const JOB_TTL_MS = 24 * 60 * 60 * 1000;

function pruneOldJobs(): void {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, job] of jobs) {
    const finished = job.finishedAt ? Date.parse(job.finishedAt) : Date.parse(job.startedAt);
    if (job.status !== "running" && finished < cutoff) {
      jobs.delete(id);
    }
  }
}

export function createBulkImportJob(ownerUserId: string, total: number): string {
  pruneOldJobs();
  const id = crypto.randomUUID();
  jobs.set(id, {
    id,
    ownerUserId,
    status: "running",
    total,
    processed: 0,
    created: 0,
    failed: 0,
    results: [],
    startedAt: new Date().toISOString(),
  });
  return id;
}

export function updateBulkImportJobProgress(
  jobId: string,
  patch: Partial<Pick<BulkImportJobRecord, "processed" | "created" | "failed" | "results">>,
): void {
  const job = jobs.get(jobId);
  if (!job || job.status !== "running") return;
  Object.assign(job, patch);
}

export function completeBulkImportJob(
  jobId: string,
  payload: { results: BulkImportRowResult[]; created: number; failed: number },
): void {
  const job = jobs.get(jobId);
  if (!job) return;
  job.status = "completed";
  job.processed = job.total;
  job.results = payload.results;
  job.created = payload.created;
  job.failed = payload.failed;
  job.finishedAt = new Date().toISOString();
}

export function failBulkImportJob(jobId: string, error: string): void {
  const job = jobs.get(jobId);
  if (!job) return;
  job.status = "failed";
  job.error = error;
  job.finishedAt = new Date().toISOString();
}

export function getBulkImportJob(jobId: string): BulkImportJobRecord | undefined {
  return jobs.get(jobId);
}
