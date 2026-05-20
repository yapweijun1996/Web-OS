// SSOT for the string vocabularies that cross module / channel boundaries.
//
// A producer and a consumer sit on opposite ends of a bus or MessageChannel
// and must agree on the exact string. Importing the name from here turns a
// typo into a load-time reference error instead of a silent disconnect.

// Names emitted on the kernel SystemEventBus (see agent-core.js).
export const SystemEvents = Object.freeze({
  APP_LAUNCH: 'app:launch',
  FILE_OPEN: 'file:open',
  COMMAND_SEND: 'command:send'
});

// Action / type fields on the host <-> sandboxed-plugin MessageChannel
// (see host-core.js). INIT_PORT travels on `type`; the rest on `action`.
export const IpcActions = Object.freeze({
  INIT_PORT: 'INIT_PORT',
  FS_WRITE: 'fs:write',
  FS_READ: 'fs:read',
  SYSTEM_NOTIFY: 'system:notify',
  KB_READ: 'kb:read',
  KB_WRITE: 'kb:write'
});
