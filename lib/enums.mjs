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
  RESP_OK: '0',
  RESP_ERR: '1',
  RESP_NO_WORKER: '2',
};
