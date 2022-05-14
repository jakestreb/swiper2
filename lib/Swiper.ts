import * as log from './common/logger';
import * as mediaUtil from './common/media';
import {splitFirst} from './common/util';
import db from './db';
import Worker from './worker';
import CommManager from './io/CommManager';
import DownloadManager from './DownloadManager';
import TextFormatter from './io/formatters/TextFormatter';

import {reqMediaQuery, reqMedia, reqVideo, reqFullMedia} from './actions/helpers/decorators';
import {download} from './actions/download';
import {help} from './actions/help';
import {remove} from './actions/remove';
import {search} from './actions/search';
import {scheduled} from './actions/scheduled';
import {queued} from './actions/queued';
import {info} from './actions/info';

export default class Swiper {

  // Should be called to build a Swiper instance
  public static async create(): Promise<Swiper> {
    await db.init();
    return new Swiper();
  }

  public commManager: CommManager;
  public downloadManager: DownloadManager;
  public worker: Worker;

  private _conversations: {[clientId: number]: Conversation} = {};

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

  @reqMedia
  public async download(convo: Conversation, f: TextFormatter): Promise<SwiperReply> {
    log.debug(`Swiper: download`);
    return download.call(this, convo, f);
  }

  @reqVideo
  public async search(convo: Conversation, f: TextFormatter): Promise<SwiperReply> {
    log.debug(`Swiper: search`);
    return search.call(this, convo, f);
  }

  @reqMediaQuery
  public async remove(convo: Conversation, f: TextFormatter): Promise<SwiperReply> {
    log.debug(`Swiper: remove`);
    return remove.call(this, convo, f);
  }

  public async queued(convo: Conversation, f: TextFormatter): Promise<SwiperReply> {
    log.debug(`Swiper: queued`);
    return queued.call(this, convo, f);
  }

  public async scheduled(convo: Conversation, f: TextFormatter): Promise<SwiperReply> {
    log.debug(`Swiper: scheduled`);
    return scheduled.call(this, convo, f);
  }

  @reqFullMedia
  public async info(convo: Conversation, f: TextFormatter): Promise<SwiperReply> {
    log.debug(`Swiper: info`);
    return info.call(this, convo, f);
  }

  public help(convo: Conversation, f: TextFormatter): SwiperReply {
    log.debug(`Swiper: help`);
    return help.call(this, convo, f);
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

  // Fully remove the specified media
  // Destroy any active downloads of the media
  // Remove any download files
  // Remove any DB jobs
  // Remove any DB torrents
  public async removeMedia(media: Media): Promise<void> {
    const promises = mediaUtil.getVideos(media).map(async video => {
      const withTorrents = await db.videos.addTorrents(video);
      await this.downloadManager.destroyAndDeleteFiles(withTorrents);
      await this.worker.removeJobs(video.id);
      await db.torrents.delete(...withTorrents.torrents.map(t => t.id));
    });
    await Promise.all(promises);
    await db.media.delete(media);
    this.downloadManager.ping();
  }

  // Requires mediaQuery to be set.
  public async addStoredMediaIfFound(convo: Conversation): Promise<void> {
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
      mediaItems = mediaUtil.filterMediaEpisodes(mediaItems, mediaQuery.episodes);
      if (mediaItems.length > 0) {
        convo.storedMedia = mediaItems;
      }
    }
  }

  private _getCommandFn(convo: Conversation, command: string): CommandFn|null {
    const f = this.commManager.getTextFormatter(convo.id);
    switch (command) {
      case "download":
      case "get":
      case "d":
        return () => this.download(convo, f);
      case "search":
        return () => this.search(convo, f);
      case "remove":
      case "delete":
      case "rm":
      case "r":
        return () => this.remove(convo, f);
      case "scheduled":
      case "schedule":
      case "s":
        return () => this.scheduled(convo, f);
      case "queued":
      case "queue":
      case "q":
        return () => this.queued(convo, f);
      case "info":
      case "i":
        return () => this.info(convo, f);
      case "help":
      case "commands":
      case "h":
        return () => this.help(convo, f);
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
  private _updateConversation(id: number, update?: {[key: string]: any}): Conversation {
    if (!this._conversations[id]) {
      this._conversations[id] = {id};
    }
    return Object.assign(this._conversations[id], update || {});
  }
}
