const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const unsigned = (event) => {
  const { signature, ...value } = event || {};
  return JSON.stringify(value);
};

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
    const file = path.join(this.appDataDir, 'device-identity.json');
    try { const value = JSON.parse(fs.readFileSync(file, 'utf8')); if (value.deviceId && value.privateKey && value.publicKey) return value; } catch (_) {}
    const keys = crypto.generateKeyPairSync('ed25519');
    const value = { deviceId: crypto.randomUUID(), privateKey: keys.privateKey.export({ type: 'pkcs8', format: 'pem' }), publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }), createdAt: new Date().toISOString() };
    fs.mkdirSync(this.appDataDir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
    return value;
  }

  _registryPath() { return path.join(this.sharedDrivePath, 'trusted-devices.json'); }
  _enrollmentDir() { return path.join(this.sharedDrivePath, 'device-enrollments'); }
  _sign(value) { return crypto.sign(null, Buffer.from(value), this.identity.privateKey).toString('base64'); }
  _verify(value, signature, publicKey) { return crypto.verify(null, Buffer.from(value), publicKey, Buffer.from(signature, 'base64')); }

  _registry() {
    try {
      const value = JSON.parse(fs.readFileSync(this._registryPath(), 'utf8'));
      const { signature, ...body } = value;
      return value.authorityPublicKey && signature && this._verify(JSON.stringify(body), signature, value.authorityPublicKey) ? value : null;
    } catch (_) { return null; }
  }

  setActor(actor) {
    this.actor = actor || null;
    if (this.actor && this.source === 'companion') this.requestEnrollment();
  }

  requestEnrollment() {
    if (!this.actor) return false;
    const registry = this._registry();
    if (registry?.devices?.some((device) => device.deviceId === this.identity.deviceId && device.active)) return true;
    try {
      fs.mkdirSync(this._enrollmentDir(), { recursive: true });
      const request = { deviceId: this.identity.deviceId, userId: this.actor.id, username: this.actor.username, publicKey: this.identity.publicKey, requestedAt: new Date().toISOString(), source: this.source };
      fs.writeFileSync(path.join(this._enrollmentDir(), `${this.identity.deviceId}.json`), JSON.stringify({ ...request, signature: this._sign(JSON.stringify(request)) }, null, 2), 'utf8');
      return true;
    } catch (error) { this.logger?.warn('Device enrollment request failed', { error: error.message }); return false; }
  }

  getStatus() {
    const registry = this._registry();
    const device = registry?.devices?.find((item) => item.deviceId === this.identity.deviceId);
    return { deviceId: this.identity.deviceId, enrolled: Boolean(device?.active), enforceSignedEvents: Boolean(registry?.enforceSignedEvents), pendingEnrollment: Boolean(this.actor && !device), userId: this.actor?.id || null };
  }

  signEvent(event) { return this.getStatus().enrolled ? { ...event, signature: { deviceId: this.identity.deviceId, value: this._sign(unsigned(event)) } } : event; }

  verifyEvent(event) {
    const registry = this._registry();
    if (!event.signature) return registry?.enforceSignedEvents ? { valid: false, error: 'Unsigned event rejected by trusted-device policy.' } : { valid: true };
    const device = registry?.devices?.find((item) => item.deviceId === event.signature.deviceId && item.active);
    return device && this._verify(unsigned(event), event.signature.value, device.publicKey)
      ? { valid: true }
      : { valid: false, error: 'Event signature is invalid or the device is not trusted.' };
  }
}

module.exports = DeviceTrust;
