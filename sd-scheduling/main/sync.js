const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

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
  }

  initialize() {
    // Create shared directories if they don't exist
    fs.mkdirSync(this.eventsDir, { recursive: true });
    fs.mkdirSync(this.snapshotsDir, { recursive: true });

    // On a fresh DB (no sync cursor), pull ALL events including our own
    // so that a deleted/recreated local DB can recover from shared state
    const lastSync = this.db.getLastSyncTimestamp();
    this.pull(!lastSync);
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
    const lastSync = this.db.getLastSyncTimestamp();
    let files;

    try {
      files = fs.readdirSync(this.eventsDir)
        .filter(f => f.endsWith('.json'))
        .sort();
    } catch (err) {
      console.error('Cannot read events directory:', err.message);
      return [];
    }

    // Filter to only events newer than our last sync
    const newFiles = lastSync
      ? files.filter(f => f > lastSync)
      : files;

    if (newFiles.length === 0) return [];

    const appliedEvents = [];

    for (const file of newFiles) {
      try {
        const filePath = path.join(this.eventsDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const event = JSON.parse(content);

        // Skip events created by this exact app instance — they were already
        // applied locally before being written to the shared drive.
        if (!includeOwnEvents && event.instanceId && event.instanceId === this.instanceId) {
          continue;
        }

        this.db.applyEvent(event);
        appliedEvents.push(event);
      } catch (err) {
        console.error(`Error processing event ${file}:`, err.message);
      }
    }

    // Update our sync cursor to the last file we processed
    const lastFile = newFiles[newFiles.length - 1];
    this.db.setLastSyncTimestamp(lastFile);

    return appliedEvents;
  }

  /**
   * Push a new event to the shared drive.
   * The event is already applied locally before this is called.
   */
  pushEvent(type, data) {
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

    try {
      const filePath = path.join(this.eventsDir, filename);
      fs.writeFileSync(filePath, JSON.stringify(event, null, 2), 'utf-8');

      // Update our own sync cursor past this file
      this.db.setLastSyncTimestamp(filename);
    } catch (err) {
      console.error('Error pushing event:', err.message);
      // Event was already applied locally, so the user won't lose their change.
      // Other users just won't see it until the network drive is accessible again.
    }
  }

  /**
   * Clean up old event files (older than 7 days).
   * Called periodically or on app startup by a partner.
   */
  cleanup(daysOld = 30) {
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - daysOld);
      const cutoffStr = cutoff.toISOString().replace(/[:.]/g, '-');

      let removed = 0;
      removed += this._cleanupDirectory(this.eventsDir, cutoffStr);
      removed += this._cleanupDirectory(this.snapshotsDir, cutoffStr);

      if (removed > 0) {
        console.log(`Sync cleanup: removed ${removed} old sync file(s)`);
      }
    } catch (err) {
      console.error('Sync cleanup error:', err.message);
    }
  }

  _maybeCleanup() {
    const now = Date.now();
    if (now - this.lastCleanupAt < this.CLEANUP_MS) return;
    this.lastCleanupAt = now;
    this.cleanup();
  }

  _cleanupDirectory(dirPath, cutoffStr) {
    if (!fs.existsSync(dirPath)) return 0;

    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.json'));
    let removed = 0;

    for (const file of files) {
      if (file < cutoffStr) {
        fs.unlinkSync(path.join(dirPath, file));
        removed++;
      }
    }

    return removed;
  }
}

module.exports = SyncEngine;
