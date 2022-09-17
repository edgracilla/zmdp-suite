/* eslint-disable no-await-in-loop */
/* eslint-disable no-console */

import { Request, Context } from 'zeromq';
import { Header, ResponseStatus } from './enums.mjs';

const { CLIENT } = Header;
const { RESP_OK } = ResponseStatus;

export default class Client {
  constructor(config) {
    this.retry = config.retry || 3;
    this.logger = config.logger || console;
    this.timeout = config.timeout || 1000 * 10;
    this.address = config.address;

    const context = new Context({ blocky: false });

    this.socket = new Request({
      receiveTimeout: this.timeout,
      linger: 1,
      context,
    });

    this.socket.connect(config.address);
  }

  async sendRcv(service, module, fn, params) {
    await this.socket.send([CLIENT, service, module, fn, params]);

    try {
      const [client, bb, status, resp] = await this.socket.receive();
      console.log('--a', client.toString(), bb.toString(), status, resp);
      return status === RESP_OK ? [0, resp] : [resp];
    } catch (err) {
      console.log('--b');
      this.logger.error(err);
      return null;
    }
  }
}
