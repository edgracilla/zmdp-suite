/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable no-console */

import ProtoCoder from 'zmdp-protocoder';
import Client from '../lib/Client.mjs';

const zpc = new ProtoCoder('./tests/zproto');

const client = new Client({
  address: 'tcp://127.0.0.1:4000',
  timeout: 1000 * 15,
});

const mod = 'access';
const svc = 'tu-identity-api';

const payload = {
  _id: 'tester-tester',
  meta: {
    _perm: { readOwned: false },
    _access: { _id: 'accessId' },
    _user: { _id: 'userId', name: 'userName' },
  },
};

const main = async () => {
  const buf = await zpc.paramEncode(mod, 'read', payload);
  const resp = await client.sendRcv(svc, mod, 'read', buf);

  if (resp) {
    const { result } = await zpc.resultDecode(mod, 'read', resp);
    console.log('--a', result);
  }
};

setInterval(main, 1000);
// main();
