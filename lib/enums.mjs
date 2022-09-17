export const Header = {
  CLIENT: 'MDPC01',
  WORKER: 'MDPW01',
};

export const Message = {
  READY: '\x01',
  REQUEST: '\x02',
  REPLY: '\x03',
  HEARTBEAT: '\x04',
  DISCONNECT: '\x05',
};

export const ResponseStatus = {
  RESP_OK: '\x01',
  RESP_ERR: '\x02',
};
