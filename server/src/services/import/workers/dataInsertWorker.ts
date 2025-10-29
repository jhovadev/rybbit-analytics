import { IJobQueue } from "../queues/jobQueue.js";
import { UmamiImportMapper } from "../mappings/umami.js";
import { DataInsertJob, DATA_INSERT_QUEUE } from "./jobs.js";
import { clickhouse } from "../../../db/clickhouse/clickhouse.js";
import { updateImportStatus, updateImportProgress } from "../importStatusManager.js";

const getImportDataMapping = (platform: string) => {
  switch (platform) {
    case "umami":
      return UmamiImportMapper;
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
};

export async function createDataInsertWorker(jobQueue: IJobQueue) {
  await jobQueue.work<DataInsertJob>(DATA_INSERT_QUEUE, async job => {
    const { site, importId, platform, chunk, allChunksSent } = job;

    if (allChunksSent) {
      try {
        await updateImportStatus(importId, "completed");
        return;
      } catch (error) {
        console.error(`[Import ${importId}] Failed to mark as completed:`, error);
        // Try to update to failed status, but don't crash worker
        try {
          await updateImportStatus(importId, "failed", "Failed to complete import");
        } catch (updateError) {
          console.error(`[Import ${importId}] Could not update status to failed:`, updateError);
        }
        // Don't re-throw - worker should continue
        return;
      }
    }

    try {
      const dataMapper = getImportDataMapping(platform);
      const transformedRecords = dataMapper.transform(chunk, site, importId);

      // Insert to ClickHouse (critical - must succeed)
      await clickhouse.insert({
        table: "events",
        values: transformedRecords,
        format: "JSONEachRow",
      });

      // Update progress (non-critical - log if fails but don't crash)
      try {
        await updateImportProgress(importId, transformedRecords.length);
      } catch (progressError) {
        console.warn(
          `[Import ${importId}] Progress update failed (data inserted successfully):`,
          progressError instanceof Error ? progressError.message : progressError
        );
        // Don't throw - data is safely in ClickHouse, progress can be off slightly
      }
    } catch (error) {
      console.error(`[Import ${importId}] ClickHouse insert failed:`, error);

      try {
        await updateImportStatus(importId, "failed", "Data insertion failed due to unknown error");
      } catch (updateError) {
        console.error(`[Import ${importId}] Could not update status to failed:`, updateError);
      }

      // Don't re-throw - worker should continue processing other jobs
      console.error(`[Import ${importId}] Import chunk failed, worker continuing`);
    }
  });
}
