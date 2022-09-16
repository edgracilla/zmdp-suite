/* eslint-disable no-await-in-loop */

import { Header } from './enums.mjs';
import ServiceWorker from './ServiceWorker.mjs';

const { CLIENT } = Header;

class Service {
  constructor(socket, name, options = {}) {
    this.name = name;
    this.socket = socket;
    this.options = options;
    this.logger = options.logger || console;
    this.verbose = options.verbose === undefined ? 1 : options.verbose;

    this.requests = [];
    this.unoccupied = new Set();
    this.svcWorkers = new Map();
  }

  addWorker(worker) {
    const wStrId = worker.toString('hex');
    const sWorker = this.svcWorkers.get(wStrId);

    if (sWorker) {
      // paranoia, this might happen? if this happens, do not recreate SW as it
      // resets beater and might halt running operations
      this.logger.warn(`Adding worker that is already exist! ${wStrId}`);
    } else {
      const nWorker = new ServiceWorker(this.name, this.socket, worker, this.options);

      nWorker.on('destroy', this.removeWorker.bind(this));

      this.svcWorkers.set(wStrId, nWorker);
      this.unoccupied.add(wStrId);

      if (this.verbose > 0) {
        this.logger.info(`${this.name} worker added: ${wStrId} (${this.unoccupied.size}/${this.svcWorkers.size})`);
      }

      this.consumeRequests('ADW');
    }
  }

  removeWorker(wStrId) {
    const sWorker = this.svcWorkers.get(wStrId);

    if (sWorker) {
      if (sWorker.request.length) {
        const [client, req] = sWorker.request.shift();
        this.requests.push([client, req]);
      }

      sWorker.clearBeater();
    }

    const deleted = this.svcWorkers.delete(wStrId);

    if (deleted) {
      this.unoccupied.delete(wStrId);
    } else {
      // TODO: handle occupied worker deletion
      // wait till worker process done? or force delete?
      this.logger.error('-- svc worker rmv failed!');
    }

    if (this.verbose > 0) {
      this.logger.info(`${this.name} worker rmved: ${wStrId} (${this.unoccupied.size}/${this.svcWorkers.size})`);
    }

    this.consumeRequests('RMW');
  }

  dispatchClientRequest(client, ...req) {
    if (this.verbose > 2) {
      this.logger.info(`[${CLIENT}] ${client.toString('hex')}.req -> ${this.name}.${req[0].toString()}()`);
    }

    this.requests.push([client, req]);
    this.consumeRequests('DCR');
  }

  async consumeRequests(origin) {
    while (this.svcWorkers.size && this.requests.length && this.unoccupied.size) {
      const [, wStrId] = this.unoccupied.entries().next().value;
      const [client, req] = this.requests.shift();

      this.unoccupied.delete(wStrId);

      const sWorker = this.svcWorkers.get(wStrId);
      await sWorker.cascadeRequest(origin, client, ...req);
    }
  }

  async dispatchWorkerReply(worker, client, rep) {
    const wStrId = worker.toString('hex');
    const sWorker = this.svcWorkers.get(wStrId);

    await sWorker.dispatchReply(client, rep);

    this.unoccupied.add(wStrId);
    this.consumeRequests('DWR');
  }

  resetWorkerLiveness(wStrId) {
    const sWorker = this.svcWorkers.get(wStrId);

    if (!sWorker) {
      return this.logger.warn(`Unable to reset liveness! missing worker ${wStrId}`);
    }

    sWorker.resetLiveness();
    return null;
  }
}

export default Service;
