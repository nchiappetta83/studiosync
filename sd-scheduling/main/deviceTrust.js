const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function stableEvent(event) {
  const { signature, ...unsigned } = event || {};
  return JSON.stringify(unsigned);
}

class DeviceTrust {
  constructor({ appDataDir, sharedDrivePath, source, logger = null }) {
    this.appDataDir = appDataDir;
    this.sharedDrivePath = sharedDrivePath;
    this.source = source;
    this.logger = logger;
    this.actor = null;
    this.identity = this._loadIdentity();
  }

  _loadIdentity() {
    const filePath = path.join(this.appDataDir, 'device-identity.json');
    try {
      const existing = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (existing.deviceId && existing.privateKey && existing.publicKey) return existing;
    } catch (_) {}
    const keys = crypto.generateKeyPairSync('ed25519');
    const identity = {
      deviceId: crypto.randomUUID(),
      privateKey: keys.privateKey.export({ type: 'pkcs8', format: 'pem' }),
      publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }),
      createdAt: new Date().toISOString(),
    };
    fs.mkdirSync(this.appDataDir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(identity, null, 2), 'utf8');
    return identity;
  }

  _registryPath() { return path.join(this.sharedDrivePath, 'trusted-devices.json'); }
  _enrollmentDir() { return path.join(this.sharedDrivePath, 'device-enrollments'); }
  _sign(value) { return crypto.sign(null, Buffer.from(value), this.identity.privateKey).toString('base64'); }
  _verify(value, signature, publicKey) { return crypto.verify(null, Buffer.from(value), publicKey, Buffer.from(signature, 'base64')); }

  _readRegistry() {
    try {
      const registry = JSON.parse(fs.readFileSync(this._registryPath(), 'utf8'));
      const { signature, ...unsigned } = registry;
      if (!registry.authorityPublicKey || !signature || !this._verify(JSON.stringify(unsigned), signature, registry.authorityPublicKey)) return null;
      return registry;
    } catch (_) { return null; }
  }

  _writeRegistry(registry) {
    if (registry.authorityPublicKey && registry.authorityPublicKey !== this.identity.publicKey) {
      throw new Error('This Dashboard installation is not the trusted-device authority. Restore the Dashboard data backup that contains the authority key.');
    }
    const unsigned = { ...registry, updatedAt: new Date().toISOString() };
    delete unsigned.signature;
    const payload = { ...unsigned, signature: this._sign(JSON.stringify(unsigned)) };
    const target = this._registryPath();
    const temporary = `${target}.${this.identity.deviceId}.tmp`;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(temporary, JSON.stringify(payload, null, 2), 'utf8');
    fs.renameSync(temporary, target);
    return payload;
  }

  setActor(actor) {
    this.actor = actor || null;
    if (!this.actor) return;
    if (this.source === 'scheduling' && (this.actor.role === 'partner' || this.actor.is_admin === 1)) {
      const registry = this._readRegistry() || {
        schemaVersion: 1, authorityPublicKey: this.identity.publicKey, enforceSignedEvents: false, devices: [],
      };
      if (registry.authorityPublicKey !== this.identity.publicKey) {
        this.logger?.warn('Trusted-device authority is owned by another Dashboard installation');
        return;
      }
      if (!registry.devices.some((device) => device.deviceId === this.identity.deviceId)) {
        registry.devices.push({ deviceId: this.identity.deviceId, userId: this.actor.id, username: this.actor.username, publicKey: this.identity.publicKey, approvedAt: new Date().toISOString(), active: true });
        this._writeRegistry(registry);
      }
    } else if (this.source === 'companion') {
      this.requestEnrollment();
    }
  }

  requestEnrollment() {
    if (!this.actor) return false;
    const registry = this._readRegistry();
    if (registry?.devices?.some((device) => device.deviceId === this.identity.deviceId && device.active)) return true;
    try {
      fs.mkdirSync(this._enrollmentDir(), { recursive: true });
      const request = {
        deviceId: this.identity.deviceId, userId: this.actor.id, username: this.actor.username,
        publicKey: this.identity.publicKey, requestedAt: new Date().toISOString(), source: this.source,
      };
      const target = path.join(this._enrollmentDir(), `${this.identity.deviceId}.json`);
      fs.writeFileSync(target, JSON.stringify({ ...request, signature: this._sign(JSON.stringify(request)) }, null, 2), 'utf8');
      return true;
    } catch (error) { this.logger?.warn('Device enrollment request failed', { error: error.message }); return false; }
  }

  getStatus() {
    const registry = this._readRegistry();
    const device = registry?.devices?.find((item) => item.deviceId === this.identity.deviceId) || null;
    return { deviceId: this.identity.deviceId, enrolled: Boolean(device?.active), enforceSignedEvents: Boolean(registry?.enforceSignedEvents), pendingEnrollment: Boolean(this.actor && !device), userId: this.actor?.id || null };
  }

  getPendingEnrollments() {
    if (this.source !== 'scheduling') return [];
    try {
      return fs.readdirSync(this._enrollmentDir()).filter((name) => name.endsWith('.json')).map((name) => {
        const payload = JSON.parse(fs.readFileSync(path.join(this._enrollmentDir(), name), 'utf8'));
        const { signature, ...request } = payload;
        return this._verify(JSON.stringify(request), signature, request.publicKey) ? request : null;
      }).filter(Boolean);
    } catch (_) { return []; }
  }

  getTrustedDevices() {
    return this._readRegistry()?.devices || [];
  }

  approveEnrollment(deviceId) {
    const request = this.getPendingEnrollments().find((item) => item.deviceId === deviceId);
    if (!request) return false;
    const registry = this._readRegistry();
    if (!registry) throw new Error('Trusted-device registry is unavailable or invalid.');
    registry.devices = registry.devices.filter((device) => device.deviceId !== request.deviceId);
    registry.devices.push({ ...request, approvedAt: new Date().toISOString(), active: true });
    this._writeRegistry(registry);
    try { fs.unlinkSync(path.join(this._enrollmentDir(), `${deviceId}.json`)); } catch (_) {}
    return true;
  }

  revokeDevice(deviceId) {
    const registry = this._readRegistry();
    if (!registry) return false;
    const device = registry.devices.find((item) => item.deviceId === deviceId);
    if (!device) return false;
    device.active = false;
    device.revokedAt = new Date().toISOString();
    this._writeRegistry(registry);
    return true;
  }

  setEnforcement(enabled) {
    const registry = this._readRegistry();
    if (!registry) throw new Error('Trusted-device registry is unavailable or invalid.');
    registry.enforceSignedEvents = Boolean(enabled);
    this._writeRegistry(registry);
    return registry.enforceSignedEvents;
  }

  signEvent(event) {
    const status = this.getStatus();
    if (!status.enrolled) return event;
    return { ...event, signature: { deviceId: this.identity.deviceId, value: this._sign(stableEvent(event)) } };
  }

  verifyEvent(event) {
    const registry = this._readRegistry();
    if (!event.signature) return registry?.enforceSignedEvents ? { valid: false, error: 'Unsigned event rejected by trusted-device policy.' } : { valid: true };
    const device = registry?.devices?.find((item) => item.deviceId === event.signature.deviceId && item.active);
    if (!device || !this._verify(stableEvent(event), event.signature.value, device.publicKey)) return { valid: false, error: 'Event signature is invalid or the device is not trusted.' };
    return { valid: true };
  }
}

module.exports = DeviceTrust;
