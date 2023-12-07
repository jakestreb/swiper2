import * as log from './log';
import * as util from './util';
import db from './db';
import Worker from './worker';
import CommManager from './io/CommManager';
import DownloadManager from './DownloadManager';

import {reqMediaQuery, reqMedia, reqVideo, reqFullMedia} from './actions/helpers/decorators';
import {download} from './actions/download';
import {help} from './actions/help';
import {remove} from './actions/remove';
import {search} from './actions/search';
import {scheduled} from './actions/scheduled';
import {queued} from './actions/queued';
import {info} from './actions/info';
import {ip} from './actions/ip';
import {unknown} from './actions/unknown';

export default class Swiper {

  // Should be called to build a Swiper instance
  public static async create(): Promise<Swiper> {
    await db.init();
    return new Swiper();
  }

  public commManager: CommManager;
  public downloadManager: DownloadManager;
  public worker: Worker;

  private conversations: {[clientId: number]: Conversation} = {};

  // Should NOT be called publicly - use Swiper.create
  constructor() {
    this.downloadManager = new DownloadManager(this);
    this.worker = new Worker(this);
    this.worker.start();
    this.commManager = new CommManager(this.handleMsg.bind(this));
    this.commManager.start();
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
    log.debug(`Swiper: download`);
    return download.call(this, convo);
  }

  @reqVideo
  public async search(convo: Conversation): Promise<SwiperReply> {
    log.debug(`Swiper: search`);
    return search.call(this, convo);
  }

  @reqMediaQuery
  public async remove(convo: Conversation): Promise<SwiperReply> {
    log.debug(`Swiper: remove`);
    return remove.call(this, convo);
  }

  public async queued(convo: Conversation): Promise<SwiperReply> {
    log.debug(`Swiper: queued`);
    return queued.call(this, convo);
  }

  public async scheduled(convo: Conversation): Promise<SwiperReply> {
    log.debug(`Swiper: scheduled`);
    return scheduled.call(this, convo);
  }

  @reqFullMedia
  public async info(convo: Conversation): Promise<SwiperReply> {
    log.debug(`Swiper: info`);
    return info.call(this, convo);
  }

  public help(convo: Conversation): SwiperReply {
    log.debug(`Swiper: help`);
    return help.call(this, convo);
  }

  public unknown(convo: Conversation): SwiperReply {
    log.debug(`Swiper: unknown`);
    return unknown.call(this, convo);
  }

  public cancel(convo: Conversation): SwiperReply {
    log.debug(`Swiper: cancel`);
    return {
      data: 'Ok',
      final: true
    };
  }

  public reboot(convo: Conversation): SwiperReply {
    log.debug(`Swiper: reboot`);
    setTimeout(() => process.kill(process.pid, 'SIGINT'), 2000);
    return {
      data: 'Rebooting',
      final: true
    };
  }

  public ip(convo: Conversation): Promise<SwiperReply> {
    log.debug(`Swiper: ip`);
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
