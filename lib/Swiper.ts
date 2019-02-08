import range = require('lodash/range');
import {commands} from './commands';
import {DBManager} from './DBManager';
import {DownloadManager} from './DownloadManager';
import {filterEpisodes, filterMediaEpisodes, getDescription, getLastAired, getNextToAir} from './media';
import {Episode, getVideo, Media, Movie, Show, Video} from './media';
import {identifyMedia} from './request';
import {settings} from './settings';
import {SwiperMonitor} from './SwiperMonitor';
import {log, logDebug} from './terminal';
import {getBestTorrent, getTorrentString, SearchClient, Torrent} from './torrent';
import {execCapture, getAiredStr, getMorning} from './util';
import {matchNumber, matchYesNo, padZeros, removePrefix, splitFirst} from './util';

// TODO: MAKE SURE FIRST TORRENT ATTACHMENT (for download) HOLDS
// TODO: Allow remove all/monitored/downloads/failed

// TODO: Test re-adding, adding episodes to an existing show, searching something in monitored, etc
// TODO: Add enhanced terminal features like enhanced status menu.
// TODO: Figure out why there are so many listeners on client.add.
// TODO: Create readme (heroku address, how to check ips, etc).

type CommandFn = (input?: string) => Promise<SwiperReply>|SwiperReply;

interface ConversationData {
  id: number;
  input?: string;
  commandFn?: CommandFn;
  mediaQuery?: MediaQuery;
  media?: Media;
  position?: 'first'|'last';
  torrents?: Torrent[];
  storedMedia?: Media[];
  pageNum?: number;
}

interface RequireOptions {
  forceEpisodes?: EpisodesDescriptor; // Forces the episode mediaQuery argument to be as given.
  requireVideo?: boolean; // Indicates whether prompts should be given to reduce to a single video.
}

interface SearchOptions {
  reassignTorrent?: boolean; // When true, does not begin a new download but just reassigns the torrent.
}

interface ReassignOptions {
  blacklist?: boolean; // When true, the reassigned torrent is also blacklisted.
}

export interface SwiperReply {
  data?: string;
  enhanced?: () => void; // Enhanced response for the terminal
  err?: string;
  final?: boolean;
}

// Info from the client to identify media
// All null values are treated as undetermined.
export interface MediaQuery {
  title: string;
  type: 'movie'|'tv'|null;
  episodes: EpisodesDescriptor|null;
  year: string|null;
}

// Map from each desired season to an array of episode numbers or 'all'.
export interface SeasonEpisodes {
  [season: string]: number[]|'all';
}

export type EpisodesDescriptor = SeasonEpisodes|'new'|'all';

type Conversation = ConversationData & { id: number; };

export class Swiper {
  // Should be called to build a Swiper instance.
  public static async create(sendMsg: (id: number, msg: SwiperReply) => Promise<void>): Promise<Swiper> {
    const dbManager = new DBManager();
    await dbManager.initDB();
    return new Swiper(sendMsg, dbManager);
  }

  private _searchClient: SearchClient;
  private _downloadManager: DownloadManager;
  private _swiperMonitor: SwiperMonitor;
  private _conversations: {[id: number]: Conversation} = {};
  private _checkInProgress: boolean = false;

  // Should NOT be called publicly. User Swiper.create for building a Swiper instance.
  // Note that _dbManager should be initialized when passed in.
  constructor(
    private _sendMsg: (id: number, msg: SwiperReply) => Promise<void>,
    private _dbManager: DBManager
  ) {
    this._searchClient = new SearchClient();
    this._downloadManager = new DownloadManager(this._dbManager, this._searchClient);
    this._swiperMonitor = new SwiperMonitor(this._dbManager, this._searchClient, this._downloadManager);
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
      reply = { data: `Use 'help' to see what I can do` };
    }

    // If the reply is marked as final, clear the conversation state.
    if (reply.final) {
      this._deleteConversation(convo);
    }

    // Send a response to the client.
    await this._sendMsg(id, reply);
  }

  private _getCommandFn(convo: Conversation, command: string): CommandFn|null {
    switch (command) {
      case "download":
      case "get":
        return () => this._download(convo);
      case "search":
        return () => this._search(convo);
      case "reassign":
        return () => this._reassign(convo);
      case "blacklist":
        return () => this._blacklist(convo);
      case "monitor":
      case "watch":
        return () => this._monitor(convo);
      case "check":
        return () => this._check(convo);
      case "info":
        return () => this._info(convo);
      case "remove":
      case "delete":
        return () => this._remove(convo);
      case "reorder":
      case "move":
        return () => this._reorder(convo);
      case "abort":
        return () => this._abort(convo);
      case "random":
        return () => this._random(convo);
      case "status":
      case "progress":
      case "state":
        return () => this._status(convo);
      case "help":
      case "commands":
        return () => this._help(convo);
      case "cancel":
        return () => this._cancel(convo);
      default:
        return null;
    }
  }

  @requireMedia
  private async _download(convo: Conversation): Promise<SwiperReply> {
    logDebug(`Swiper: _download`);

    // Check if the media item is a single video for special handling.
    const media = convo.media as Media;
    const video: Video|null = getVideo(media);
    let best: Torrent|null = null;
    if (video) {
      log(`Searching for ${getDescription(video)} downloads`);
      const torrents = await this._searchClient.search(video);
      const videoMeta = await this._dbManager.addMetadata(video);
      best = getBestTorrent(videoMeta, torrents);
      if (!best) {
        logDebug(`Swiper: _download failed to find torrent`);
        // If the target is a single video and an automated search failed, show the torrents.
        convo.torrents = torrents;
        convo.commandFn = () => this._search(convo);
        return this._search(convo);
      }
      logDebug(`Swiper: _download best torrent found`);
    }

    // Queue the download.
    await this._dbManager.addToQueued(media, convo.id, best);
    this._downloadManager.ping();

    return {
      data: `Queued ${getDescription(media)} for download`,
      final: true
    };
  }

  @requireVideo
  private async _search(convo: Conversation, options: SearchOptions = {}): Promise<SwiperReply> {
    logDebug(`Swiper: _search`);

    const media = convo.media as Media;
    const video = media.type === 'tv' ? media.episodes[0] : media;
    const videoMeta = await this._dbManager.addMetadata(video);

    // Perform the search and add the torrents to the conversation.
    if (!convo.torrents) {
      log(`Searching for ${getDescription(video)} downloads`);
      convo.torrents = await this._searchClient.search(video);
      convo.pageNum = 0;
    }

    // Display the torrents to the user.
    convo.pageNum = convo.pageNum || 0;

    const showPage = () => showTorrents(convo.torrents!, convo.pageNum!,
      videoMeta.magnet || undefined, videoMeta.blacklisted);

    const startIndex = settings.torrentsPerPage * convo.pageNum;
    const navs = [];
    if (startIndex > 0) {
      navs.push({value: 'prev', regex: /\bp(rev)?(ious)?\b/gi});
    }
    if (startIndex + settings.torrentsPerPage < convo.torrents.length) {
      navs.push({value: 'next', regex: /\bn(ext)?\b/gi});
    }
    const match = matchNumber(convo.input, navs);
    if (match === 'next') {
      // Go forward a page.
      convo.pageNum += 1;
      return showPage();
    } else if (match === 'prev') {
      // Go back a page.
      convo.pageNum -= 1;
      return showPage();
    } else if (match === null) {
      // No match - no change.
      return showPage();
    }

    // Matched a number
    const torrentNum = parseInt(convo.input || '', 10);
    if (!torrentNum || torrentNum <= 0 && torrentNum > convo.torrents.length) {
      // Invalid number - show torrents again.
      return showPage();
    }
    const torrent = convo.torrents[torrentNum - 1];

    // Assign the torrent magnet to the video and queue it for download.
    if (options.reassignTorrent) {
      const video = getVideo(media);
      if (!video) {
        throw new Error(`_search error: reassignTorrent option only permitted for single videos`);
      }
      await this._dbManager.setTorrent(video.id, torrent);
    } else {
      await this._dbManager.addToQueued(media, convo.id, torrent);
    }
    this._downloadManager.ping();

    return {
      data: `Queued ${getDescription(video)} for download`,
      final: true
    };
  }

  @requireVideoQuery
  private async _reassign(convo: Conversation, options: ReassignOptions = {}): Promise<SwiperReply> {
    const reply = await this._addStoredMediaIfFound(convo);
    if (reply) {
      return reply;
    }
    // In this case, stored media items should all represent a single video.
    const storedMedia: Media[]|null = convo.storedMedia || null;

    if (!storedMedia || storedMedia.length === 0) {
      // No matches or matches exhausted with all 'no's - search title.
      convo.commandFn = () => this._reassignIdentify(convo);
      return this._reassignIdentify(convo);
    }

    if (convo.input) {
      const match = matchYesNo(convo.input);
      if (match) {
        // If yes or no, shift the task to 'complete' it, then remove it from the database.
        const media: Media = storedMedia.shift()!;
        if (match === 'yes') {
          if (options.blacklist) {
            // Blacklist the torrent
            const video = getVideo(media);
            if (!video) {
              throw new Error(`_blacklist error: media item should represent a single video`);
            }
            await this._dbManager.blacklistMagnet(video.id);
          }
          // Change the command function to search on the yes-matched media item.
          convo.media = media;
          convo.commandFn = () => this._search(convo, {reassignTorrent: true});
          return this._search(media, {reassignTorrent: true});
        }
      }
    }

    // Ask about a stored media item.
    return { data: getConfirmReassignString(storedMedia[0]) };
  }

  @requireVideo
  private async _reassignIdentify(convo: Conversation, options: ReassignOptions = {}): Promise<SwiperReply> {
    const media = convo.media as Media;
    if (convo.input) {
      const match = matchYesNo(convo.input);
      if (match) {
        // If yes or no, shift the task to 'complete' it, then remove it from the database.
        if (match === 'yes') {
          if (options.blacklist) {
            // Blacklist the torrent
            const video = getVideo(media);
            if (!video) {
              throw new Error(`_blacklist error: media item should represent a single video`);
            }
            await this._dbManager.blacklistMagnet(video.id);
          }
          // Change the command function to doReassignSearch on the yes-matched media item.
          convo.commandFn = () => this._search(convo, {reassignTorrent: true});
          return this._search(media, {reassignTorrent: true});
        } else {
          // If the client says no, complete
          return {
            data: 'Ok',
            final: true
          };
        }
      }
    }
    // Ask about the media item.
    return { data: getConfirmReassignString(media) };
  }

  @requireVideoQuery
  private async _blacklist(convo: Conversation): Promise<SwiperReply> {
    convo.commandFn = () => this._reassign(convo, {blacklist: true});
    return this._reassign(convo, {blacklist: true});
  }

  @requireMedia
  private async _monitor(convo: Conversation): Promise<SwiperReply> {
    const media = convo.media as Media;
    await this._dbManager.addToMonitored(media, convo.id);
    return {
      data: `Added ${media.title} to monitored`,
      final: true
    };
  }

  private async _check(convo: Conversation): Promise<SwiperReply> {
    if (this._checkInProgress) {
      return { err: `Check is already in progress` };
    }
    this._checkInProgress = true;
    setImmediate(async () => {
      try {
        await this._swiperMonitor.doCheck();
      } finally {
        this._checkInProgress = false;
      }
    });
    return {
      data: `Checking for monitored content`,
      final: true
    };
  }

  @requireFullMedia
  private async _info(convo: Conversation): Promise<SwiperReply> {
    const media = convo.media as Media;
    if (media.type === 'movie') {
      // For movies, give release and DVD release.
      const movie = media as Movie;
      return {
        data: `${movie.title}\n` +
          `Release: ${movie.release || 'N/A'} | DVD Release: ${movie.dvd || 'N/A'}`,
        final: true
      };
    } else {
      // For shows, give how many seasons and episodes per season. Also give last and next air date.
      const show = media as Show;
      const leastOld = getLastAired(show.episodes);
      const leastNew = getNextToAir(show.episodes);
      const lastAired = leastOld ? getAiredStr(leastOld.airDate!) : '';
      const nextAirs = leastNew ? getAiredStr(leastNew.airDate!) : '';
      return {
        data: `${show.title}\n` +
          `${getEpisodesPerSeasonStr(show.episodes)}\n` +
          `${lastAired}${(lastAired && nextAirs) ? ' | ' : ''}${nextAirs}`,
        final: true
      };
    }
  }

  @requireMediaQuery
  private async _remove(convo: Conversation): Promise<SwiperReply> {
    logDebug(`Swiper: _remove`);
    const reply = await this._addStoredMediaIfFound(convo);
    if (reply) {
      return reply;
    }
    const storedMedia: Media[]|null = convo.storedMedia || null;

    if (!storedMedia) {
      // No matches.
      return { data: `Nothing matching ${convo.input} was found` };
    }

    // Ask the user about a media item if they are not all dealt with.
    if (storedMedia.length > 0 && convo.input) {
      const match = matchYesNo(convo.input);
      if (match) {
        // If yes or no, shift the task to 'complete' it, then remove it from the database.
        const media: Media = storedMedia.shift()!;
        if (match === 'yes') {
          await this._doRemove(media);
        }
      }
    }
    // If there are still items or the match failed, send a confirm string.
    if (storedMedia.length > 0) {
      return { data: getConfirmRemovalString(storedMedia[0]) };
    }

    return {
      data: `Ok`,
      final: true
    };
  }

  @requireMediaQuery
  private async _reorder(convo: Conversation): Promise<SwiperReply> {
    logDebug(`Swiper: _reorder`);
    const mediaQuery = convo.mediaQuery as MediaQuery;

    // In the case of reorder, we treat an unspecified episode list as all episodes.
    if (!mediaQuery.episodes) {
      mediaQuery.episodes = 'all';
    }

    // Add the position string.
    if (!convo.position) {
      const splitStr = (convo.input || '').split(' ');
      const lastStr = splitStr.pop();
      if (!lastStr) {
        return { data: `Specify new position: "first" or "last"` };
      }
      const [first, last] = execCapture(lastStr, /(first)|(last)/);
      if (!first && !last) {
        return { data: `Specify new position: "first" or "last"` };
      }
      convo.position = first ? 'first' : 'last';
      convo.input = splitStr.join(' ');
    }

    // Search the database for all matching Movies/Shows.
    const reply = await this._addStoredMediaIfFound(convo);
    if (reply) {
      return reply;
    }
    const storedMedia: Media[]|null = convo.storedMedia || null;
    if (!storedMedia) {
      // No matches.
      return { data: `Nothing matching ${convo.input} was found` };
    }

    // Ask the user about a media item if they are not all dealt with.
    if (storedMedia.length > 0 && convo.input) {
      const match = matchYesNo(convo.input);
      if (match) {
        // If yes or no, shift the task to 'complete' it, then remove it from the database.
        const media: Media = storedMedia.shift()!;
        if (match === 'yes') {
          await this._doReorder(media, convo.position);
        }
      }
    }
    // Ask the user about a media item if they are still not all dealt with.
    if (storedMedia.length > 0) {
      // If the match failed or if there are still more storedMedia, ask about the next one.
      return { data: getConfirmReorderString(storedMedia[0], convo.position) };
    }

    return {
      data: `Ok`,
      final: true
    };
  }

  private async _abort(convo: Conversation): Promise<SwiperReply> {
    await this._dbManager.moveAllQueuedToFailed(convo.id);
    this._downloadManager.ping();
    return {
      data: `Cancelled all queued downloads`,
      final: true
    };
  }

  private async _random(convo: Conversation): Promise<SwiperReply> {
    this._swiperMonitor.downloadRandomMovie();
    return {
      data: 'Ok',
      final: true
    };
  }

  private async _status(convo: Conversation): Promise<SwiperReply> {
    const status = await this._dbManager.getStatus();

    const monitoredStr = status.monitored.map(media => {
      if (media.type === 'movie') {
        const dvd = media.dvd && (media.dvd > getMorning());
        const dvdStr = dvd ? ` (Digital: ${media.dvd!.toDateString()})` : ` (${media.year})`;
        return ` - ${media.title}${dvdStr}`;
      } else {
        const next = getNextToAir(media.episodes);
        return ` - ${getDescription(media)}` +
          ((next && next.airDate) ? ` (${getAiredStr(next!.airDate!)})` : '');
      }
    }).join('\n');

    const downloading = status.downloading.map((video, i) => {
      const {progress, remaining, speed, peers} = this._downloadManager.getProgress(video);
      const resStr = video.resolution ? `${video.resolution} ` : ``;
      const qualStr = video.quality ? `${video.quality} ` : ``;
      const remainingStr = remaining && parseInt(remaining, 10) ? `${remaining} min left at ` : '';
      return ` ${i + 1} | ${getDescription(video)} ${resStr}${qualStr}${progress}% ` +
        `(${remainingStr}${speed}MB/s with ${peers} peers)`;
    });

    const numDownloads = status.downloading.length;
    const queued = status.queued.map((media, i) => {
      const desc = media.type === 'movie' ? media.title :
        `${getDescription(media)}`;
      return ` ${i + numDownloads + 1} | ${desc} (pending)`;
    });

    const downloadStr = [...downloading, ...queued].join('\n');

    const failedStr = status.failed.map(video => {
      return ` - ${getDescription(video)}`;
    }).join('\n');

    const strs = [];
    if (monitoredStr) {
      strs.push(`Monitoring:\n${monitoredStr}`);
    }
    if (downloadStr) {
      strs.push(`Downloading:\n${downloadStr}`);
    }
    if (failedStr) {
      strs.push(`Failed:\n${failedStr}`);
    }
    const str = strs.join('\n');
    return {
      data: str || "Nothing to report",
      final: true
    };
  }

  private _help(convo: Conversation): SwiperReply {
    if (!convo.input) {
      return {
        data: `Commands:\n` +
          `${Object.keys(commands).join(', ')}\n` +
          `"help COMMAND" for details`,
        final: true
      };
    } else {
      const cmdInfo = commands[convo.input];
      if (!cmdInfo) {
        return {
          data: `${convo.input} isn't a command`,
          final: true
        };
      } else {
        const argStr = ` ` + cmdInfo.args.join(' ');
        const contentDesc = !cmdInfo.args.includes('CONTENT') ? '' : `Where CONTENT is of the form:\n` +
          `    [movie/tv] TITLE [YEAR] [EPISODES]\n` +
          `Ex:\n` +
          `    game of thrones\n` +
          `    tv game of thrones 2011 s02\n` +
          `    game of thrones s01-03, s04e05 & e08`;
        return {
          data: `${convo.input}${argStr}: ${cmdInfo.desc}\n${contentDesc}`,
          final: true
        };
      }
    }
  }

  private _cancel(convo: Conversation): SwiperReply {
    return {
      data: `Ok`,
      final: true
    };
  }

  // Requires mediaQuery to be set.
  private async _addStoredMediaIfFound(convo: Conversation): Promise<SwiperReply|void> {
    const mediaQuery = convo.mediaQuery;
    if (!mediaQuery) {
      throw new Error(`_addStoredMediaIfFound requires mediaQuery`);
    }
    // When searching stored media, we treat an unspecified episode list as all episodes.
    if (!mediaQuery.episodes) {
      mediaQuery.episodes = 'all';
    }
    // Search the database for all matching Movies/Shows.
    if (!convo.storedMedia) {
      let mediaItems = await this._dbManager.searchTitles(mediaQuery.title, { type: mediaQuery.type });
      mediaItems = filterMediaEpisodes(mediaItems, mediaQuery.episodes);
      if (mediaItems.length > 0) {
        convo.storedMedia = mediaItems;
      }
    }
  }

  // Perform the remove action.
  private async _doRemove(media: Media): Promise<void> {
    // Remove media
    if (media.type === 'movie') {
      await this._dbManager.removeMovie(media.id);
    } else {
      await this._dbManager.removeEpisodes(media.episodes.map(e => e.id));
    }
    // After a removal, ping the download manager.
    this._downloadManager.ping();
  }

  // Perform the reorder action.
  private async _doReorder(media: Media, pos: 'first'|'last'): Promise<void> {
    // Move media
    if (media.type === 'movie') {
      await this._dbManager.changeMovieQueuePos(media.id, pos);
    } else if (media.type === 'tv') {
      await this._dbManager.changeEpisodesQueuePos(media.episodes.map(e => e.id), pos);
    }
    // After moving, ping the download manager.
    this._downloadManager.ping();
  }

  // Updates and returns the updated conversation.
  private _updateConversation(id: number, update?: {[key: string]: any}): Conversation {
    if (!this._conversations[id]) {
      this._conversations[id] = {id};
    }
    return Object.assign(this._conversations[id], update || {});
  }

  // Updates and returns the updated conversation.
  private _deleteConversation(convo: Conversation): void {
    delete this._conversations[convo.id];
  }
}

// Decorator to attach mediaQuery to the command function converation arg passed in.
function requireMediaQuery(target: any, name: string, descriptor: PropertyDescriptor) {
  createDecorator(target, descriptor, async (convo) => addMediaQuery(convo));
}

// Decorator to attach mediaQuery for a single video to the command function converation arg passed in.
function requireVideoQuery(target: any, name: string, descriptor: PropertyDescriptor) {
  createDecorator(target, descriptor, async (convo) => addMediaQuery(convo, {requireVideo: true}));
}

// Decorator to attach media to the command function converation arg passed in.
function requireMedia(target: any, name: string, descriptor: PropertyDescriptor) {
  createDecorator(target, descriptor, async (convo) => addMedia(convo));
}

function requireFullMedia(target: any, name: string, descriptor: PropertyDescriptor) {
  createDecorator(target, descriptor, async (convo) => addMedia(convo, {forceEpisodes: 'all'}));
}

function requireVideo(target: any, name: string, descriptor: PropertyDescriptor) {
  createDecorator(target, descriptor, async (convo) => addMedia(convo, {requireVideo: true}));
}

function createDecorator(
  target: any,
  descriptor: PropertyDescriptor,
  modifier: (convo: Conversation) => Promise<SwiperReply|void>
): void {
  // Saving a reference to the original method so we can call it after updating the conversation.
  const origFn = descriptor.value;
  descriptor.value = async function(convo: Conversation) {
    const reply = await modifier(convo);
    if (reply) {
      return reply;
    }
    return origFn.call(this, convo);
  };
}

function addMediaQuery(convo: Conversation, options: RequireOptions = {}): SwiperReply|void {
  if (!convo.mediaQuery) {
    let input = convo.input || '';
    const titleFinder = /^([\w \'\"\-\:\,\&]+?)(?: (?:s(?:eason)? ?\d{1,2}.*)|(?:\d{4}\b.*))?$/gi;
    const yearFinder = /\b(\d{4})\b/gi;
    const splitStr = input.split(' ');
    const keyword = splitStr[0];
    let type: MediaQuery["type"] = null;
    if (keyword === 'tv' || keyword === 'movie') {
      // If the type was included, set it and remove it from the titleStr
      type = keyword;
      input = splitStr.slice(1).join(' ');
    }
    const [title] = execCapture(input, titleFinder);
    if (!title) {
      return { err: `Can't parse content` };
    }
    const rem = removePrefix(input, title);
    const [year] = execCapture(rem, yearFinder);

    const seasonEpisodeStr = rem.trim();
    // If the seasonEpisode string was included and the type is still unknown, set it to 'tv'.
    type = type || (seasonEpisodeStr.length > 0 ? 'tv' : null);

    let episodes: EpisodesDescriptor|null = null;

    // If episodes was added as an optional argument, prioritize it.
    if (options.forceEpisodes) {
      episodes = options.forceEpisodes;
    } else if (seasonEpisodeStr.length > 0) {
      episodes = getEpisodesIdentifier(rem);
    }

    // If the type is tv and a video is required, send a prompt to get a single episode
    if (type === 'tv' && options.requireVideo) {
      if (!episodes) {
        return { data: `Specify episode:\nex: S03E02` };
      } else if (!describesSingleEpisode(episodes)) {
        return { err: `A single episode must be specified:\nex: S03E02` };
      }
    }

    convo.mediaQuery = {title, type, episodes, year};
    convo.input = '';
  }
}

// Adds a media content item to the conversation. Returns a string if Swiper requires
// more information from the user. Returns nothing on success.
async function addMedia(convo: Conversation, options: RequireOptions = {}): Promise<SwiperReply|void> {
  // If mediaQuery has not been found yet, find it.
  const reply = addMediaQuery(convo, options);
  if (reply) {
    return reply;
  }

  const mediaQuery = convo.mediaQuery as MediaQuery;

  // If media has not been found yet, find it.
  if (!convo.media) {
    const mediaResp = await identifyMedia(mediaQuery);
    if (!mediaResp.data) {
      // If the media cannot be identified, clear the conversation state.
      return {
        err: mediaResp.err!,
        final: true
      };
    }
    convo.media = mediaResp.data;
    // Clear the input since it has already been used.
    convo.input = '';
  }

  // If the media is a tv show and the episodes weren't specified, ask about them.
  if (convo.media.type === 'tv') {
    mediaQuery.episodes = mediaQuery.episodes || getEpisodesIdentifier(convo.input || '');
    if (!mediaQuery.episodes && options.requireVideo) {
      return { data: `Specify episode:\nex: S03E02` };
    } else if (!mediaQuery.episodes) {
      return { data: `Specify episodes:\n ex: new | all | S1 | S03E02-06 | S02-04 | S04E06 & 7, S05E02` };
    } else if (options.requireVideo && !describesSingleEpisode(mediaQuery.episodes)) {
      mediaQuery.episodes = null;
      return { err: `A single episode must be specified:\nex: S03E02` };
    }
    // Need to parse season episode string.
    const show = convo.media as Show;
    show.episodes = filterEpisodes(show.episodes, mediaQuery.episodes);
  }
}

// Given either a Movie or Show, create a string to confirm removal with the user.
function getConfirmRemovalString(media: Media): string {
  return `Remove ${getDescription(media)}?`;
}

// Given either a Movie or Show, create a string to confirm reassigning the torrent with the user.
function getConfirmReassignString(media: Media): string {
  return `Reassign the download file for ${getDescription(media)}?`;
}

// Given either a Movie or Show and a position, create a string to confirm reorder with the user.
function getConfirmReorderString(
  media: Media,
  pos: 'first'|'last'
): string {
  const mediaStr = getDescription(media);
  const newPosStr = pos === 'first' ? 'front' : 'end';
  return `Move ${mediaStr} to the ${newPosStr} of the queue?`;
}

// Returns a string of the form: "S01 - S04: 6 episodes, S05: 8 episodes"
function getEpisodesPerSeasonStr(episodes: Episode[]): string {
  if (episodes.length === 0) {
    return 'No episodes';
  }
  const counts: {[seasonNum: string]: number} = {};
  episodes.forEach(ep => { counts[ep.seasonNum] = counts[ep.seasonNum] ? counts[ep.seasonNum] + 1 : 1; });
  const order = Object.keys(counts).map(seasonStr => parseInt(seasonStr, 10)).sort((a, b) => a - b);
  let streakStart: number = order[0];
  let str = '';
  order.forEach((s: number, i: number) => {
    if (i > 0 && counts[s] !== counts[s - 1]) {
      str += _getStreakStr('S', streakStart, s - 1) + `: ${counts[s - 1]} episodes, `;
      streakStart = s;
    }
  });
  // Remove ending comma.
  return str.slice(0, str.length - 2);
}

// Indicates whether the EpisodesDescriptor describes a single episode.
function describesSingleEpisode(episodes: EpisodesDescriptor): boolean {
  if (episodes === 'new' || episodes === 'all') {
    return false;
  }
  const seasons = Object.keys(episodes);
  if (seasons.length !== 1) {
    return false;
  }
  return episodes[seasons[0]] !== 'all' && episodes[seasons[0]].length === 1;
}

// Takes a human-entered input of seasons and episodes of the following form:
//       'S01E01-04 & E06-E08, S03-S05, S06E02&6, S07 & S08'
// Returns a SeasonEpisodes object.
function getEpisodesIdentifier(input: string): SeasonEpisodes|'new'|'all'|null {
  const numberStr = input.replace('season', 's').replace('episode', 'e');
  if (input === 'all' || input === 'new') {
    return input;
  } else if (!input || input.match(/[^es\d\s-,&]/gi)) {
    // If there's no input or the input has unexpected characters, return null.
    return null;
  }
  const seasons: SeasonEpisodes = {};
  let lastChar: 's'|'e' = 's';
  let latestSeason: number = -1;
  let rangeStart: number = -1;
  let numStr: string = '';
  for (const c of [...numberStr, '&']) {
    if (c >= '0' && c <= '9') {
      // It's a number
      numStr += c;
    } else if (c === '-') {
      rangeStart = parseInt(numStr, 10);
      numStr = '';
    } else if (lastChar === 's' && (c === 'e' || c === '&' || c === ',')) {
      // Season numbers
      lastChar = c === 'e' ? 'e' : lastChar;
      if (numStr.length > 0) {
        latestSeason = parseInt(numStr, 10);
        if (rangeStart > -1) {
          range(rangeStart, latestSeason + 1).forEach((n: number) => { seasons[n] = 'all'; });
          rangeStart = -1;
        } else {
          seasons[latestSeason] = 'all';
        }
        numStr = '';
      }
    } else if (lastChar === 'e' && (c === 's' || c === '&' || c === ',')) {
      // Episode numbers
      lastChar = c === 's' ? 's' : lastChar;
      if (numStr.length > 0) {
        seasons[latestSeason] = seasons[latestSeason] === 'all' ? [] : seasons[latestSeason];
        const num = parseInt(numStr, 10);
        if (rangeStart > -1) {
          (seasons[latestSeason] as number[]).push(...range(rangeStart, num + 1));
          rangeStart = -1;
        } else {
          (seasons[latestSeason] as number[]).push(num);
        }
        numStr = '';
      }
    }
  }
  return seasons;
}

// Show a subset of the torrents decided by the pageNum.
function showTorrents(
  torrents: Torrent[],
  pageNum: number,
  lastMagnet: string = '',
  blacklisted: string[] = []
): SwiperReply {
  const startIndex = settings.torrentsPerPage * pageNum;
  const prev = startIndex > 0;
  const next = (startIndex + settings.torrentsPerPage) < torrents.length;
  const someTorrents = torrents.slice(startIndex, startIndex + settings.torrentsPerPage);
  const torrentRows = someTorrents.map((t, i) => {
    const repeatStr = t.magnet === lastMagnet ? ' | Previously selected' : '';
    const blacklistStr = blacklisted.includes(t.magnet) ? '(BLACKLISTED) ' : '';
    return `${startIndex + i + 1} - ${blacklistStr}${getTorrentString(t)}${repeatStr}`;
  });
  const respStr = prev && next ? `"prev" or "next"` : (next ? `"next"` : (prev ? `"prev"` : ``));
  const str = torrentRows.join(`\n`);
  return {
    data: `${str}\nGive number to download` + (respStr ? ` - ${respStr} to see more` : ``)
  };
}

// Helper for getEpisodesStr and getSeasonEpisodesStr to give a streak string.
function _getStreakStr(prefix: 'S'|'E', start: number, end: number, suffix: string = ''): string {
  return start < 0 ? '' : (start < end ? `${prefix}${padZeros(start)} - ` : '') +
    prefix + padZeros(end) + suffix;
}
