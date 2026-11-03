const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const DeviceTrust = require('./deviceTrust');

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasStringId(value) {
  return isObject(value) && typeof value.id === 'string' && value.id.trim().length > 0;
}

function hasSortableItems(value) {
  return Array.isArray(value) && value.every((item) =>
    isObject(item)
    && typeof item.id === 'string'
    && Number.isFinite(Number(item.sort_order))
  );
}

function isRolloverPublication(value) {
  return isObject(value)
    && typeof value.week === 'string'
    && typeof value.publicationId === 'string'
    && value.publicationId.trim().length > 0
    && Array.isArray(value.tasks)
    && value.tasks.every(hasStringId)
    && Array.isArray(value.deletedTaskIds)
    && value.deletedTaskIds.every((id) => typeof id === 'string' && id.trim().length > 0)
    && (value.clearPTO === undefined || typeof value.clearPTO === 'boolean')
    && (value.baseTaskUpdatedAt === undefined || isObject(value.baseTaskUpdatedAt));
}

function isRolloverReviewStart(value) {
  return isObject(value)
    && typeof value.week === 'string'
    && value.week.trim().length > 0
    && (value.startedAt === undefined || typeof value.startedAt === 'string');
}

const EVENT_VALIDATORS = {
  'user-created': hasStringId,
  'user-updated': hasStringId,
  'user-deleted': hasStringId,
  'task-created': hasStringId,
  'task-updated': hasStringId,
  'task-deleted': hasStringId,
  'tasks-reordered': hasSortableItems,
  'subtask-created': hasStringId,
  'subtask-updated': hasStringId,
  'subtask-toggled': hasStringId,
  'subtask-deleted': hasStringId,
  'comment-added': hasStringId,
  'comment-deleted': hasStringId,
  'project-created': hasStringId,
  'project-updated': hasStringId,
  'project-deleted': hasStringId,
  'pto-set': (value) => isObject(value) && typeof value.user_id === 'string' && Array.isArray(value.dates),
  'pto-cleared': (value) => isObject(value) && typeof value.user_id === 'string',
  'project-notes-updated': (value) => isObject(value) && typeof value.project_id === 'string',
  'project-shared-note-created': hasStringId,
  'project-shared-note-updated': hasStringId,
  'project-shared-note-deleted': hasStringId,
  'role-created': hasStringId,
  'role-updated': hasStringId,
  'role-deleted': hasStringId,
  'roles-reordered': hasSortableItems,
  'priority-created': hasStringId,
  'priority-updated': hasStringId,
  'priority-deleted': hasStringId,
  'priorities-reordered': hasSortableItems,
  'setting-updated': (value) => isObject(value) && typeof value.key === 'string',
  'weekly-rollover': (value) => value === undefined || value === null || isObject(value),
  'rollover-review-started': isRolloverReviewStart,
  'rollover-published': isRolloverPublication,
  'task-confirmed': hasStringId,
  'task-activity-added': (value) => hasStringId(value) && typeof value.task_id === 'string' && typeof value.action === 'string',
};

class SyncEngine {
  constructor(db, sharedDrivePath, username, source = 'companion', logger = null, options = {}) {
    this.db = db;
    this.sharedDrivePath = sharedDrivePath;
    this.username = username || 'unknown';
    this.source = source;
    this.instanceId = uuidv4();
    this.eventsDir = path.join(sharedDrivePath, 'events');
    this.snapshotsDir = path.join(sharedDrivePath, 'snapshots');
    this.pollInterval = null;
    this.POLL_MS = 5000; // 5 seconds
    this.CLEANUP_MS = 12 * 60 * 60 * 1000; // 12 hours
    this.lastCleanupAt = 0;
    this.cleanupScheduled = false;
    this.cleanupInProgress = false;
    this.processedFiles = new Set();
    this.processedFilesLoaded = false;
    this.failedFiles = new Map();
    this.logger = logger;
    this.deviceTrust = options.appDataDir ? new DeviceTrust({ appDataDir: options.appDataDir, sharedDrivePath, source, logger }) : null;
  }

  getFailureSummary() {
    const failures = [...this.failedFiles.entries()].map(([filename, state]) => ({
      filename,
      attempts: state.attempts,
      error: state.error,
      nextRetryAt: state.nextRetryAt,
    }));

    return {
      count: failures.length,
      totalAttempts: failures.reduce((total, failure) => total + failure.attempts, 0),
      nextRetryAt: failures.reduce((next, failure) => {
        if (!failure.nextRetryAt) return next;
        return next === null ? failure.nextRetryAt : Math.min(next, failure.nextRetryAt);
      }, null),
    };
  }

  retryFailedFiles() {
    for (const state of this.failedFiles.values()) {
      state.nextRetryAt = 0;
    }
    return this.pull();
  }

  initialize() {
    fs.mkdirSync(this.eventsDir, { recursive: true });
    fs.mkdirSync(this.snapshotsDir, { recursive: true });

    this._ensureProcessedFilesLoaded();
    this._seedProcessedFilesFromLegacyCursor();
    this.flushOutbox();

    const isFreshDb = !this.db.getLastSyncTimestamp() && this.processedFiles.size === 0;
    // The caller needs the initial events as well.  The window may already
    // have loaded its cached rows while this synchronous catch-up is running;
    // without returning them, the renderer never receives a data-updated
    // notification because the next polling pass finds nothing new.
    const initialEvents = this.pull(isFreshDb);
    this._maybeCleanup();
    return initialEvents;
  }

  startPolling(onUpdate, onStatusChange) {
    this.stopPolling();
    this.pollInterval = setInterval(() => {
      try {
        this.flushOutbox();
        const previousFailureState = JSON.stringify(this.getFailureSummary());
        const appliedEvents = this.pull();
        this._maybeCleanup();
        const failureSummary = this.getFailureSummary();
        if (JSON.stringify(failureSummary) !== previousFailureState && onStatusChange) onStatusChange(failureSummary);
        if (appliedEvents.length > 0 && onUpdate) onUpdate(appliedEvents);
      } catch (err) {
        console.error('Sync pull error:', err.message);
      }
    }, this.POLL_MS);
  }

  setUsername(username) {
    this.username = username || 'unknown';
  }

  setActor(actor) {
    this.setUsername(actor?.username || 'unknown');
    this.deviceTrust?.setActor(actor);
  }

  getDeviceTrustStatus() {
    return this.deviceTrust?.getStatus() || null;
  }

  stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  /**
   * Pull new events from the shared drive and apply them locally.
   * Returns the events that were applied locally.
   */
  pull(includeOwnEvents = false) {
    this._ensureProcessedFilesLoaded();
    this._seedProcessedFilesFromLegacyCursor();
    let pendingFiles;

    try {
      const now = Date.now();
      // Only files still waiting to be applied are worth a stat() call.  The
      // event log is append-only, so statting every file on every poll costs
      // more as it grows (a network round trip each on a shared drive).
      pendingFiles = fs.readdirSync(this.eventsDir)
        .filter((file) => file.endsWith('.json'))
        .filter((file) => {
          if (this.processedFiles.has(file)) return false;
          const failure = this.failedFiles.get(file);
          return !failure || failure.nextRetryAt <= now;
        })
        .map((file) => {
          const filePath = path.join(this.eventsDir, file);
          let mtimeMs = 0;
          try {
            mtimeMs = fs.statSync(filePath).mtimeMs;
          } catch (_) {}

          return { file, filePath, mtimeMs };
        })
        .sort((left, right) => {
          if (left.mtimeMs !== right.mtimeMs) return left.mtimeMs - right.mtimeMs;
          return left.file.localeCompare(right.file);
        });
    } catch (err) {
      console.error('Cannot read events directory:', err.message);
      return [];
    }

    if (pendingFiles.length === 0) return [];

    const appliedEvents = [];

    for (const entry of pendingFiles) {
      try {
        const content = fs.readFileSync(entry.filePath, 'utf-8');
        const event = JSON.parse(content);
        this._validateEvent(event, entry.file);

        // Skip events created by this exact app instance — they were already
        // applied locally before being written to the shared drive.
        if (!includeOwnEvents && event.instanceId && event.instanceId === this.instanceId) {
          this._markFileProcessed(entry.file);
          continue;
        }

        this.db.applyEvent(event);
        appliedEvents.push(event);
        this._markFileProcessed(entry.file);
      } catch (err) {
        this._recordFailure(entry.file, err);
      }
    }

    return appliedEvents;
  }

  /**
   * Push a new event to the shared drive.
   * The event is already applied locally before this is called.
   */
  pushEvent(type, data) {
    const event = this.createEvent(type, data);

    try {
      this.db.queueSyncEvent(event);
      return this.flushOutbox(event.eventId);
    } catch (err) {
      this.logger?.error('Sync outbox queue failed', { type, error: err.message });
      console.error('Error queueing sync event:', err.message);
      return false;
    }
  }

  createEvent(type, data) {
    const event = {
      eventId: uuidv4(),
      schemaVersion: 2,
      type,
      data,
      author: this.username,
      source: this.source,
      deviceId: this.instanceId,
      instanceId: this.instanceId,
      timestamp: new Date().toISOString()
    };
    return this.deviceTrust?.signEvent(event) || event;
  }

  getOutboxSummary() {
    return this.db.getSyncOutboxSummary?.() || { pending: 0, attempts: 0, lastError: null, oldestQueuedAt: null };
  }

  flushOutbox(targetEventId = null) {
    this._ensureProcessedFilesLoaded();
    let targetPublished = false;
    for (const queued of this.db.getQueuedSyncEvents?.() || []) {
      try {
        this._writeQueuedEvent(queued.event);
        this.db.markSyncEventPublished(queued.event_id);
        if (queued.event_id === targetEventId) targetPublished = true;
      } catch (err) {
        this.db.recordSyncEventFailure(queued.event_id, err.message);
        this.logger?.warn('Sync outbox delivery failed', { eventId: queued.event_id, type: queued.event?.type, error: err.message });
      }
    }
    return targetEventId ? targetPublished : true;
  }

  _writeQueuedEvent(event) {
    if (!event?.eventId || !event.type) throw new Error('Queued sync event is incomplete.');
    const timestamp = String(event.timestamp || new Date().toISOString()).replace(/[:.]/g, '-');
    const filename = `${timestamp}_${this.username}_${event.type}_${String(event.eventId).slice(0, 8)}.json`;

    const filePath = path.join(this.eventsDir, filename);
    const tempPath = `${filePath}.tmp-${this.instanceId}`;
    try { fs.writeFileSync(tempPath, JSON.stringify(event, null, 2), 'utf-8'); fs.renameSync(tempPath, filePath); }
    catch (err) { try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch (_) {} throw err; }
    this._markFileProcessed(filename);
  }

  /**
   * Placeholder for future snapshot-verified compaction.
   * Replay history is deliberately retained for recovery and new-device bootstrap.
   */
  cleanup() {
    // Event files are the recovery source for a fresh or repaired local database.
    // Do not prune them until a verified, authoritative snapshot protocol is in place.
    // Losing replay history is worse than retaining a modest append-only audit log.
    return 0;
  }

  _maybeCleanup() {
    const now = Date.now();
    if (now - this.lastCleanupAt < this.CLEANUP_MS || this.cleanupScheduled || this.cleanupInProgress) return;
    this.lastCleanupAt = now;
    this.cleanupScheduled = true;

    setTimeout(() => {
      this.cleanupScheduled = false;
      this.cleanupInProgress = true;
      try {
        this.cleanup();
      } finally {
        this.cleanupInProgress = false;
      }
    }, 0);
  }

  _cleanupDirectory(dirPath, cutoffStr) {
    if (!fs.existsSync(dirPath)) return 0;

    const files = fs.readdirSync(dirPath).filter((file) => file.endsWith('.json'));
    let removed = 0;

    for (const file of files) {
      if (file < cutoffStr) {
        try {
          fs.unlinkSync(path.join(dirPath, file));
          removed++;
        } catch (_) {}
      }
    }

    return removed;
  }

  _ensureProcessedFilesLoaded() {
    if (this.processedFilesLoaded) return;

    for (const filename of this.db.getProcessedSyncFiles()) {
      this.processedFiles.add(filename);
    }

    this.processedFilesLoaded = true;
  }

  _seedProcessedFilesFromLegacyCursor() {
    if (this.processedFiles.size > 0) return;

    const lastSync = this.db.getLastSyncTimestamp();
    if (!lastSync) return;

    try {
      const files = fs.readdirSync(this.eventsDir).filter((file) => file.endsWith('.json'));
      for (const file of files) {
        if (file <= lastSync) {
          this.db.markSyncFileProcessed(file);
          this.processedFiles.add(file);
        }
      }
    } catch (err) {
      console.error('Cannot seed processed sync files:', err.message);
    }
  }

  _markFileProcessed(filename) {
    this.db.markSyncFileProcessed(filename);
    this.db.setLastSyncTimestamp(filename);
    this.processedFiles.add(filename);
    this.failedFiles.delete(filename);
  }

  _recordFailure(filename, err) {
    const previous = this.failedFiles.get(filename);
    const attempts = (previous?.attempts || 0) + 1;
    const retryDelay = Math.min(30 * 1000 * (2 ** Math.min(attempts - 1, 5)), 15 * 60 * 1000);
    this.failedFiles.set(filename, {
      attempts,
      error: err?.message || String(err),
      nextRetryAt: Date.now() + retryDelay,
    });

    if (attempts === 1 || attempts % 6 === 0) {
      console.error(`Error processing event ${filename}:`, err.message);
    }
  }

  _validateEvent(event, filename) {
    if (!isObject(event)) {
      throw new Error(`Event file ${filename} is not a JSON object`);
    }

    if (typeof event.type !== 'string' || !event.type.trim()) {
      throw new Error(`Event file ${filename} is missing a valid type`);
    }
    if (event.eventId !== undefined && (typeof event.eventId !== 'string' || !event.eventId.trim())) {
      throw new Error(`Event file ${filename} has an invalid eventId`);
    }
    const signatureResult = this.deviceTrust?.verifyEvent(event);
    if (signatureResult && !signatureResult.valid) throw new Error(signatureResult.error);

    const validator = EVENT_VALIDATORS[event.type];
    if (!validator) {
      throw new Error(`Event file ${filename} has unsupported type ${event.type}`);
    }
    if (!validator(event.data)) {
      throw new Error(`Event file ${filename} has invalid payload for ${event.type}`);
    }
  }
}

module.exports = SyncEngine;
