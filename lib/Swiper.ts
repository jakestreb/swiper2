import range = require('lodash/range');
import {commands} from './commands';
import {DBManager, ResultRow} from './DBManager';
import {DownloadManager} from './DownloadManager';
import {filterEpisodes, getDescription, getLastAired, getNextToAir, getVideo} from './media';
import {Episode, Media, Movie, Show, Video} from './media';
import {identifyMedia} from './request';
import {settings} from './settings';
import {log, logDebug, logSubProcess, logSubProcessError} from './terminal';
import {getBestTorrent, getTorrentString, Torrent, TorrentClient} from './torrent';
import {delay, execCapture, getAiredStr, getDaysUntil, getMorning, getMsUntil} from './util';
import {matchNumber, matchYesNo, padZeros, removePrefix, splitFirst} from './util';

// TODO: Fix logging
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
  tasks?: any[];     // An array of any kind of data to be dealt with before Swiper can proceed.
  pageNum?: number;
}

interface AddMediaOptions {
  forceEpisodes?: EpisodesDescriptor; // Forces the episode mediaQuery argument to be as given.
  requireVideo?: boolean; // Indicates whether prompts should be given to reduce to a single video.
}

interface CommandOptions {
  catchErrors?: boolean;
}

export interface SwiperReply {
  data?: string;
  enhanced?: () => void; // Enhanced response for the terminal
  err?: string;
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

  private _torrentClient: TorrentClient;
  private _downloadManager: DownloadManager;
  private _conversations: {[id: number]: Conversation} = {};
  private _checkInProgress: boolean = false;

  // Should NOT be called publicly. User Swiper.create for building a Swiper instance.
  // Note that _dbManager should be initialized when passed in.
  constructor(
    private _sendMsg: (id: number, msg: SwiperReply) => Promise<void>,
    private _dbManager: DBManager
  ) {
    this._torrentClient = new TorrentClient();

    this._downloadManager = new DownloadManager(this._dbManager, this._torrentClient);

    this._startMonitoring();
  }

  // Should be called to build a Swiper instance.
  public static async create(sendMsg: (id: number, msg: SwiperReply) => Promise<void>): Promise<Swiper> {
    const dbManager = new DBManager();
    await dbManager.initDB();
    return new Swiper(sendMsg, dbManager);
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

    // Send a response to the client.
    await this._sendMsg(id, reply);
  }

  private async _startMonitoring(): Promise<void> {
    this._doMonitor()
    .catch(err => {
      logSubProcessError(`Monitoring process failed with error: ${err}`);
      setTimeout(() => {
        this._startMonitoring();
      }, 5000);
    });
  }

  private _getCommandFn(convo: Conversation, command: string): CommandFn|null {
    switch (command) {
      case "download":
      case "get":
        return () => this._download(convo);
      case "search":
        return () => this._search(convo);
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
        return () => this._reorder(convo);
      case "abort":
        return () => this._abort(convo);
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

  private async _download(convo: Conversation): Promise<SwiperReply> {
    logDebug(`Swiper: _download`);
    if (!convo.input) {
      return { data: `Nothing was specified` };
    }

    // Add the media item to the conversation.
    const resp = await this._addMedia(convo);
    if (resp) {
      return resp;
    }

    // Check if the media item is a single video for special handling.
    const media = convo.media as Media;
    const video: Video|null = getVideo(media);
    if (video) {
      log(`Searching for ${getDescription(video)} downloads`);
      const torrents = await this._torrentClient.search(video);
      console.warn('FINISHED SEARCH');
      const best = getBestTorrent(video, torrents);
      console.warn('FINISHED GET BEST', best);
      if (!best) {
        logDebug(`Swiper: _download failed to find torrent`);
        // If the target is a single video and an automated search failed, show the torrents.
        convo.torrents = torrents;
        return await this._search(convo);
      }
      logDebug(`Swiper: _download best torrent found`);
      // Add the torrent to the video, then continue to queue the download.
      video.magnet = best.magnet;
      await this._dbManager.addMagnet(video, best.magnet);
    }

    // Queue the download.
    await this._dbManager.addToQueued(media, convo.id)
    this._downloadManager.ping();

    this._deleteConversation(convo);
    return { data: `Queued ${getDescription(media)} for download` };
  }

  private async _search(convo: Conversation): Promise<SwiperReply> {
    logDebug(`Swiper: _search`);
    if (!convo.input) {
      return { data: `Nothing was specified` };
    }

    // Add the media item to the conversation.
    const resp = await this._addMedia(convo, { requireVideo: true });
    if (resp) {
      return resp;
    }

    const media = convo.media as Media;
    const video = media.type === 'tv' ? media.episodes[0] : media;

    // Perform the search and add the torrents to the conversation.
    if (!convo.torrents) {
      log(`Searching for ${getDescription(video)} downloads`);
      convo.torrents = await this._torrentClient.search(video);
      convo.pageNum = 0;
    }

    // Display the torrents to the user.
    convo.pageNum = convo.pageNum || 0;

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
      return showTorrents(convo.torrents, convo.pageNum);
    } else if (match === 'prev') {
      // Go back a page.
      convo.pageNum -= 1;
      return showTorrents(convo.torrents, convo.pageNum);
    } else if (match === null) {
      // No match - no change.
      return showTorrents(convo.torrents, convo.pageNum);
    }

    // Matched a number
    const torrentNum = parseInt(convo.input, 10);
    if (!torrentNum || torrentNum <= 0 && torrentNum > convo.torrents.length) {
      // Invalid number - show torrents again.
      return showTorrents(convo.torrents, convo.pageNum);
    }
    const torrent = convo.torrents[torrentNum - 1];

    // Assign the torrent magnet to the video and queue it for download.
    video.magnet = torrent.magnet;
    await this._dbManager.addToQueued(media, convo.id);
    this._downloadManager.ping();

    this._deleteConversation(convo);
    return { data: `Queued ${getDescription(video)} for download` };
  }

  private async _monitor(convo: Conversation): Promise<SwiperReply> {
    if (!convo.input) {
      return { data: `Nothing was specified` };
    }

    // Add the media item to the conversation.
    const resp = await this._addMedia(convo);
    if (resp) {
      return resp;
    }

    // Declare media since it is now confirmed defined.
    const media = convo.media as Media;

    // Add the media item to monitored.
    await this._dbManager.addToMonitored(media, convo.id);

    this._deleteConversation(convo);
    return { data: `Added ${media.title} to monitored` };
  }

  private async _check(convo: Conversation): Promise<SwiperReply> {
    if (this._checkInProgress) {
      return { err: `Check is already in progress` };
    }
    this._checkInProgress = true;
    setImmediate(async () => {
      try {
        await this._doCheck();
      } finally {
        this._checkInProgress = false;
      }
    });

    this._deleteConversation(convo);
    return { data: `Checking for monitored content` };
  }

  private async _info(convo: Conversation): Promise<SwiperReply> {
    if (!convo.input) {
      return { err: `Nothing was specified` };
    }

    // Add the media item to the conversation.
    const resp = await this._addMedia(convo, {forceEpisodes: 'all'});
    if (resp) {
      return resp;
    }

    const media = convo.media as Media;

    // Once media is used, clear the conversation state.
    this._deleteConversation(convo);

    if (media.type === 'movie') {
      // For movies, give release and DVD release.
      const movie = media as Movie;
      return {
        data: `${movie.title}\n` +
          `Release: ${movie.release || 'N/A'} | DVD Release: ${movie.dvd || 'N/A'}`
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
          `${lastAired}${(lastAired && nextAirs) ? ' | ' : ''}${nextAirs}`
      };
    }
  }

  private async _remove(convo: Conversation): Promise<SwiperReply> {
    logDebug(`Swiper: _remove`);
    if (!convo.input) {
      return { data: `Nothing was specified` };
    }

    // If mediaQuery has not been found yet, find it.
    const resp = this._addMediaQuery(convo);
    if (resp) {
      return resp;
    }

    const mediaQuery = convo.mediaQuery as MediaQuery;

    // In the case of removal, we treat an unspecified episode list as all episodes.
    if (!mediaQuery.episodes) {
      mediaQuery.episodes = 'all';
    }

    // Search the database for all matching Movies/Shows.
    if (!convo.tasks) {
      const rows = await this._dbManager.searchTitles(mediaQuery.title, { type: mediaQuery.type });
      if (rows.length === 0) {
        return { data: `Nothing matching ${convo.input} was found` };
      } else {
        // Provide the confirmation question for the first task.
        convo.tasks = rows;
        return { data: getConfirmRemovalString(rows[0], mediaQuery.episodes) };
      }
    }

    // Ask the user about a row if they are not all dealt with.
    if (convo.tasks.length > 0) {
      const match = matchYesNo(convo.input);
      if (match) {
        // If yes or no, shift the task to 'complete' it, then remove it from the database.
        const media: ResultRow = convo.tasks.shift();
        if (match === 'yes') {
          // Remove media
          if (media.type === 'movie') {
            await this._dbManager.removeMovie(media.id);
          } else {
            await this._dbManager.removeEpisodesByDescriptor(media.id, mediaQuery.episodes);
          }
          // After a removal, ping the download manager.
          this._downloadManager.ping();
        }
      }
      if (!match || convo.tasks.length > 0) {
        // If the match failed or if there are still more tasks, ask about the next one.
        return { data: getConfirmRemovalString(convo.tasks[0], mediaQuery.episodes) };
      }
    }

    this._deleteConversation(convo);
    return { data: `Ok` };
  }

  private async _reorder(convo: Conversation): Promise<SwiperReply> {
    if (!convo.input) {
      return { data: `Nothing was specified` };
    }

    if (!convo.position) {
      const splitStr = convo.input.split(' ');
      const lastStr = splitStr.pop();
      if (!lastStr) {
        return { data: `Specifiy the new position as "first" or "last"` };
      }
      const [first, last] = execCapture(lastStr, /(first)|(last)/);
      if (!first && !last) {
        return { data: `Specifiy the new position as "first" or "last"` };
      }
      convo.position = first ? 'first' : 'last';
      convo.input = splitStr.join(' ');
    }

    // If mediaQuery has not been found yet, find it.
    const resp = this._addMediaQuery(convo);
    if (resp) {
      return resp;
    }

    const mediaQuery = convo.mediaQuery as MediaQuery;

    // Search the database for all matching Movies/Shows.
    if (!convo.tasks) {
      const rows = await this._dbManager.searchTitles(mediaQuery.title, { type: mediaQuery.type });
      if (rows.length === 0) {
        return { data: `Nothing matching ${convo.input} was found` };
      } else {
        // Provide the confirmation question for the first task.
        convo.tasks = rows;
        return { data: getConfirmReorderString(rows[0], convo.position) };
      }
    }

    // Ask the user about a row if they are not all dealt with.
    if (convo.tasks.length > 0) {
      const match = matchYesNo(convo.input);
      if (match) {
        // If yes or no, shift the task to 'complete' it, then remove it from the database.
        const media: ResultRow = convo.tasks.shift();
        if (match === 'yes') {
          // Remove media
          await this._dbManager.changeQueuePos(media, convo.position);
          this._downloadManager.ping();
        }
      }
      if (!match || convo.tasks.length > 0) {
        // If the match failed or if there are still more tasks, ask about the next one.
        return { data: getConfirmReorderString(convo.tasks[0], convo.position) };
      }
    }

    this._deleteConversation(convo);
    return { data: `Ok` };
  }

  private async _abort(convo: Conversation): Promise<SwiperReply> {
    // Remove all queued downloads.
    await this._dbManager.moveAllQueuedToFailed(convo.id);
    this._downloadManager.ping();

    this._deleteConversation(convo);
    return { data: `Cancelled all queued downloads` };
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
        return ` - ${media.title} ${getExpandedEpisodeStr(media.episodes)}` +
          ((next && next.airDate) ? ` (${getAiredStr(next!.airDate!)})` : '');
      }
    }).join('\n');

    const downloadStr = status.downloading.map((video, i) => {
      const {progress, remaining, speed, peers} = this._downloadManager.getProgress(video)
      const remainingStr = remaining && parseInt(remaining, 10) ? `${remaining} min left at ` : '';
      return ` ${i + 1}- ${getDescription(video)} ${progress}% ` +
        `(${remainingStr}${speed}MB/s with ${peers} peers)`;
    }).join('\n');

    const numDownloads = status.downloading.length;
    const queuedStr = status.queued.map((media, i) => {
      const desc = media.type === 'movie' ? media.title :
        `${media.title} ${getExpandedEpisodeStr(media.episodes)}`
      return ` ${i + numDownloads + 1}- ${desc} (pending)`;
    }).join('\n');

    const failedStr = status.failed.map(video => {
      return ` - ${getDescription(video)}`;
    }).join('\n');

    const strs = [];
    if (monitoredStr) {
      strs.push(`Monitoring:\n${monitoredStr}`);
    }
    if (downloadStr || queuedStr) {
      strs.push(`Downloading:\n${downloadStr}${queuedStr}`);
    }
    if (failedStr) {
      strs.push(`Failed:\n${failedStr}`);
    }
    const str = strs.join('\n');

    this._deleteConversation(convo);
    if (!str) {
      return { data: "Nothing to report" };
    }
    return {
      data: str
    };
  }

  private _help(convo: Conversation): SwiperReply {
    this._deleteConversation(convo);
    if (!convo.input) {
      return {
        data: `Commands:\n` +
          `${Object.keys(commands).join(', ')}\n` +
          `"help COMMAND" for details`
      };
    } else {
      const cmdInfo = commands[convo.input];
      if (!cmdInfo) {
        return { data: `${convo.input} isn't a command` };
      } else {
        const argStr = ` ` + cmdInfo.args.join(' ');
        const contentDesc = cmdInfo.args.includes('CONTENT') ? `Where CONTENT is of the form:\n` : '' +
          `    [movie/tv] TITLE [YEAR] [EPISODES]\n` +
          `Ex:\n` +
          `    game of thrones\n` +
          `    tv game of thrones 2011 s02\n` +
          `    game of thrones s01-03, s04e05 & e08`;
        return { data: `${convo.input}${argStr}: ${cmdInfo.desc}\n${contentDesc}` };
      }
    }
  }

  private _cancel(convo: Conversation): SwiperReply {
    this._deleteConversation(convo);
    return { data: `Ok` };
  }

  private async _scheduleEpisodeChecks(): Promise<void> {
    const shows = await this._dbManager.getMonitoredShows();
    // Create one array of episodes with scheduled air dates only.
    const episodes = ([] as Episode[]).concat(...shows.map(s => s.episodes));
    episodes.forEach(ep => { this._doBackoffCheckEpisode(ep); })
  }

  private async _doBackoffCheckEpisode(episode: Episode): Promise<void> {
    if (!episode.airDate) {
      return;
    }
    const backoff = settings.newEpisodeBackoff;
    const now = new Date();
    // Difference in ms between now and the release date.
    const msPast = now.valueOf() - episode.airDate.valueOf();
    console.warn('msPast', msPast);
    let acc = 0;
    for (let i = 0; msPast > acc && i < backoff.length; i++) {
      acc += backoff[i] * 60 * 1000;
    }
    if (msPast > acc) {
      // Repeat search array has ended.
      return;
    }
    // Delay until the next check time.
    await delay(acc - msPast);
    // If the episode is still in the monitored array, look for it and repeat on failure.
    try {
      const copy = await this._dbManager.getEpisode(episode);
      if (copy && copy.isMonitored) {
        setImmediate(async () => {
          this._doSearch(episode, {catchErrors: true});
          // After searching, always delay 1 minute before re-scheduling to prevent an endless loop.
          await delay(60 * 1000);
          this._doBackoffCheckEpisode(episode);
        });
      }
    } catch (err) {
      logSubProcessError(`_doBackoffCheckEpisode error: ${err}`);
    }
  }

  /**
   * The monitoring process, which should be started and made to log and restart in case of errors.
   */
  private async _doMonitor(): Promise<void> {
    logSubProcess(`Monitoring started`);
    while (true) {
      // Episodes are released at predictable times, so their checks are individually scheduled.
      await this._scheduleEpisodeChecks();
      // Wait until the daily time given in settings to search for monitored items.
      await delay(getMsUntil(settings.monitorAt));
      await this._doCheck({catchErrors: true});
    }
  }

  // Perform automated searched for all released monitored items.
  private async _doCheck(options: CommandOptions = {}): Promise<void> {
    try {
      const now = new Date();
      const monitored = await this._dbManager.getMonitored();
      const videos = ([] as Video[]).concat(...monitored.map(media =>
        media.type === 'movie' ? [media] : media.episodes
      ));
      // Decide which media items should be searched.
      const released = videos.filter(vid => {
        if (vid.type === 'movie') {
          const daysUntilDVD = vid.dvd ? getDaysUntil(vid.dvd) : 0;
          return daysUntilDVD <= settings.daysBeforeDVD;
        } else {
          return vid.airDate && now > vid.airDate;
        }
      });
      const searches = released.map(vid => this._doSearch(vid, options));
      await Promise.all(searches);
    } catch (err) {
      if (options.catchErrors) {
        logSubProcessError(`_doCheck error: ${err}`);
      } else {
        throw err;
      }
    }
  }

  // Perform an automated search for an item and download it if it's found. Give no prompts to the
  // user if the video is not found.
  private async _doSearch(video: Video, options: CommandOptions = {}): Promise<void> {
    logSubProcess(`Searching ${getDescription(video)}`);
    try {
      const torrents: Torrent[] = await this._torrentClient.search(video);
      const bestTorrent = getBestTorrent(video, torrents);
      if (bestTorrent !== null) {
        // Set the item in the database to queued.
        await this._dbManager.moveToQueued(video);
        this._downloadManager.ping();
      } else {
        logSubProcess(`${getDescription(video)} not found`);
      }
    } catch (err) {
      if (options.catchErrors) {
        logSubProcess(`_doSearch ${getDescription(video)} error: ${err}`);
      } else {
        throw err;
      }
    }
  }

  private _addMediaQuery(convo: Conversation): SwiperReply|void {
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
        return { err: `Can't parse download input` };
      }
      const rem = removePrefix(input, title);
      const [year] = execCapture(rem, yearFinder);
      const seasonEpisodeStr = rem.trim();
      let episodes: EpisodesDescriptor|null = null;
      if (seasonEpisodeStr.length > 0) {
        type = 'tv';
        episodes = getEpisodesIdentifier(rem);
      }
      convo.mediaQuery = {title, type, episodes, year};
      convo.input = '';
    }
  }

  // Adds a media content item to the conversation. Returns a string if Swiper requires
  // more information from the user. Returns nothing on success.
  private async _addMedia(convo: Conversation, options: AddMediaOptions = {}): Promise<SwiperReply|void> {
    // If mediaQuery has not been found yet, find it.
    const resp = this._addMediaQuery(convo);
    if (resp) {
      return resp;
    }

    const mediaQuery = convo.mediaQuery as MediaQuery;

    // If episodes was added as an optional argument, prioritize it.
    if (options.forceEpisodes) {
      mediaQuery.episodes = options.forceEpisodes;
    }

    // If media has not been found yet, find it.
    if (!convo.media) {
      const resp = await identifyMedia(mediaQuery);
      if (!resp.data) {
        return { err: resp.err! };
      }
      convo.media = resp.data;
      // Clear the input since it has already been used.
      convo.input = '';
    }

    // If the media is a tv show and the episodes weren't specified, ask about them.
    if (convo.media.type === 'tv') {
      mediaQuery.episodes = mediaQuery.episodes || getEpisodesIdentifier(convo.input || '');
      if (!mediaQuery.episodes && options.requireVideo) {
        return { data: `Specify episode:\nex: S03E02` };
      } else if (!mediaQuery.episodes) {
        return {
          data: `Specify episodes:\n` +
            `ex: new | all | S1 | S03E02-06 | S02-04 | S04E06 & 7, S05E02`
        };
      } else if (options.requireVideo && !describesSingleEpisode(mediaQuery.episodes)) {
        mediaQuery.episodes = null;
        return { err: `A single episode must be specified:\nex: S03E02` };
      }
      // Need to parse season episode string.
      const show = convo.media as Show;
      show.episodes = filterEpisodes(show.episodes, mediaQuery.episodes);
    }
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

// Given either a Movie or Show ResultRow and an episodes identifier (which is only relevant
// to Shows), create a string to confirm removal with the user.
function getConfirmRemovalString(row: ResultRow, episodes: SeasonEpisodes|"new"|"all"): string {
  let preStr = '';
  let postStr = '';
  if (row.type === 'tv' && (episodes === 'all' || episodes === 'new')) {
    preStr = `${episodes} episodes of `;
  } else if (row.type === 'tv') {
    postStr = ` ${getSeasonEpisodesStr(episodes as SeasonEpisodes)}`;
  }
  const mediaStr = `${preStr}${row.title}${postStr}`;
  if (row.queuePos) {
    return `Cancel downloading and remove ${mediaStr}?`;
  } else if (row.isMonitored) {
    return `Stop monitoring ${mediaStr}?`;
  } else if (row.failedAt) {
    return `Remove ${mediaStr} from failed?`;
  } else {
    // Generic response for tv.
    return `Remove ${mediaStr}?`;
  }
}

// Given either a Movie or Show ResultRow and a position, create a string to confirm reorder
// with the user.
function getConfirmReorderString(row: ResultRow, pos: 'first'|'last'): string {
  const newPosStr = pos === 'first' ? 'front' : 'back';
  if (row.queuePos) {
    return `Move ${row.title} to the ${newPosStr} of the queue?`;
  } else {
    throw new Error(`getConfirmReorderString error: ${row.title} is not queued`);
  }
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

/**
 * Returns a string giving all seasons and episodes for a show already fetched from TVDB.
 */
function getExpandedEpisodeStr(episodes: Episode[]): string {
  let str = "";
  let chain = 0;
  let lastEpisode = -1;
  let lastSeason = -1;
  episodes.forEach((episode: Episode, i: number) => {
    const si = episode.seasonNum;
    const ei = episode.episodeNum;
    if (lastSeason === -1 && lastEpisode === -1) {
      str += `S${padZeros(si)}E${padZeros(ei)}`;
    } else if (si > lastSeason) {
      // New season
      str += `-${padZeros(lastEpisode)}, S${padZeros(si)}E${padZeros(ei)}`;
      chain = 0;
    } else if (si === lastSeason && (ei > lastEpisode + 1)) {
      // Same season, later episode
      str += `${chain > 1 ?
        `-${padZeros(lastEpisode)}` : ``} & E${padZeros(ei)}`;
      chain = 0;
    } else if (i === episodes.length - 1) {
      // Last episode
      str += `-${padZeros(ei)}`;
    } else {
      chain++;
    }
    lastSeason = si;
    lastEpisode = ei;
  });
  return str;
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
function showTorrents(torrents: Torrent[], pageNum: number): SwiperReply {
  const startIndex = settings.torrentsPerPage * pageNum;
  const prev = startIndex > 0;
  const next = (startIndex + settings.torrentsPerPage) < torrents.length;
  const someTorrents = torrents.slice(startIndex, startIndex + settings.torrentsPerPage);
  const torrentRows = someTorrents.map((t, i) => `${startIndex + i + 1} - ${getTorrentString(t)}`);
  const respStr = prev && next ? `"prev" or "next"` : (next ? `"next"` : (prev ? `"prev"` : ``));
  const str = torrentRows.join(`\n`);
  return {
    data: `${str}\nGive number to download` + (respStr ? ` - ${respStr} to see more` : ``)
  };
}

// Parses a SeasonEpisodes object back into a human readable string.
function getSeasonEpisodesStr(episodes: SeasonEpisodes): string {
  const order = Object.keys(episodes).map(seasonStr => parseInt(seasonStr, 10)).sort((a, b) => a - b);
  if (order.length === 0) {
    throw new Error(`Invalid SeasonEpisodes object: ${episodes}`);
  }

  let allStreakStart: number = order[0];
  let str = '';

  order.forEach((s: number, i: number) => {
    const epArr = episodes[s];
    const seasonEpStr = epArr === 'all' ? 'all' : _getEpisodeNumStr(epArr);
    // If the season is a streak killer
    if (i > 0 && ((s - order[i - 1]) > 1 || seasonEpStr !== 'all')) {
      // Update the string with the streak and clear the streak.
      str += _getStreakStr('S', allStreakStart, order[i - 1], ', ');
      allStreakStart = -1;
    }
    if (seasonEpStr === 'all') {
      // This starts a new streak if one isn't already started.
      allStreakStart = allStreakStart === -1 ? s : allStreakStart;
      // If this is the last season, end the streak.
      str += (i === order.length - 1) ? _getStreakStr('S', allStreakStart, s, ', ') : '';
    } else {
      // Seasons with episodes can be added right away.
      str += `S${padZeros(s)}${seasonEpStr}, `;
    }
  });

  // Remove ending comma.
  return str.slice(0, str.length - 2);
}

// Helper for getSeasonEpisodesStr to handle the episodes in a single season.
function _getEpisodeNumStr(episodes: number[]): string {
  if (episodes.length === 0) {
    throw new Error(`Invalid episodes array: ${episodes}`);
  }
  let streakStart: number = episodes[0];
  let str = '';
  episodes.forEach((e: number, i: number) => {
    // If the streak is ending
    if (i > 0 && (e - episodes[i - 1] > 1)) {
      str += _getStreakStr('E', streakStart, episodes[i - 1], ' & ');
      streakStart = e;
    }
    if (i === episodes.length - 1) {
      str += _getStreakStr('E', streakStart, e);
    }
  });
  return str.slice(0, str.length);
}

// Helper for getEpisodesStr and getSeasonEpisodesStr to give a streak string.
function _getStreakStr(prefix: 'S'|'E', start: number, end: number, suffix: string = ''): string {
  return start < 0 ? '' : (start < end ? `${prefix}${padZeros(start)} - ` : '') +
    prefix + padZeros(end) + suffix;
}
