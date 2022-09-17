import EventEmitter from 'events';
import { Header, Message } from './enums.mjs';

const { WORKER, CLIENT } = Header;
const { HEARTBEAT, REQUEST } = Message;

class ServiceWorker extends EventEmitter {
  constructor(svcName, socket, wId, options) {
    super();

    this.wId = wId;
    this.socket = socket;
    this.svcName = svcName;
    this.wStrId = wId.toString('hex');

    this.logger = options.logger || console;
    this.liveness = options.heartbeatLiveness || 3;
    this.heartbeatLiveness = options.heartbeatLiveness || 3;
    this.workerRequestTimeout = options.workerRequestTimeout || 5000;

    this.verbose = options.verbose === undefined ? 1 : options.verbose;

    const interval = options.heartbeatInterval || 3000;
    this.beater = setInterval(this.heartbeat.bind(this), interval);
    this.request = [];
  }

  async cascadeRequest(origin, client, ...req) {
    const cStrId = client.toString('hex');
    const [module, fn] = req;

    this.request.push([client, req]);
    this.seq = (Date.now()).toString(36).substring(4);

    if (this.verbose > 1) {
      this.logger.info(`(${this.seq}) ${this.svcName} casc: ${cStrId}.req -> ${this.wStrId}.${module}.${fn} (${origin})`);
    }

    await this.socket.send([this.wId, null, WORKER, REQUEST, client, null, ...req]);
  }

  async dispatchReply(client, ...rep) {
    const cStrId = client.toString('hex');

    if (this.verbose > 1) {
      this.logger.info(`(${this.seq}) ${this.svcName} disp: ${cStrId}.req <- ${this.wStrId}.rep`);
    }

    await this.socket.send([client, null, CLIENT, this.svcName, ...rep]);

    this.request.shift();
    this.seq = '';
  }

  async heartbeat() {
    if (this.liveness > 0) {
      this.liveness -= 1;

      if (!this.socket.closed) {
        await this.socket.send([this.wId, null, WORKER, HEARTBEAT]);
      }
    } else {
      this.emit('destroy', this.wId.toString('hex'));
    }
  }

  resetLiveness() {
    this.liveness = this.heartbeatLiveness;
  }

  clearBeater() {
    clearInterval(this.beater);
  }
}

export default ServiceWorker;
