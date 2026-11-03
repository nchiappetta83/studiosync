const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseVersion(version) {
  const match = String(version || '').trim().match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  if (!match) return null;
  return match.slice(1, 4).map(Number);
}

function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) return 0;

  for (let i = 0; i < 3; i++) {
    if (a[i] > b[i]) return 1;
    if (a[i] < b[i]) return -1;
  }

  return 0;
}

class UpdateManager {
  constructor(options) {
    this.app = options.app;
    this.dialog = options.dialog;
    this.loadConfig = options.loadConfig;
    this.saveConfig = options.saveConfig;
    this.getDb = options.getDb;
    this.getMainWindow = options.getMainWindow;
    this.appKey = options.appKey;
    this.productName = options.productName;
    this.installerBaseName = options.installerBaseName;
    this.onPrompt = options.onPrompt || null;
    this.timer = null;
    this.lastResult = null;
    this.pendingPrompt = null;
    this.sessionPromptedVersion = null;
    this.CHECK_INTERVAL_MS = 30 * 60 * 1000;
  }

  start() {
    this.stop();
    this.timer = setInterval(() => {
      this.checkForUpdates({ promptIfAvailable: true }).catch((err) => {
        console.error('Automatic update check failed:', err.message);
      });
    }, this.CHECK_INTERVAL_MS);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  clearDismissedVersion() {
    const config = this.loadConfig() || {};
    delete config[this._dismissedConfigKey()];
    this.saveConfig(config);
    this.sessionPromptedVersion = null;
  }

  getPendingPrompt() {
    return this.pendingPrompt;
  }

  getLastResult() {
    return this.lastResult;
  }

  clearPendingPrompt() {
    this.pendingPrompt = null;
  }

  dismissVersion(version = this.pendingPrompt?.latestVersion || this.lastResult?.latestVersion) {
    if (!version) return false;

    const config = this.loadConfig() || {};
    config[this._dismissedConfigKey()] = version;
    this.saveConfig(config);
    this.pendingPrompt = null;
    return true;
  }

  async checkForUpdates(options = {}) {
    const {
      manual = false,
      promptIfAvailable = false,
      showUpToDateMessage = manual,
      forcePrompt = false,
    } = options;

    const result = this._scanForUpdate();
    this.lastResult = result;

    if (!result.configured && manual) {
      await this.dialog.showMessageBox(this.getMainWindow() || undefined, {
        type: 'info',
        buttons: ['OK'],
        message: 'Update Folder Not Configured',
        detail: 'The Scheduling app has not published a global update folder yet.',
      });
      return result;
    }

    if (result.error && manual) {
      await this.dialog.showMessageBox(this.getMainWindow() || undefined, {
        type: 'error',
        buttons: ['OK'],
        message: 'Unable to Check for Updates',
        detail: result.error,
      });
      return result;
    }

    if (result.updateAvailable && promptIfAvailable) {
      await this._promptForUpdate(result, { manual, forcePrompt });
    } else if (!result.updateAvailable && showUpToDateMessage && !result.error) {
      await this.dialog.showMessageBox(this.getMainWindow() || undefined, {
        type: 'info',
        buttons: ['OK'],
        message: "You're Up to Date",
        detail: `${this.productName} ${result.currentVersion} is the newest version available.`,
      });
    }

    return result;
  }

  async installUpdate(result = this.lastResult) {
    if (!result?.updateAvailable || !result.installerPath) {
      return { success: false, error: 'No update installer is available.' };
    }

    this.pendingPrompt = null;

    const tempDir = path.join(this.app.getPath('temp'), 'sd-updates', this.appKey);
    fs.mkdirSync(tempDir, { recursive: true });

    const installerName = path.basename(result.installerPath);
    const localInstallerPath = path.join(tempDir, installerName);
    fs.copyFileSync(result.installerPath, localInstallerPath);

    const child = spawn(localInstallerPath, [], {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    });
    child.unref();

    setTimeout(() => this.app.quit(), 300);
    return { success: true, path: localInstallerPath };
  }

  async handleSyncEvents(events = []) {
    if (!Array.isArray(events) || events.length === 0) return;
    if (!events.some(event => event.type === 'setting-updated' && event.data?.key === 'update_folder_path')) return;

    this.clearDismissedVersion();
    await this.checkForUpdates({ promptIfAvailable: true, forcePrompt: true });
  }

  _scanForUpdate() {
    const db = this.getDb();
    const currentVersion = this.app.getVersion();
    const folderPath = db?.getUpdateFolderPath?.() || null;

    const result = {
      appKey: this.appKey,
      currentVersion,
      configured: Boolean(folderPath),
      folderPath,
      updateAvailable: false,
      latestVersion: null,
      installerName: null,
      installerPath: null,
      error: null,
      checkedAt: new Date().toISOString(),
    };

    if (!folderPath) {
      return result;
    }

    try {
      const latestInstaller = this._findLatestInstaller(folderPath);
      if (!latestInstaller) {
        result.error = `No ${this.installerBaseName} installer was found in the update folder.`;
        return result;
      }

      result.latestVersion = latestInstaller.version;
      result.installerName = latestInstaller.fileName;
      result.installerPath = latestInstaller.filePath;
      result.updateAvailable = compareVersions(latestInstaller.version, currentVersion) > 0;
      return result;
    } catch (err) {
      result.error = err.message;
      return result;
    }
  }

  _findLatestInstaller(folderPath) {
    if (!fs.existsSync(folderPath)) {
      throw new Error('The configured update folder is no longer available.');
    }

    const matcher = new RegExp(`^${escapeRegex(this.installerBaseName)}\\s+v?(\\d+\\.\\d+\\.\\d+)\\.exe$`, 'i');
    const files = fs.readdirSync(folderPath);
    let latest = null;

    for (const fileName of files) {
      const match = fileName.match(matcher);
      if (!match) continue;

      const version = match[1];
      if (!latest || compareVersions(version, latest.version) > 0) {
        latest = {
          version,
          fileName,
          filePath: path.join(folderPath, fileName),
        };
      }
    }

    return latest;
  }

  async _promptForUpdate(result, options = {}) {
    const dismissedVersion = (this.loadConfig() || {})[this._dismissedConfigKey()];
    const alreadyPrompted = this.sessionPromptedVersion === result.latestVersion;

    if (!options.forcePrompt && (dismissedVersion === result.latestVersion || alreadyPrompted)) {
      return;
    }

    this.sessionPromptedVersion = result.latestVersion;
    this.pendingPrompt = result;

    if (this.onPrompt) {
      this.onPrompt(result);
      return;
    }

    const response = await this.dialog.showMessageBox(this.getMainWindow() || undefined, {
      type: 'info',
      buttons: ['Install Update', 'Later'],
      defaultId: 0,
      cancelId: 1,
      message: `${this.productName} ${result.latestVersion} is available`,
      detail: `Current version: ${result.currentVersion}\nUpdate installer: ${result.installerName}\n\nInstall the update now?`,
    });

    if (response.response === 0) {
      try {
        await this.installUpdate(result);
      } catch (err) {
        await this.dialog.showMessageBox(this.getMainWindow() || undefined, {
          type: 'error',
          buttons: ['OK'],
          message: 'Unable to Launch Installer',
          detail: err.message,
        });
      }
      return;
    }

    this.dismissVersion(result.latestVersion);
  }

  _dismissedConfigKey() {
    return `dismissed_update_${this.appKey}`;
  }
}

module.exports = UpdateManager;
