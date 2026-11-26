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

function isRolloverReviewEnd(value) {
  return isObject(value)
    && typeof value.week === 'string'
    && value.week.trim().length > 0
    && (value.endedAt === undefined || typeof value.endedAt === 'string');
}

const EVENT_VALIDATORS = {
  'user-created': hasStringId,
  'user-updated': hasStringId,
  'user-deleted': hasStringId,
  'task-created': hasStringId,
  'task-updated': hasStringId,
  'task-deleted': hasStringId,
  'tasks-reordered': hasSortableItems,
  'work-card-created': hasStringId,
  'work-card-updated': hasStringId,
  'work-card-completed': (value) => hasStringId(value) && typeof value.project_id === 'string' && typeof value.completed_by === 'string',
  'work-card-deleted': hasStringId,
  'work-card-focus-set': (value) => isObject(value) && typeof value.user_id === 'string' && (typeof value.work_card_id === 'string' || value.work_card_id === null),
  'work-card-category-created': hasStringId,
  'work-card-category-updated': hasStringId,
  'work-card-category-deleted': hasStringId,
  'work-card-categories-reordered': hasSortableItems,
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
  'rollover-review-ended': isRolloverReviewEnd,
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
    this.RETENTION_DAYS = 30; // how long event files stay in the shared folder once a snapshot covers them
    this._maxProcessed = null;
    this._horizonCache = { mtimeMs: -1, value: null };
    this.processedFilesLoaded = false;
    this.failedFiles = new Map();
    this.bootstrapFailure = null;
    this.lastRecovery = null;     // set when this computer rebuilt its shared data after being offline too long
    this._recoveryRetryAt = 0;
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
      failures,
      bootstrapFailure: this.bootstrapFailure,
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
    // Before anything is flushed or pulled: a computer that was offline longer than the retention window
    // has missed events the Dashboard has since deleted, so its shared data is rebuilt from the snapshot.
    this._recoverIfStale();
    const isFreshDb = !this.db.getLastSyncTimestamp() && this.processedFiles.size === 0;
    if (isFreshDb && this.db.getUsers().length === 0) {
      this.restoreSharedSnapshot();
    } else if (isFreshDb) {
      // One-time upgrade path: a build that restored the Dashboard snapshot but
      // could not record an event cursor. After this launch a cursor exists, so
      // later launches replay events normally instead of skipping them.
      this.adoptSharedSnapshotCursor();
    }
    this.flushOutbox();

    // The caller needs the initial events as well.  The window may already
    // have loaded its cached rows while this synchronous catch-up is running;
    // without returning them, the renderer never receives a data-updated
    // notification because the next polling pass finds nothing new.
    const initialEvents = this.pull(isFreshDb);
    this._maybeCleanup();
    this.writeSharedSnapshot();
    return initialEvents;
  }

  startPolling(onUpdate, onStatusChange, onRecovered) {
    this.stopPolling();
    this.pollInterval = setInterval(() => {
      try {
        // A laptop that slept for weeks resumes inside the same process, so check on every pass, and before
        // flushing (which would count this computer's own new events as having read everything).
        if (this._recoverIfStale() && onRecovered) onRecovered(this.lastRecovery);
        this.flushOutbox();
        const previousFailureState = JSON.stringify(this.getFailureSummary());
        const appliedEvents = this.pull();
        if (appliedEvents.length > 0) this.writeSharedSnapshot();
        this._maybeCleanup();
        const failureSummary = this.getFailureSummary();
        if (JSON.stringify(failureSummary) !== previousFailureState && onStatusChange) onStatusChange(failureSummary);
        if (appliedEvents.length > 0 && onUpdate) onUpdate(appliedEvents);
      } catch (err) {
        console.error('Sync pull error:', err.message);
      }
    }, this.POLL_MS);
  }

  getRecoveryNotice() {
    return this.lastRecovery;
  }

  // True when the Dashboard has deleted event files this computer never read.
  _isStale() {
    const horizon = this._readHorizon();
    if (!horizon) return false;
    const frontier = this._frontier();
    if (!frontier) return false; // a new database restores through the normal first-run path
    return frontier < horizon;
  }

  _recoverIfStale() {
    if (this.source !== 'companion' || Date.now() < this._recoveryRetryAt) return false;
    let stale = false;
    try {
      stale = this._isStale();
    } catch (err) {
      this.logger?.warn('Could not check whether shared history was pruned', { error: err.message });
    }
    if (!stale) return false;

    const rebuilt = this._rebuildFromSnapshot();
    if (!rebuilt) this._recoveryRetryAt = Date.now() + 5 * 60 * 1000;
    return rebuilt;
  }

  // Replace the shared data with the Dashboard's latest snapshot, then put this computer's own unsent
  // changes back on top (they are re-applied, then published by the normal outbox flush). Private tasks,
  // sync metadata and the outbox are left alone.
  _rebuildFromSnapshot() {
    let snapshot;
    try {
      snapshot = JSON.parse(fs.readFileSync(this._snapshotPath(), 'utf8'));
    } catch (err) {
      this.logger?.warn('Cannot rebuild from the Dashboard snapshot: it could not be read', { error: err.message });
      return false;
    }

    const cursor = String(snapshot?.eventCursor || this._snapshotEventCursor(snapshot?.generatedAt));
    const horizon = this._readHorizon();
    if (horizon && cursor < horizon) {
      // The snapshot is older than the pruned history, so it cannot fill the gap.
      this.logger?.warn('Cannot rebuild: the Dashboard snapshot is older than the pruned event history');
      return false;
    }

    try {
      const unsent = typeof this.db.getQueuedSyncEvents === 'function'
        ? this.db.getQueuedSyncEvents(500).map((row) => row.event).filter(Boolean)
        : [];
      const imported = this.db.importSharedSnapshot(snapshot, { replaceExisting: true });
      if (!imported) return false;

      this._markSnapshotHistoryProcessed(cursor);
      let reapplied = 0;
      for (const event of unsent) {
        try {
          this.db.applyEvent(event);
          reapplied += 1;
        } catch (err) {
          this.logger?.warn('Could not re-apply a local change after rebuilding', { type: event?.type, error: err.message });
        }
      }

      this.lastRecovery = {
        at: new Date().toISOString(),
        snapshotGeneratedAt: snapshot.generatedAt,
        reappliedLocalChanges: reapplied,
      };
      this.logger?.info('Rebuilt shared data from the Dashboard snapshot after a long absence', this.lastRecovery);
      return true;
    } catch (err) {
      this.logger?.error('Rebuilding from the Dashboard snapshot failed', { error: err.message });
      return false;
    }
  }

  setUsername(username) {
    this.username = username || 'unknown';
  }

  setActor(actor) {
    this.setUsername(actor?.username || 'unknown');
    this.deviceTrust?.setActor(actor);
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
        .map((file) => {
          if (this.processedFiles.has(file)) return null;
          const filePath = path.join(this.eventsDir, file);
          let mtimeMs = 0;
          try {
            mtimeMs = fs.statSync(filePath).mtimeMs;
          } catch (_) {}
          const failure = this.failedFiles.get(file);
          if (failure && failure.nextRetryAt > now) return null;

          return { file, filePath, mtimeMs };
        })
        .filter(Boolean)
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

        this._applyAndMarkEvent(event, entry.file);
        appliedEvents.push(event);
      } catch (err) {
        // A file the Dashboard pruned between listing and reading is gone for good, not a failure to retry.
        if (err?.code === 'ENOENT') { this.failedFiles.delete(entry.file); continue; }
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
      const published = this.flushOutbox(event.eventId);
      if (published) this.writeSharedSnapshot();
      return published;
    } catch (err) {
      this.logger?.error('Sync outbox queue failed', { type, error: err.message });
      console.error('Error queueing sync event:', err.message);
      return false;
    }
  }

  _snapshotPath() { return path.join(this.snapshotsDir, 'dashboard-state.json'); }

  _snapshotEventCursor(timestamp) {
    return String(timestamp || new Date().toISOString()).replace(/[:.]/g, '-');
  }

  writeSharedSnapshot() {
    // Dashboard is the shared-state authority. MyTasks must never replace its
    // snapshot with a partial per-user cache.
    if (this.source !== 'scheduling' || typeof this.db.exportSharedSnapshot !== 'function') return false;
    try {
      const generatedAt = new Date().toISOString();
      const snapshot = {
        schemaVersion: 1,
        source: 'scheduling',
        generatedAt,
        // A restored snapshot already contains every event written before
        // this cursor. Replaying that older history can revive deleted rows
        // or fail on legacy event formats.
        eventCursor: this._snapshotEventCursor(generatedAt),
        tables: this.db.exportSharedSnapshot(),
      };
      const destination = this._snapshotPath();
      const temporary = `${destination}.${this.instanceId}.tmp`;
      fs.writeFileSync(temporary, JSON.stringify(snapshot), 'utf8');
      fs.renameSync(temporary, destination);
      return true;
    } catch (err) {
      this.logger?.warn('Shared snapshot write failed', { error: err.message });
      return false;
    }
  }

  restoreSharedSnapshot() {
    if (typeof this.db.importSharedSnapshot !== 'function') return false;
    const source = this._snapshotPath();
    if (!fs.existsSync(source)) {
      this.bootstrapFailure = 'No Dashboard recovery snapshot is available in the shared folder.';
      return false;
    }
    try {
      const snapshot = JSON.parse(fs.readFileSync(source, 'utf8'));
      const imported = this.db.importSharedSnapshot(snapshot);
      if (!imported || this.db.getUsers().length === 0) {
        this.bootstrapFailure = 'The Dashboard recovery snapshot contains no users.';
        return false;
      }
      this._markSnapshotHistoryProcessed(snapshot.eventCursor || this._snapshotEventCursor(snapshot.generatedAt));
      this.bootstrapFailure = null;
      return true;
    } catch (err) {
      this.bootstrapFailure = `Could not restore the Dashboard recovery snapshot: ${err.message}`;
      this.logger?.warn('Shared snapshot restore failed', { error: err.message });
      return false;
    }
  }

  // `markHistory` skips every event file at or before the snapshot cursor. That
  // is only safe when the local state was just built from that snapshot (the
  // one-time upgrade case). Events written afterwards must be replayed, because
  // merging rows can add and update them but can never delete.
  adoptSharedSnapshotCursor({ markHistory = true } = {}) {
    if (typeof this.db.matchesSharedSnapshot !== 'function' || typeof this.db.importSharedSnapshot !== 'function') return false;
    const source = this._snapshotPath();
    if (!fs.existsSync(source)) return false;
    try {
      const snapshot = JSON.parse(fs.readFileSync(source, 'utf8'));
      if (!this.db.matchesSharedSnapshot(snapshot)) {
        const outbox = this.db.getSyncOutboxSummary?.();
        // A snapshot is a recovery aid, not permission to discard a richer
        // local cache. A Dashboard snapshot can temporarily lag behind its
        // event stream; replacing local shared rows in that situation would
        // make scheduled assignments disappear. Merge missing rows instead,
        // retaining any local version newer than the snapshot. Private tasks,
        // sync metadata, and the outbox remain untouched as well.
        const reconciled = this.db.importSharedSnapshot(snapshot, { mergeExisting: true });
        if (!reconciled) {
          if (markHistory) this._markSnapshotHistoryProcessed(snapshot.eventCursor || this._snapshotEventCursor(snapshot.generatedAt));
          return false;
        }
        this.logger?.info('Reconciled Dashboard recovery snapshot with MyTasks shared cache', {
          snapshotGeneratedAt: snapshot.generatedAt,
          importedRows: reconciled,
          queuedLocalChanges: Number(outbox?.pending) || 0,
        });
        if (markHistory) this._markSnapshotHistoryProcessed(snapshot.eventCursor || this._snapshotEventCursor(snapshot.generatedAt));
        return true;
      }
      if (markHistory) this._markSnapshotHistoryProcessed(snapshot.eventCursor || this._snapshotEventCursor(snapshot.generatedAt));
      return markHistory;
    } catch (err) {
      this.logger?.warn('Could not adopt shared snapshot event cursor', { error: err.message });
      return false;
    }
  }

  // A Dashboard may republish its authoritative recovery snapshot after a
  // data repair even when no new append-only events exist. Expose a safe
  // refresh path so MyTasks' manual sync can adopt those missing shared rows
  // without requiring the user to close and reopen the application.
  // Event files are left alone here: any events newer than the snapshot, and
  // any deletions, still arrive through the normal pull. Returns true only when
  // rows were actually recovered.
  refreshSharedSnapshot() {
    return this.adoptSharedSnapshotCursor({ markHistory: false });
  }

  _markSnapshotHistoryProcessed(cursor) {
    if (!cursor) return 0;
    let marked = 0;
    try {
      for (const file of fs.readdirSync(this.eventsDir)) {
        if (!file.endsWith('.json') || file.slice(0, cursor.length) > cursor) continue;
        this._markFileProcessed(file);
        marked += 1;
      }
    } catch (err) {
      this.logger?.warn('Could not establish snapshot event cursor', { error: err.message });
    }
    // Old events may all have been pruned, leaving no file to mark. Record the cursor itself as how far
    // this computer has read, so the next launch does not treat the database as new.
    const frontier = this._frontier();
    if ((!frontier || cursor > frontier) && typeof this.db.setLastSyncTimestamp === 'function') {
      this.db.setLastSyncTimestamp(cursor);
    }
    return marked;
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
   * Housekeeping for the shared event history (at start-up and every 12 hours).
   *
   * Event files would otherwise pile up in the shared folder forever. Only the Dashboard deletes them, and
   * only a file that is all of: older than RETENTION_DAYS, older than the event cursor of the Dashboard's
   * latest recovery snapshot (so the snapshot already holds its effect), and already applied here.
   * Before deleting, it records the newest file it is about to remove in snapshots/event-horizon.json.
   * A computer whose own history ends before that point has missed events and rebuilds from the snapshot
   * (see _recoverIfStale in MyTasks). Every app also forgets its local "processed" records for event files
   * that no longer exist. Returns the number of event files deleted.
   */
  cleanup() {
    let removed = 0;
    try {
      if (this.source === 'scheduling') removed = this._pruneEventHistory();
      this._forgetMissingProcessedFiles();
    } catch (err) {
      this.logger?.warn('Sync history cleanup failed', { error: err.message });
    }
    return removed;
  }

  _horizonPath() { return path.join(this.snapshotsDir, 'event-horizon.json'); }

  // Event files are named <ISO timestamp with : and . as dashes>_<user>_<type>_<id>.json.
  _eventStamp(file) {
    const match = /^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)_/.exec(file);
    return match ? match[1] : null;
  }

  _windowStart() {
    return this._snapshotEventCursor(new Date(Date.now() - this.RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString());
  }

  _readSnapshotCursor() {
    try {
      const snapshot = JSON.parse(fs.readFileSync(this._snapshotPath(), 'utf8'));
      if (snapshot?.schemaVersion !== 1 || !Number.isFinite(Date.parse(snapshot.generatedAt || ''))) return null;
      return String(snapshot.eventCursor || this._snapshotEventCursor(snapshot.generatedAt));
    } catch (_) {
      return null;
    }
  }

  _readHorizon() {
    try {
      const stat = fs.statSync(this._horizonPath());
      if (this._horizonCache.mtimeMs === stat.mtimeMs) return this._horizonCache.value;
      const parsed = JSON.parse(fs.readFileSync(this._horizonPath(), 'utf8'));
      const value = parsed?.schemaVersion === 1 && typeof parsed.prunedThrough === 'string' ? parsed.prunedThrough : null;
      this._horizonCache = { mtimeMs: stat.mtimeMs, value };
      return value;
    } catch (_) {
      this._horizonCache = { mtimeMs: -1, value: null };
      return null;
    }
  }

  _writeHorizon(prunedThrough) {
    try {
      const existing = this._readHorizon();
      const value = existing && existing > prunedThrough ? existing : prunedThrough;
      const destination = this._horizonPath();
      const temporary = `${destination}.${this.instanceId}.tmp`;
      fs.writeFileSync(temporary, JSON.stringify({
        schemaVersion: 1,
        prunedThrough: value,
        retentionDays: this.RETENTION_DAYS,
        updatedAt: new Date().toISOString(),
      }), 'utf8');
      fs.renameSync(temporary, destination);
      this._horizonCache = { mtimeMs: -1, value: null };
      return true;
    } catch (err) {
      this.logger?.warn('Could not record the event horizon; leaving event history in place', { error: err.message });
      return false;
    }
  }

  _pruneEventHistory() {
    const cursor = this._readSnapshotCursor();
    if (!cursor) return 0; // no usable recovery snapshot: keep everything

    this._ensureProcessedFilesLoaded();
    const window = this._windowStart();
    const cutoff = cursor < window ? cursor : window;
    let files;
    try {
      files = fs.readdirSync(this.eventsDir);
    } catch (_) {
      return 0;
    }

    const expired = files.filter((file) => {
      const stamp = this._eventStamp(file);
      return stamp && file.endsWith('.json') && stamp < cutoff
        && this.processedFiles.has(file) && !this.failedFiles.has(file);
    }).sort();
    if (expired.length === 0) return 0;

    // Publish the horizon first, so no computer can see the files gone before it knows they were pruned.
    if (!this._writeHorizon(expired[expired.length - 1])) return 0;

    let removed = 0;
    for (const file of expired) {
      try {
        fs.unlinkSync(path.join(this.eventsDir, file));
        removed += 1;
      } catch (_) {}
    }
    if (removed > 0) this.logger?.info('Pruned shared event history', { removed, olderThan: cutoff });
    return removed;
  }

  _forgetMissingProcessedFiles() {
    if (!this.processedFilesLoaded) return 0;
    let present;
    try {
      present = new Set(fs.readdirSync(this.eventsDir));
    } catch (_) {
      return 0;
    }

    const windowStart = this._windowStart();
    const anchor = this._frontier(); // always keep the newest record: it marks how far this computer has read
    const gone = [];
    for (const file of this.processedFiles) {
      if (present.has(file) || file === anchor) continue;
      const stamp = this._eventStamp(file);
      if (stamp && stamp < windowStart) gone.push(file);
    }
    if (gone.length === 0) return 0;

    if (typeof this.db.forgetProcessedSyncFiles === 'function') this.db.forgetProcessedSyncFiles(gone);
    for (const file of gone) this.processedFiles.delete(file);
    return gone.length;
  }

  // The newest event this computer has read. Own writes count too, so check staleness before flushing.
  _noteProcessed(filename) {
    if (filename && (this._maxProcessed === null || filename > this._maxProcessed)) this._maxProcessed = filename;
  }

  _frontier() {
    let best = this._maxProcessed;
    const last = typeof this.db.getLastSyncTimestamp === 'function' ? this.db.getLastSyncTimestamp() : null;
    if (last && (best === null || last > best)) best = last;
    return best;
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

  _ensureProcessedFilesLoaded() {
    if (this.processedFilesLoaded) return;

    for (const filename of this.db.getProcessedSyncFiles()) {
      this.processedFiles.add(filename);
      this._noteProcessed(filename);
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
          this._noteProcessed(file);
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
    this._noteProcessed(filename);
    this.failedFiles.delete(filename);
  }

  _applyAndMarkEvent(event, filename) {
    if (typeof this.db.applyEventAndMarkProcessed === 'function') {
      this.db.applyEventAndMarkProcessed(event, filename);
    } else {
      this.db.applyEvent(event);
      this.db.markSyncFileProcessed(filename);
      this.db.setLastSyncTimestamp(filename);
    }
    this.processedFiles.add(filename);
    this._noteProcessed(filename);
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
