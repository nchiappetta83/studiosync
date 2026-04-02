const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

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
  'task-confirmed': hasStringId,
};

class SyncEngine {
  constructor(db, sharedDrivePath, username, source = 'scheduling') {
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
  }

  initialize() {
    fs.mkdirSync(this.eventsDir, { recursive: true });
    fs.mkdirSync(this.snapshotsDir, { recursive: true });

    this._ensureProcessedFilesLoaded();
    this._seedProcessedFilesFromLegacyCursor();

    const isFreshDb = !this.db.getLastSyncTimestamp() && this.processedFiles.size === 0;
    this.pull(isFreshDb);
    this._maybeCleanup();
  }

  startPolling(onUpdate) {
    this.stopPolling();
    this.pollInterval = setInterval(() => {
      try {
        const appliedEvents = this.pull();
        this._maybeCleanup();
        if (appliedEvents.length > 0 && onUpdate) onUpdate(appliedEvents);
      } catch (err) {
        console.error('Sync pull error:', err.message);
      }
    }, this.POLL_MS);
  }

  setUsername(username) {
    this.username = username || 'unknown';
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
    let files;

    try {
      files = fs.readdirSync(this.eventsDir)
        .filter((file) => file.endsWith('.json'))
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

    // Process only files we have not already applied locally.
    const pendingFiles = files.filter(({ file }) => !this.processedFiles.has(file));
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
    this._ensureProcessedFilesLoaded();

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const shortId = uuidv4().split('-')[0];
    const filename = `${timestamp}_${this.username}_${type}_${shortId}.json`;

    const event = {
      type,
      data,
      author: this.username,
      source: this.source,
      instanceId: this.instanceId,
      timestamp: new Date().toISOString()
    };

    const filePath = path.join(this.eventsDir, filename);
    const tempPath = `${filePath}.tmp-${this.instanceId}`;

    try {
      fs.writeFileSync(tempPath, JSON.stringify(event, null, 2), 'utf-8');
      fs.renameSync(tempPath, filePath);
      this._markFileProcessed(filename);
    } catch (err) {
      try {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      } catch (_) {}
      console.error('Error pushing event:', err.message);
    }
  }

  /**
   * Clean up old event files and processed markers.
   */
  cleanup(daysOld = 30) {
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - daysOld);
      const cutoffStr = cutoff.toISOString().replace(/[:.]/g, '-');

      let removed = 0;
      removed += this._cleanupDirectory(this.eventsDir, cutoffStr);
      removed += this._cleanupDirectory(this.snapshotsDir, cutoffStr);

      this.db.cleanupProcessedSyncFiles(cutoffStr);
      for (const filename of [...this.processedFiles]) {
        if (filename < cutoffStr) {
          this.processedFiles.delete(filename);
          this.failedFiles.delete(filename);
        }
      }

      if (removed > 0) {
        console.log(`Sync cleanup: removed ${removed} old sync file(s)`);
      }
    } catch (err) {
      console.error('Sync cleanup error:', err.message);
    }
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
    const attempts = (this.failedFiles.get(filename) || 0) + 1;
    this.failedFiles.set(filename, attempts);

    if (attempts === 1 || attempts % 12 === 0) {
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

    const validator = EVENT_VALIDATORS[event.type];
    if (validator && !validator(event.data)) {
      throw new Error(`Event file ${filename} has invalid payload for ${event.type}`);
    }
  }
}

module.exports = SyncEngine;
