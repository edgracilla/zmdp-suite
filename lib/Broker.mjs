/* eslint-disable security/detect-object-injection */

import { Router } from 'zeromq';
import { Header, Message } from './enums.mjs';

import Service from './Service.mjs';

const { CLIENT, WORKER } = Header;
const { READY, REPLY, DISCONNECT, HEARTBEAT } = Message;

const routerConfig = {
  sendHighWaterMark: 1,
  sendTimeout: 1,
};

export default class Broker {
  constructor(address, config) {
    this.address = address;
    this.svcConf = config;
    this.socket = new Router(routerConfig);
    this.logger = config.logger || console;

    this.services = new Map();
    this.svcWorkerIndex = new Map();
  }

  async listen() {
    this.logger.info(`Listening on ${this.address}`);
    await this.socket.bind(this.address);

    // eslint-disable-next-line no-restricted-syntax
    for await (const [sender,, header, ...rest] of this.socket) {
      switch (header.toString()) {
        case CLIENT: this.handleClient(sender, ...rest); break;
        case WORKER: this.handleWorker(sender, ...rest); break;
        default: break;
      }
    }
  }

  handleClient(client, ...rest) {
    const cStrId = client.toString('hex');
    const [serviceBuf, ...req] = rest;

    const svcName = serviceBuf.toString();

    if (!svcName) {
      return this.logger.error(`[${CLIENT}] ${cStrId}.req -> empty service name!`);
    }

    if (!this.services.has(svcName)) {
      this.services.set(svcName, new Service(this.socket, svcName, this.svcConf));
    }

    const service = this.services.get(svcName);
    service.dispatchClientRequest(client, ...req);

    return null;
  }

  handleWorker(worker, ...rest) {
    const [type, ...req] = rest;

    const msgType = type.toString();
    const wStrId = worker.toString('hex');
    const mightSvcExist = msgType !== READY;

    const svcName = mightSvcExist
      ? this.svcWorkerIndex.get(wStrId)
      : req[0].toString();

    if (!this.services.has(svcName)) {
      this.services.set(svcName, new Service(this.socket, svcName, this.svcConf));
    }

    const service = this.services.get(svcName);

    if (!svcName) return this.logger.warn(`Worker ${wStrId} not in worker/service index.`);
    if (!service) return this.logger.warn(`Service '${svcName}' not found.`);

    switch (msgType) {
      case READY: {
        service.addWorker(worker);
        this.svcWorkerIndex.set(wStrId, svcName);
        break;
      }

      case REPLY: {
        const [client,, ...rep] = req;
        service.dispatchWorkerReply(worker, client, ...rep);
        break;
      }

      case HEARTBEAT:
        service.resetWorkerLiveness(wStrId);
        break;

      case DISCONNECT: {
        service.removeWorker(wStrId);
        break;
      }

      default: {
        this.logger.warn(`Invalid worker message type: ${type}`);
      }
    }

    return null;
  }

  anchorExits() {
    const sigFn = {};
    const SIGNALS = ['SIGHUP', 'SIGINT', 'SIGTERM'];

    SIGNALS.forEach((signal) => {
      sigFn[signal] = async () => {
        await this.socket.close();
        process.removeListener(signal, sigFn[signal]);
      };

      process.on(signal, sigFn[signal]);
    });
  }
}
