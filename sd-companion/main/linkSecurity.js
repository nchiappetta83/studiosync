const ALLOWED_EXTERNAL_PROTOCOLS = new Set(['http', 'https', 'mailto']);

function getExternalTargetAction(rawValue) {
  const target = String(rawValue || '').trim();
  if (!target) return { success: false, error: 'No link provided.' };

  const isWindowsPath = /^[a-zA-Z]:[\\/]/.test(target) || /^\\\\/.test(target);
  const protocolMatch = target.match(/^([a-zA-Z][a-zA-Z\d+\-.]*):/);
  const protocol = protocolMatch ? protocolMatch[1].toLowerCase() : null;

  if (!isWindowsPath && protocol) {
    if (!ALLOWED_EXTERNAL_PROTOCOLS.has(protocol)) {
      return { success: false, error: `Links with the "${protocol}:" protocol are not allowed.` };
    }
    return { success: true, action: 'openExternal', target, protocol };
  }

  return { success: true, action: 'openPath', target, protocol: null };
}

module.exports = {
  ALLOWED_EXTERNAL_PROTOCOLS,
  getExternalTargetAction,
};
