/**
 * Feed Processor Scheduler
 * Runs the feed processor on a schedule (every 30 minutes)
 */

import * as cron from 'node-cron';
import { runFeedProcessor, DEFAULT_CONFIG } from './index';
import { SourceConfig } from './types';

let scheduledTask: cron.ScheduledTask | null = null;
let isRunning = false;

/**
 * Start the feed processor scheduler
 */
export function startScheduler(config: SourceConfig = DEFAULT_CONFIG): void {
  if (scheduledTask) {
    console.log('[Feed Scheduler] Scheduler already running');
    return;
  }

  // Run every 30 minutes: */30 * * * *
  // Minutes Hours Days Months DayOfWeek
  const cronExpression = `*/${config.pollIntervalMinutes} * * * *`;

  console.log(`[Feed Scheduler] Starting scheduler with interval: ${config.pollIntervalMinutes} minutes`);
  console.log(`[Feed Scheduler] Cron expression: ${cronExpression}`);

  scheduledTask = cron.schedule(cronExpression, async () => {
    if (isRunning) {
      console.log('[Feed Scheduler] Previous run still in progress, skipping...');
      return;
    }

    isRunning = true;
    const startTime = Date.now();

    try {
      console.log('\n[Feed Scheduler] ⏰ Triggered scheduled run');
      const stats = await runFeedProcessor(config);

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`[Feed Scheduler] ✓ Run completed in ${duration}s`);
      console.log(`[Feed Scheduler] Stats:`, stats);

    } catch (error: any) {
      console.error('[Feed Scheduler] ❌ Run failed:', error);
    } finally {
      isRunning = false;
    }
  });

  console.log('[Feed Scheduler] ✓ Scheduler started successfully');
  console.log(`[Feed Scheduler] Next run: ${getNextRunTime(config.pollIntervalMinutes)}`);

  // Also run immediately on startup
  console.log('[Feed Scheduler] Running initial feed processing...');
  setTimeout(async () => {
    if (!isRunning) {
      isRunning = true;
      try {
        await runFeedProcessor(config);
      } catch (error) {
        console.error('[Feed Scheduler] Initial run failed:', error);
      } finally {
        isRunning = false;
      }
    }
  }, 5000); // Wait 5 seconds after startup
}

/**
 * Stop the scheduler
 */
export function stopScheduler(): void {
  if (!scheduledTask) {
    console.log('[Feed Scheduler] No scheduler running');
    return;
  }

  scheduledTask.stop();
  scheduledTask = null;
  console.log('[Feed Scheduler] Scheduler stopped');
}

/**
 * Get the status of the scheduler
 */
export function getSchedulerStatus(): { running: boolean; processing: boolean } {
  return {
    running: scheduledTask !== null,
    processing: isRunning,
  };
}

/**
 * Calculate next run time
 */
function getNextRunTime(intervalMinutes: number): string {
  const now = new Date();
  const next = new Date(now.getTime() + intervalMinutes * 60 * 1000);
  return next.toISOString();
}

/**
 * Trigger a manual run (for testing/debugging)
 */
export async function triggerManualRun(): Promise<void> {
  if (isRunning) {
    console.log('[Feed Scheduler] A run is already in progress');
    return;
  }

  console.log('[Feed Scheduler] 🔄 Manual run triggered');
  isRunning = true;

  try {
    const stats = await runFeedProcessor(DEFAULT_CONFIG);
    console.log('[Feed Scheduler] Manual run complete:', stats);
  } catch (error) {
    console.error('[Feed Scheduler] Manual run failed:', error);
    throw error;
  } finally {
    isRunning = false;
  }
}
