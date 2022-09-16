/* eslint-disable no-await-in-loop */
/* eslint-disable no-console */

import { Request, Context } from 'zeromq';
import { Header } from './enums.mjs';

const { CLIENT } = Header;

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
      const [,, resp] = await this.socket.receive();
      return resp;
    } catch (err) {
      this.logger.error(err);
      return null;
    }
  }

  async sendRcv2(service, fn, ...params) {
    let tries = 0;

    await this.socket.send([CLIENT, service, fn, ...params]);

    while (tries < this.retry) {
      try {
        const [header,, status, resp] = await this.socket.receive();
        console.log('--a', header.toString(), service.toString(), status.toString(), resp.toString());
        return resp.toString();
      } catch (err) {
        console.log(err);
        this.logger.warn(`Timeout: calling service '${service}' x${tries + 1} (${this.timeout / 1000}s)`);
      }

      tries += 1;
    }

    this.logger.error(`Client REQ failed: ${this.retry} retries consumed`);
    return null;
  }
}
