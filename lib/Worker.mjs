/* eslint-disable security/detect-object-injection */

import ProtoCoder from 'zmdp-protocoder';

import { Dealer } from 'zeromq';
import { Header, Message, ResponseStatus } from './enums.mjs';

const { WORKER } = Header;
const { RESP_OK, RESP_ERR } = ResponseStatus;
const { READY, REPLY, DISCONNECT, HEARTBEAT, REQUEST } = Message;

export default class Worker {
  constructor(config) {
    this.address = config.address;
    this.svcName = config.service;

    this.stopInitiated = false;
    this.logger = config.logger || console;
    this.liveness = config.heartbeatLiveness || 3;
    this.heartbeatLiveness = config.heartbeatLiveness || 3;
    this.heartbeatInterval = config.heartbeatInterval || 5000;

    this.socket = new Dealer();
    this.actions = new Map();
    this.anchorExits();

    // -- protobuf support

    this._paramDecoder = async () => {};
    this._resultEncoder = async () => {};

    if (config.protoSrc) {
      this.zpc = new ProtoCoder(config.protoSrc);
      this.zpc.loadProtos();

      this._paramDecoder = this.zpc.paramDecode.bind(this.zpc);
      this._resultEncoder = this.zpc.resultEncode.bind(this.zpc);
    }
  }

  async start(recon = false) {
    if (!this.actions.size) {
      throw new Error('Atleast one (1) worker action is required.');
    }

    this.socket = new Dealer({ linger: 1 });
    this.liveness = this.heartbeatLiveness;

    await this.socket.connect(this.address);
    await this.socket.send([null, WORKER, READY, this.svcName]);

    this.beater = setInterval(this.heartbeat.bind(this), this.heartbeatInterval);

    this.logger.info(`${recon ? 'Reconnect: ' : ''}[${this.svcName}] ZMDP Worker started.`);

    // eslint-disable-next-line no-restricted-syntax
    for await (const [,, type, client,, ...req] of this.socket) {
      this.liveness = this.heartbeatLiveness;

      switch (type.toString()) {
        case REQUEST:
          this.handleClientRequest(client, ...req);
          break;

        case HEARTBEAT:
          break;

          // case DISCONNECT:
          // ignore disconnect, we infinitely reconnect
          // break;

        default:
          break;
      }
    }
  }

  async handleClientRequest(client, ...req) {
    let result = null;
    let status = RESP_OK;

    try {
      result = await this.triggerAction(client, ...req);
    } catch (err) {
      status = RESP_ERR;
      result = JSON.stringify(err, Object.getOwnPropertyNames(err));
    }

    try {
      await this.socket.send([null, WORKER, REPLY, client, null, status, result]);
    } catch (err) {
      this.logger.WARN(`Unable to send reply for ${this.address}`);
      this.logger.error(err);
    }
  }

  async heartbeat() {
    if (this.liveness > 0) {
      this.liveness -= 1;
      await this.socket.send([null, WORKER, HEARTBEAT]);
    } else {
      if (this.beater) {
        clearInterval(this.beater);
      }

      this.socket.close();
      await this.start(true);
    }
  }

  async stop() {
    console.log('--c');
    if (this.stopInitiated) return;
    console.log('--d');

    this.stopInitiated = true;
    this.logger.info(`[${this.svcName}] worker closed.`);

    if (this.beater) {
      clearInterval(this.beater);
    }

    if (!this.socket.closed) {
      await this.socket.send([null, WORKER, DISCONNECT]);
      this.socket.close();
    }
  }

  exposeFn(module, fn, validator, hook) {
    this.actions.set(`${module}.${fn.name.replace(/bound /i, '')}`, [fn, validator, hook]);
  }

  async triggerAction(client, ...req) {
    const [module, fnName, ...params] = req;

    const strFn = fnName.toString();
    const strModule = module.toString();
    const strClient = client.toString('hex');
    const [fn, validator, hook] = this.actions.get(`${strModule}.${strFn}`);

    if (fn) {
      this.logger.info(`[${strClient}] ${this.svcName} ${module}.${fnName}()`);
      const fnParams = await this._paramDecoder(module, strFn, params) || params;

      if (validator) await validator(...fnParams);
      const result = await fn(...fnParams);

      if (hook) await hook(result, ...fnParams);
      const encodedResult = await this._resultEncoder(module, strFn, result) || result;

      return encodedResult;
    }

    this.logger.warn(`${this.svcName}.${fnName}() not found.`);
    return null;
  }

  anchorExits() {
    const sigFn = {};
    const SIGNALS = ['SIGHUP', 'SIGINT', 'SIGTERM', 'SIGKILL'];

    SIGNALS.forEach((signal) => {
      sigFn[signal] = async () => {
        await this.stop();
        process.removeListener(signal, sigFn[signal]);
      };

      process.on(signal, sigFn[signal]);
    });
  }
}
