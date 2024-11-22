import logger from './util/logger.js';
import * as util from './util/index.js';
import db from './db/index.js';
import Worker from './worker/index.js';
import CommManager from './functions/message/CommManager.js';
import DownloadManager from './functions/download/DownloadManager.js';

import {reqMediaQuery, reqMedia, reqVideo, reqFullMedia} from './actions/helpers/decorators.js';
import {download} from './actions/download.js';
import {help} from './actions/help.js';
import {remove} from './actions/remove.js';
import {search} from './actions/search.js';
import {scheduled} from './actions/scheduled.js';
import {queued} from './actions/queued.js';
import {info} from './actions/info.js';
import {ip} from './actions/ip.js';
import {unknown} from './actions/unknown.js';
import HealthCheckServer from './functions/healthcheck/server.js';

export default class Swiper {

  // Should be called to build a Swiper instance
  public static async create(): Promise<Swiper> {
    await db.init();
    return new Swiper();
  }

  public commManager: CommManager;
  public downloadManager: DownloadManager;
  public healthCheckServer: HealthCheckServer;
  public worker: Worker;

  private conversations: {[clientId: number]: Conversation} = {};

  // Should NOT be called publicly - use Swiper.create
  constructor() {
    this.downloadManager = new DownloadManager(this);
    
    this.worker = new Worker(this);
    this.worker.start();
    
    this.commManager = new CommManager(this.handleMsg.bind(this));
    this.commManager.start();
    
    this.healthCheckServer = new HealthCheckServer()
    this.healthCheckServer.start();
  }

  public async handleMsg(id: number, msg?: string): Promise<void> {
    msg = (msg || '').toLowerCase().trim();
    // Initialize the conversation if it does not exist and get the command function.
    const convo = this.updateConversation(id);
    const existingCommandFn = this.conversations[id].commandFn;
    const [command, input] = util.splitFirst(msg);
    const commandFn = this.getCommandFn(convo, command);

    // Run a new command or an existing command.
    let reply: SwiperReply;
    try {
      if (commandFn) {
        this.updateConversation(id, {commandFn, input});
        reply = await commandFn();
      } else if (existingCommandFn) {
        this.updateConversation(id, {input: msg});
        reply = await existingCommandFn();
      } else {
        reply = await this.unknown(convo);
      }
    } catch (err) {
      // Delete conversation on error to avoid getting stuck
      delete this.conversations[convo.id];
      throw err;
    }

    // If the reply is marked as final, clear the conversation state.
    if (reply.final) {
      delete this.conversations[convo.id];
    }

    // Send a response to the client.
    this.commManager.replyToClient(id, reply);
  }

  public getTextFormatter(convo: Conversation) {
    return this.commManager.getTextFormatter(convo.id);
  }

  // Send unprompted message to client
  public async notifyClient(id: number, msg: string) {
    this.commManager.notifyClient(id, msg);
  }

  @reqMedia
  public async download(convo: Conversation): Promise<SwiperReply> {
    logger.debug(`Swiper: download`);
    return download.call(this, convo);
  }

  @reqVideo
  public async search(convo: Conversation): Promise<SwiperReply> {
    logger.debug(`Swiper: search`);
    return search.call(this, convo);
  }

  @reqMediaQuery
  public async remove(convo: Conversation): Promise<SwiperReply> {
    logger.debug(`Swiper: remove`);
    return remove.call(this, convo);
  }

  public async queued(convo: Conversation): Promise<SwiperReply> {
    logger.debug(`Swiper: queued`);
    return queued.call(this, convo);
  }

  public async scheduled(convo: Conversation): Promise<SwiperReply> {
    logger.debug(`Swiper: scheduled`);
    return scheduled.call(this, convo);
  }

  @reqFullMedia
  public async info(convo: Conversation): Promise<SwiperReply> {
    logger.debug(`Swiper: info`);
    return info.call(this, convo);
  }

  public help(convo: Conversation): SwiperReply {
    logger.debug(`Swiper: help`);
    return help.call(this, convo);
  }

  public unknown(convo: Conversation): SwiperReply {
    logger.debug(`Swiper: unknown`);
    return unknown.call(this, convo);
  }

  public cancel(convo: Conversation): SwiperReply {
    logger.debug(`Swiper: cancel`);
    return {
      data: 'Ok',
      final: true
    };
  }

  public reboot(convo: Conversation): SwiperReply {
    logger.debug(`Swiper: reboot`);
    setTimeout(() => process.kill(process.pid, 'SIGINT'), 2000);
    return {
      data: 'Rebooting',
      final: true
    };
  }

  public ip(convo: Conversation): Promise<SwiperReply> {
    logger.debug(`Swiper: ip`);
    return ip.call(this, convo);
  }

  private getCommandFn(convo: Conversation, command: string): CommandFn|null {
    switch (command) {
      case "download":
      case "monitor":
      case "get":
      case "d":
        return () => this.download(convo);
      case "search":
        return () => this.search(convo);
      case "remove":
      case "delete":
      case "del":
      case "rm":
      case "r":
        return () => this.remove(convo);
      case "scheduled":
      case "schedule":
      case "s":
        return () => this.scheduled(convo);
      case "queued":
      case "queue":
      case "q":
        return () => this.queued(convo);
      case "info":
      case "i":
        return () => this.info(convo);
      case "ip":
	return () => this.ip(convo);
      case "help":
      case "commands":
      case "h":
        return () => this.help(convo);
      case "restart":
      case "reset":
      case "reboot":
        return () => this.reboot(convo);
      case "cancel":
      case "c":
        return () => this.cancel(convo);
      default:
        return null;
    }
  }

  // Updates and returns the updated conversation.
  private updateConversation(id: number, update?: {[key: string]: any}): Conversation {
    if (!this.conversations[id]) {
      this.conversations[id] = {id};
    }
    return Object.assign(this.conversations[id], update || {});
  }
}
