import ProtoCoder from 'zmdp-protocoder';
import Worker from '../lib/Worker.mjs';

const zpc = new ProtoCoder('./tests/zproto');

const conf = {
  service: 'tu-identity-api',
  address: 'tcp://127.0.0.1:4000',
  heartbeatLiveness: 3,
  heartbeatInterval: 3000,
};

const worker = new Worker(conf);

// --

const access = {
  x: 12,
  create() {
    return `createFn: ${this.x}`;
  },
  read: (_id, meta) => ({
    _id,
    user: meta?._user._id,
    role: 'c',
    merchant: 'd',
  }),
  _update: (_id, data, meta) => `updateFn: ${typeof _id} ${typeof data} ${typeof meta}`,
  get update() {
    return this._update;
  },
  set update(value) {
    this._update = value;
  },
  delete: (_id, meta) => `deleteFn: ${_id} ${meta}`,
};

// --

const main = async () => {
  const mod = 'access';

  worker.exposeFn(mod, access.create.bind(access));
  worker.exposeFn(mod, access.read.bind(access));
  // worker.exposeFn(mod, module.update)
  // worker.exposeFn(mod, module.delete)

  worker.setParamDecoder(zpc.paramDecode.bind(zpc));
  worker.setResultEncoder(zpc.resultEncode.bind(zpc));

  await worker.start();
};

main();
