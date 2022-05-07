import {requireMedia, requireMediaQuery} from './common/decorators';
import {requireVideo} from './common/decorators';
import * as log from './common/logger';
import {filterMediaEpisodes} from './common/media';
import {splitFirst} from './common/util';
import db from './db';
import Worker from './worker';
import {DownloadManager} from './DownloadManager';

// import {check} from './actions/check';
import {download} from './actions/download';
// import {favorite} from './actions/favorite';
import {help} from './actions/help';
// import {info} from './actions/info';
// import {random} from './actions/random';
// import {reassign, reassignIdentify, ReassignOptions} from './actions/reassign';
import {remove} from './actions/remove';
// import {reorder} from './actions/reorder';
import {search} from './actions/search';
import {status} from './actions/status';
// import {suggest} from './actions/suggest';

export default class Swiper {
  // Should be called to build a Swiper instance.
  public static async create(sendMsg: (id: number, msg: SwiperReply) => Promise<void>): Promise<Swiper> {
    await db.init();
    return new Swiper(sendMsg);
  }

  public downloadManager: DownloadManager;
  public worker: Worker;

  private _conversations: {[id: number]: Conversation} = {};

  // Should NOT be called publicly. Uses Swiper.create for building a Swiper instance.
  constructor(
    private _sendMsg: (id: number, msg: SwiperReply) => Promise<void>
  ) {
    this.downloadManager = new DownloadManager();
    this.worker = new Worker(this);
    this.worker.start();
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
    await this._sendMsg(id, reply);
  }

  // public async abort(convo: Conversation): Promise<SwiperReply> {
  //   log.debug(`Swiper: abort`);
  //   await this.dbManager.moveAllQueuedToFailed(convo.id);
  //   this.downloadManager.ping();
  //   return {
  //     data: `Cancelled all queued downloads`,
  //     final: true
  //   };
  // }

  // @requireVideoQuery
  // public async blacklist(convo: Conversation): Promise<SwiperReply> {
  //   log.debug(`Swiper: blacklist`);
  //   convo.commandFn = () => this.reassign(convo, {blacklist: true});
  //   return this.reassign(convo, {blacklist: true});
  // }

  public cancel(convo: Conversation): SwiperReply {
    log.debug(`Swiper: cancel`);
    return {
      data: `Ok`,
      final: true
    };
  }

  // public async check(convo: Conversation): Promise<SwiperReply> {
  //   log.debug(`Swiper: check`);
  //   return check.call(this, convo);
  // }

  @requireMedia
  public async download(convo: Conversation): Promise<SwiperReply> {
    log.debug(`Swiper: download`);
    return download.call(this, convo);
  }

  public help(convo: Conversation): SwiperReply {
    log.debug(`Swiper: help`);
    return help.call(this, convo);
  }

  // @requireVideoQuery
  // public async reassign(convo: Conversation, options: ReassignOptions = {}): Promise<SwiperReply> {
  //   log.debug(`Swiper: reassign`);
  //   return reassign.call(this, convo, options);
  // }

  @requireVideo
  public async search(convo: Conversation): Promise<SwiperReply> {
    log.debug(`Swiper: search`);
    return search.call(this, convo);
  }

  @requireMedia
  public async monitor(convo: Conversation): Promise<SwiperReply> {
    log.debug(`Swiper: monitor`);
    const media = convo.media as Media;
    await db.media.insert(media, { status: 'unreleased', addedBy: convo.id });
    return {
      data: `Added ${media.title} to monitored`,
      final: true
    };
  }

  // @requireFullMedia
  // public async info(convo: Conversation): Promise<SwiperReply> {
  //   log.debug(`Swiper: info`);
  //   return info.call(this, convo);
  // }

  @requireMediaQuery
  public async remove(convo: Conversation): Promise<SwiperReply> {
    log.debug(`Swiper: remove`);
    return remove.call(this, convo);
  }

  // @requireMediaQuery
  // public async reorder(convo: Conversation): Promise<SwiperReply> {
  //   log.debug(`Swiper: reorder`);
  //   return reorder.call(this, convo);
  // }

  // public async random(convo: Conversation): Promise<SwiperReply> {
  //   log.debug(`Swiper: random`);
  //   return random.call(this, convo);
  // }

  // @requireVideo
  // public async favorite(convo: Conversation): Promise<SwiperReply> {
  //   log.debug(`Swiper: favorite`);
  //   return favorite.call(this, convo);
  // }

  public async status(convo: Conversation): Promise<SwiperReply> {
    log.debug(`Swiper: status`);
    return status.call(this, convo);
  }

  // public async suggest(convo: Conversation): Promise<SwiperReply> {
  //   log.debug(`Swiper: suggest`);
  //   return suggest.call(this, convo);
  // }

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

  // @requireVideo
  // public async reassignIdentify(convo: Conversation, options: ReassignOptions = {}): Promise<SwiperReply> {
  //   return reassignIdentify.call(this, convo, options);
  // }

  private _getCommandFn(convo: Conversation, command: string): CommandFn|null {
    switch (command) {
      case "download":
      case "get":
        return () => this.download(convo);
      case "search":
        return () => this.search(convo);
      // case "reassign":
      //   return () => this.reassign(convo);
      // case "blacklist":
      //   return () => this.blacklist(convo);
      case "monitor":
      case "watch":
        return () => this.monitor(convo);
      // case "check":
      //   return () => this.check(convo);
      // case "info":
      //   return () => this.info(convo);
      case "remove":
      case "delete":
        return () => this.remove(convo);
      // case "reorder":
      // case "move":
      //   return () => this.reorder(convo);
      // case "abort":
      //   return () => this.abort(convo);
      // case "random":
      //   return () => this.random(convo);
      // case "favorite":
      //   return () => this.favorite(convo);
      case "status":
      case "progress":
      case "state":
      case "downloads":
      case "stat":
      case "s":
        return () => this.status(convo);
      // case "suggest":
      //   return () => this.suggest(convo);
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
