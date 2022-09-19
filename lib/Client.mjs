/* eslint-disable no-await-in-loop */

import ProtoCoder from 'zmdp-protocoder';
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

    this.targetSvcName = config.targetSvcName;
    this.targetSvcModule = config.targetSvcModule;

    this.socket = new Request({
      context: new Context({ blocky: false }),
      receiveTimeout: this.timeout,
      linger: 1,
    });

    this.socket.connect(config.address);
    this.zpc = new ProtoCoder(config.protoSrc);

    this.zpc.loadProtos();
  }

  async sendRcv(service, module, fn, params) {
    await this.socket.send([CLIENT, service, module, fn, params]);

    try {
      const [,, status, resp] = await this.socket.receive();
      return [resp, status.toString() !== RESP_OK];
    } catch (err) {
      this.logger.error(err);
      return null;
    }
  }

  async sendRcvProto(method, objPayload) {
    const service = this.targetSvcName;
    const module = this.targetSvcModule;

    if (!this.zpc.protoSrc || !service || !module) {
      throw new Error('The following are required to use protobuf: protoSrc, targetSvcName, targetSvcModule.');
    }

    const buf = await this.zpc.paramEncode(module, method, objPayload);
    const [resp, err] = await this.sendRcv(service, module, method, buf);

    if (err) {
      const e = JSON.parse(resp.toString());
      const newErr = new Error();

      newErr.stack = e.stack;
      newErr.message = e.message;
      newErr.statusCode = e.statusCode;

      newErr.data = e.data || [];

      throw newErr;
    }

    if (resp) {
      const { result } = await this.zpc.resultDecode(module, method, resp);
      return result;
    }

    return null;
  }
}
