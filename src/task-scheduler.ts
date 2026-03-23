import { ChildProcess } from 'child_process';
import { CronExpressionParser } from 'cron-parser';
import fs from 'fs';

import { ASSISTANT_NAME, SCHEDULER_POLL_INTERVAL, TIMEZONE } from './config.js';
import {
  ContainerOutput,
  runContainerAgent,
  writeTasksSnapshot,
} from './container-runner.js';
import {
  addTaskComment,
  getAllTasks,
  getDueTasks,
  getTaskById,
  getTaskComments,
  getTaskThreadId,
  logTaskRun,
  setTaskThreadId,
  updateTask,
  updateTaskAfterRun,
} from './db.js';
import { GroupQueue } from './group-queue.js';
import { resolveGroupFolderPath } from './group-folder.js';
import { logger } from './logger.js';
import { RegisteredGroup, ScheduledTask } from './types.js';

/** Derive a human-readable task title from the prompt (mirrors dashboard taskTitle). */
export function taskTitle(prompt: string): string {
  if (!prompt) return 'Untitled Task';
  let t = prompt;
  const roleMatch = t.match(/^You are (?:a |the )([^.]+)\./i);
  const roleName = roleMatch ? roleMatch[1].trim() : null;
  t = t.replace(/^You are (?:a |the )[^.]+\.\s*/i, '');
  t = t.replace(/^Your (?:job|task) is to\s*/i, '');
  const firstLine = t.split('\n')[0].trim();
  if (!firstLine && roleName) return roleName;
  const firstSentence = firstLine.split(/\.\s/)[0];
  let title = (
    firstSentence.length < 80 ? firstSentence : firstLine.substring(0, 60)
  ).replace(/\.$/, '');
  if (title.length > 0) title = title[0].toUpperCase() + title.slice(1);
  return title || roleName || 'Untitled Task';
}

/** Check if a task is a daily cron (fires once every day, not weekly/monthly). */
function isDailyCron(task: ScheduledTask): boolean {
  if (task.schedule_type !== 'cron') return false;
  const parts = task.schedule_value.trim().split(/\s+/);
  if (parts.length < 5) return false;
  // A daily cron has * (or */1) for day-of-month (idx 2), month (idx 3), and day-of-week (idx 4)
  const isWild = (s: string) => s === '*' || s === '*/1';
  return isWild(parts[2]) && isWild(parts[3]) && isWild(parts[4]);
}

/**
 * Compute the next run time for a recurring task, anchored to the
 * task's scheduled time rather than Date.now() to prevent cumulative
 * drift on interval-based tasks.
 *
 * Co-authored-by: @community-pr-601
 */
export function computeNextRun(task: ScheduledTask): string | null {
  if (task.schedule_type === 'once') return null;

  const now = Date.now();

  if (task.schedule_type === 'cron') {
    const interval = CronExpressionParser.parse(task.schedule_value, {
      tz: TIMEZONE,
    });
    return interval.next().toISOString();
  }

  if (task.schedule_type === 'interval') {
    const ms = parseInt(task.schedule_value, 10);
    if (!ms || ms <= 0) {
      // Guard against malformed interval that would cause an infinite loop
      logger.warn(
        { taskId: task.id, value: task.schedule_value },
        'Invalid interval value',
      );
      return new Date(now + 60_000).toISOString();
    }
    // Anchor to the scheduled time, not now, to prevent drift.
    // Skip past any missed intervals so we always land in the future.
    let next = new Date(task.next_run!).getTime() + ms;
    while (next <= now) {
      next += ms;
    }
    return new Date(next).toISOString();
  }

  return null;
}

export interface SchedulerDependencies {
  registeredGroups: () => Record<string, RegisteredGroup>;
  getSessions: () => Record<string, string>;
  queue: GroupQueue;
  onProcess: (
    groupJid: string,
    proc: ChildProcess,
    containerName: string,
    groupFolder: string,
  ) => void;
  sendMessage: (jid: string, text: string) => Promise<void>;
  /** Create a Discord thread for a task. Returns thread ID or null. */
  createTaskThread?: (
    jid: string,
    threadName: string,
  ) => Promise<string | null>;
  /** Send a message to a specific Discord thread. */
  sendToThread?: (threadId: string, text: string) => Promise<void>;
}

async function runTask(
  task: ScheduledTask,
  deps: SchedulerDependencies,
): Promise<void> {
  const startTime = Date.now();
  let groupDir: string;
  try {
    groupDir = resolveGroupFolderPath(task.group_folder);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    // Stop retry churn for malformed legacy rows.
    updateTask(task.id, { status: 'paused' });
    logger.error(
      { taskId: task.id, groupFolder: task.group_folder, error },
      'Task has invalid group folder',
    );
    logTaskRun({
      task_id: task.id,
      run_at: new Date().toISOString(),
      duration_ms: Date.now() - startTime,
      status: 'error',
      result: null,
      error,
    });
    return;
  }
  fs.mkdirSync(groupDir, { recursive: true });

  logger.info(
    { taskId: task.id, group: task.group_folder },
    'Running scheduled task',
  );

  const groups = deps.registeredGroups();
  const group = Object.values(groups).find(
    (g) => g.folder === task.group_folder,
  );

  if (!group) {
    logger.error(
      { taskId: task.id, groupFolder: task.group_folder },
      'Group not found for task',
    );
    logTaskRun({
      task_id: task.id,
      run_at: new Date().toISOString(),
      duration_ms: Date.now() - startTime,
      status: 'error',
      result: null,
      error: `Group not found: ${task.group_folder}`,
    });
    return;
  }

  // Update tasks snapshot for container to read (filtered by group)
  const isMain = group.isMain === true;
  const tasks = getAllTasks();
  writeTasksSnapshot(
    task.group_folder,
    isMain,
    tasks.map((t) => ({
      id: t.id,
      groupFolder: t.group_folder,
      prompt: t.prompt,
      schedule_type: t.schedule_type,
      schedule_value: t.schedule_value,
      status: t.status,
      next_run: t.next_run,
    })),
  );

  // Create Discord thread for this task if it doesn't have one yet
  let threadId = getTaskThreadId(task.id);
  if (!threadId && task.chat_jid.startsWith('dc:') && deps.createTaskThread) {
    const title = taskTitle(task.prompt);
    threadId = await deps.createTaskThread(task.chat_jid, title);
    if (threadId) {
      setTaskThreadId(task.id, threadId);
      logger.info(
        { taskId: task.id, threadId, title },
        'Created Discord thread for task',
      );
    }
  }

  let result: string | null = null;
  let error: string | null = null;

  // Append unread user comments to the prompt so the agent sees follow-up instructions
  let prompt = task.prompt;
  const comments = getTaskComments(task.id);
  const unreadUserComments = comments.filter(
    (c) => c.sender !== 'agent' && !c.read,
  );
  if (unreadUserComments.length > 0) {
    const thread = unreadUserComments
      .map((c) => `[${c.sender} at ${c.created_at}]: ${c.message}`)
      .join('\n');
    prompt += `\n\n---\nUser follow-up comments on this task:\n${thread}`;
  }

  // For group context mode, use the group's current session
  const sessions = deps.getSessions();
  const sessionId =
    task.context_mode === 'group' ? sessions[task.group_folder] : undefined;

  // After the task produces a result, close the container promptly.
  // Tasks are single-turn — no need to wait IDLE_TIMEOUT (30 min) for the
  // query loop to time out. A short delay handles any final MCP calls.
  const TASK_CLOSE_DELAY_MS = 10000;
  let closeTimer: ReturnType<typeof setTimeout> | null = null;

  const scheduleClose = () => {
    if (closeTimer) return; // already scheduled
    closeTimer = setTimeout(() => {
      logger.debug({ taskId: task.id }, 'Closing task container after result');
      deps.queue.closeStdin(task.chat_jid);
    }, TASK_CLOSE_DELAY_MS);
  };

  let costUsd = 0;
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    const output = await runContainerAgent(
      group,
      {
        prompt,
        sessionId,
        groupFolder: task.group_folder,
        chatJid: task.chat_jid,
        isMain,
        isScheduledTask: true,
        assistantName: ASSISTANT_NAME,
      },
      (proc, containerName) =>
        deps.onProcess(task.chat_jid, proc, containerName, task.group_folder),
      async (streamedOutput: ContainerOutput) => {
        if (streamedOutput.result) {
          result = streamedOutput.result;
          // Forward result to user channel
          await deps.sendMessage(task.chat_jid, streamedOutput.result);
          // Also forward to task's Discord thread if it exists
          if (threadId && deps.sendToThread) {
            await deps.sendToThread(threadId, streamedOutput.result);
          }
          scheduleClose();
        }
        if (streamedOutput.usage) {
          costUsd = streamedOutput.usage.costUsd;
          inputTokens = streamedOutput.usage.inputTokens;
          outputTokens = streamedOutput.usage.outputTokens;
        }
        if (streamedOutput.status === 'success') {
          deps.queue.notifyIdle(task.chat_jid);
        }
        if (streamedOutput.status === 'error') {
          error = streamedOutput.error || 'Unknown error';
        }
      },
    );

    if (closeTimer) clearTimeout(closeTimer);

    if (output.status === 'error') {
      error = output.error || 'Unknown error';
    } else if (output.result) {
      // Result was already forwarded to the user via the streaming callback above
      result = output.result;
    }
    // Capture usage from final output too
    if (output.usage) {
      costUsd = output.usage.costUsd;
      inputTokens = output.usage.inputTokens;
      outputTokens = output.usage.outputTokens;
    }

    logger.info(
      {
        taskId: task.id,
        durationMs: Date.now() - startTime,
        costUsd,
        inputTokens,
        outputTokens,
      },
      'Task completed',
    );
  } catch (err) {
    if (closeTimer) clearTimeout(closeTimer);
    error = err instanceof Error ? err.message : String(err);
    logger.error({ taskId: task.id, error }, 'Task failed');
  }

  const durationMs = Date.now() - startTime;

  logTaskRun({
    task_id: task.id,
    run_at: new Date().toISOString(),
    duration_ms: durationMs,
    status: error ? 'error' : 'success',
    result,
    error,
    cost_usd: costUsd,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
  });

  // Auto-detect questions/blockers in task output and flag for review
  const finalResult = result;
  if (finalResult && !error) {
    const questionPatterns = [
      /\?\s*$/m, // ends with ?
      /(?:need|require|waiting for)\s+(?:your|user|human)\s+(?:input|feedback|decision|approval)/i,
      /(?:please|could you|can you)\s+(?:confirm|clarify|provide|specify|let me know)/i,
      /(?:blocked|cannot proceed|unable to continue)/i,
      /(?:which|what|how|should I)\s+.{5,}\?/i,
    ];
    const hasQuestion = questionPatterns.some((p) => p.test(finalResult));
    if (hasQuestion) {
      // Extract the question lines
      const questionLines = finalResult
        .split('\n')
        .filter(
          (l) =>
            l.trim().endsWith('?') ||
            /(?:need|blocked|please|confirm|clarify)/i.test(l),
        )
        .slice(0, 3)
        .map((l) => l.trim())
        .join('\n');
      const questionText = questionLines || finalResult.slice(0, 300);
      addTaskComment(task.id, 'agent', questionText, 'question');
      logger.info(
        { taskId: task.id },
        'Auto-detected question in task output, flagged for review',
      );
    }
  }

  let nextRun = computeNextRun(task);
  const resultSummary = error
    ? `Error: ${error}`
    : result
      ? result.slice(0, 200)
      : 'Completed';

  // One-off tasks should NEVER auto-complete. They go to 'needs_review'
  // so the user can explicitly mark them done via the dashboard.
  // Only recurring tasks auto-advance via computeNextRun.
  if (nextRun === null && task.schedule_type === 'once') {
    logger.info(
      { taskId: task.id },
      'One-off task run finished, moving to review (not auto-completing)',
    );
    updateTaskAfterRun(task.id, null, resultSummary, 'needs_review');
    return;
  }

  // Cron tasks should NEVER be marked completed — they need to run again.
  // Compute next run and keep them active.
  if (task.schedule_type === 'cron') {
    if (!nextRun) {
      // Safety: if computeNextRun failed for a cron task, compute it again
      nextRun = computeNextRun(task);
    }
    if (!nextRun) {
      // Last resort: set next run to 1 hour from now to prevent permanent death
      logger.warn(
        { taskId: task.id },
        'Cron task has no next_run, forcing 1h fallback',
      );
      nextRun = new Date(Date.now() + 3600000).toISOString();
    }
    updateTaskAfterRun(task.id, nextRun, resultSummary);
    logger.info(
      { taskId: task.id, nextRun },
      'Cron task completed run, staying active',
    );
    return;
  }

  updateTaskAfterRun(task.id, nextRun, resultSummary);
}

let schedulerRunning = false;

export function startSchedulerLoop(deps: SchedulerDependencies): void {
  if (schedulerRunning) {
    logger.debug('Scheduler loop already running, skipping duplicate start');
    return;
  }
  schedulerRunning = true;
  logger.info('Scheduler loop started');

  const loop = async () => {
    try {
      const dueTasks = getDueTasks();
      if (dueTasks.length > 0) {
        logger.info({ count: dueTasks.length }, 'Found due tasks');
      }

      for (const task of dueTasks) {
        // Re-check task status in case it was paused/cancelled
        const currentTask = getTaskById(task.id);
        if (!currentTask || currentTask.status !== 'active') {
          continue;
        }

        deps.queue.enqueueTask(currentTask.chat_jid, currentTask.id, () =>
          runTask(currentTask, deps),
        );
      }
    } catch (err) {
      logger.error({ err }, 'Error in scheduler loop');
    }

    setTimeout(loop, SCHEDULER_POLL_INTERVAL);
  };

  loop();
}

/** @internal - for tests only. */
export function _resetSchedulerLoopForTests(): void {
  schedulerRunning = false;
}
