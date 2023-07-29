import Worker from '../lib/Worker.mjs';

const conf = {
  service: 'tu-identity-api',
  address: 'tcp://127.0.0.1:4000',
  heartbeatLiveness: 3,
  heartbeatInterval: 5000,

  protoSrc: './tests/zproto',
};

const worker = new Worker(conf);

const access = {
  create() {
    return `createFn: ${this.x}`;
  },
  read: async () => ({
    _id: 'test',
    user: 'user',
    role: 'role',
    merchant: 'merchant',
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

  await worker.start();
};

main();
