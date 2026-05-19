const PRIORITY_NONE = 0;
const PRIORITY_WAIT = -1;
const PRIORITY_CUSTOM = -2;
const CUSTOM_PRIORITY_PREFIX = 'cp:';

function buildCustomPriorityLabel(label) {
  return `${CUSTOM_PRIORITY_PREFIX}${label}`;
}

function getCustomPriorityLabel(priorityLabel) {
  const value = String(priorityLabel || '');
  return value.startsWith(CUSTOM_PRIORITY_PREFIX)
    ? value.slice(CUSTOM_PRIORITY_PREFIX.length)
    : value;
}

module.exports = {
  PRIORITY_NONE,
  PRIORITY_WAIT,
  PRIORITY_CUSTOM,
  CUSTOM_PRIORITY_PREFIX,
  buildCustomPriorityLabel,
  getCustomPriorityLabel,
};
