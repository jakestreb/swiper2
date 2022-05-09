import {requireMedia, requireMediaQuery} from './common/decorators';
import {requireVideo} from './common/decorators';
import * as log from './common/logger';
import {filterMediaEpisodes} from './common/media';
import {splitFirst} from './common/util';
import db from './db';
import Worker from './worker';
import CommManager from './CommManager';
import DownloadManager from './DownloadManager';

import {download} from './actions/download';
import {help} from './actions/help';
import {remove} from './actions/remove';
import {search} from './actions/search';
import {status} from './actions/status';
// import {info} from './actions/info';

export default class Swiper {

  // Should be called to build a Swiper instance
  public static async create(): Promise<Swiper> {
    await db.init();
    return new Swiper();
  }

  public commManager: CommManager;
  public downloadManager: DownloadManager;
  public worker: Worker;

  private _conversations: {[id: number]: Conversation} = {};

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
    const convo = this._updateConversation(id);
    const existingCommandFn = this._conversations[id].commandFn;
    const [command, input] = splitFirst(msg);
    const commandFn = this._getCommandFn(convo, command);

    // Run a new command or an existing command.
    let reply: SwiperReply;
    if (commandFn) {
      this._updateConversation(id, {commandFn, input});
      reply = await commandFn();
    } else if (existingCommandFn) {
      this._updateConversation(id, {input: msg});
      reply = await existingCommandFn();
    } else {
      const basic = `Everything you need to know\n\n` +
        `\` download pulp fiction\`\n` +
        `\` download batman 1989\`\n` +
        `\` download game of thrones s04e05-8\`\n` +
        `\` status\`\n` +
        `\` remove game of thrones\`\n` +
        `\` cancel\`\n\n` +
        `Use \`help\` for a full command list`;
      reply = { data: basic };
    }

    // If the reply is marked as final, clear the conversation state.
    if (reply.final) {
      delete this._conversations[convo.id];
    }

    // Send a response to the client.
    this.commManager.replyToClient(id, reply);
  }

  // Send unprompted message to client
  public async notifyClient(id: number, msg: string) {
    this.commManager.notifyClient(id, msg);
  }

  public cancel(convo: Conversation): SwiperReply {
    log.debug(`Swiper: cancel`);
    return {
      data: `Ok`,
      final: true
    };
  }

  @requireMedia
  public async download(convo: Conversation): Promise<SwiperReply> {
    log.debug(`Swiper: download`);
    return download.call(this, convo);
  }

  public help(convo: Conversation): SwiperReply {
    log.debug(`Swiper: help`);
    return help.call(this, convo);
  }

  @requireVideo
  public async search(convo: Conversation): Promise<SwiperReply> {
    log.debug(`Swiper: search`);
    return search.call(this, convo);
  }

  @requireMediaQuery
  public async remove(convo: Conversation): Promise<SwiperReply> {
    log.debug(`Swiper: remove`);
    return remove.call(this, convo);
  }

  public async status(convo: Conversation): Promise<SwiperReply> {
    log.debug(`Swiper: status`);
    return status.call(this, convo);
  }

  public reboot(convo: Conversation): SwiperReply {
    log.debug(`Swiper: reboot`);
    setTimeout(() => process.kill(process.pid, 'SIGINT'), 2000);
    return {
      data: `Rebooting`,
      final: true
    };
  }

  // Requires mediaQuery to be set.
  public async addStoredMediaIfFound(convo: Conversation): Promise<SwiperReply|void> {
    const mediaQuery = convo.mediaQuery;
    if (!mediaQuery) {
      throw new Error(`addStoredMediaIfFound requires mediaQuery`);
    }
    // When searching stored media, we treat an unspecified episode list as all episodes.
    if (!mediaQuery.episodes) {
      mediaQuery.episodes = 'all';
    }
    // Search the database for all matching Movies/Shows.
    if (!convo.storedMedia) {
      let mediaItems = await db.media.search(mediaQuery.title, { type: mediaQuery.type || undefined });
      mediaItems = filterMediaEpisodes(mediaItems, mediaQuery.episodes);
      if (mediaItems.length > 0) {
        convo.storedMedia = mediaItems;
      }
    }
  }

  private _getCommandFn(convo: Conversation, command: string): CommandFn|null {
    switch (command) {
      case "download":
      case "get":
        return () => this.download(convo);
      case "search":
        return () => this.search(convo);
      case "remove":
      case "delete":
        return () => this.remove(convo);
      case "status":
      case "progress":
      case "state":
      case "downloads":
      case "stat":
      case "s":
        return () => this.status(convo);
      case "help":
      case "commands":
        return () => this.help(convo);
      case "restart":
      case "reset":
      case "reboot":
        return () => this.reboot(convo);
      case "cancel":
        return () => this.cancel(convo);
      default:
        return null;
    }
  }

  // Updates and returns the updated conversation.
  private _updateConversation(id: number, update?: {[key: string]: any}): Conversation {
    if (!this._conversations[id]) {
      this._conversations[id] = {id};
    }
    return Object.assign(this._conversations[id], update || {});
  }
}
