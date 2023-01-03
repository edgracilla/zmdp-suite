/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable no-console */

import Client from '../lib/Client.mjs';

const client = new Client({
  address: 'tcp://127.0.0.1:4000',
  timeout: 1000 * 15,

  targetSvcModule: 'access',
  targetSvcName: 'tu-identity-api',
  protoSrc: './tests/zproto',
});

const _id = 'tester-tester';
const meta = {
  _perm: { readOwned: false },
  _access: { _id: 'accessId' },
  _user: { _id: 'userId', name: 'userName' },
};

const main = async () => {
  const resp = await client.sendRcvProto('read', { _id, meta });
  console.log('--a', resp);
};

setInterval(main, 1000);
// main();
