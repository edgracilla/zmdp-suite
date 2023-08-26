// eslint-disable-next-line import/no-extraneous-dependencies
import pino from 'pino';
import { Broker } from '../index.mjs';

const conf = {
  transport: {
    target: 'pino-pretty',
    options: { translateTime: true },
  },
};

const svcConf = {
  verbose: 1,
  heartbeatLiveness: 3,
  heartbeatInterval: 3000,
  workerRequestTimeout: 5000,
  logger: pino(conf),
};

const broker = new Broker('tcp://127.0.0.1:4000', svcConf);

broker.listen();
