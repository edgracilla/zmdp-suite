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
    this.logger.info(`Listening on ${this.address}.`);
    await this.socket.bind(this.address);

    // eslint-disable-next-line no-restricted-syntax
    for await (const [sender,, header, ...rest] of this.socket) {
      if (header) {
        switch (header.toString()) {
          case CLIENT: this.handleClient(sender, ...rest); break;
          case WORKER: this.handleWorker(sender, ...rest); break;
          default: break;
        }
      } else {
        // pod restarts often due to error below:
        // file:///home/app/node_modules/zmdp-suite/lib/Broker.mjs:33
        //       switch (header.toString()) {
        //                     ^
        // TypeError: Cannot read properties of undefined (reading 'toString')
        //     at Broker.listen (file:///home/app/node_modules/zmdp-suite/lib/Broker.mjs:33:22)

        // logging it for investigation
        console.log('> sender:', sender.toString());
        console.log('> header:', header);
        console.log('> rest:', rest);

        // TODO:

        // eslint-disable-next-line max-len
        // > sender: <Buffer 54 20 2f 20 48 54 54 50 2f 31 2e 31 0d 0a 48 6f 73 74 3a 20 33 34 2e 31 32 36 2e 31 37 31 2e 31 36 30 3a 35 30 30 30 0d 0a 55 73 65 72 2d 41 67 65 6e ... 20 more bytes>
        // > header: undefined
        // > rest: []

        // T / HTTP/1.1
        // Host: 34.126.171.160:5000
        // User-Agen
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
