import {commands} from './commands';
import {DBManager, ResultRow} from './DBManager';
import {filterEpisodes, getEpisodesPerSeasonStr, getEpisodeStr, getLastAired, getNextToAir} from './media';
import {Media, Movie, Show} from './media';
import {identifyMedia} from './request';
import {execCapture, getAiredStr, getMorning, matchYesNo, removePrefix, splitFirst} from './util';

const range = require('lodash/range');

// TODO: Test without search/download/monitoring.
// TODO: Add search/download.
// TODO: Test search/download.
// TODO: Add check/monitoring.
// TODO: Test check/monitoring.

// TODO: Figure out why there are so many listeners on client.add.
// TODO: Create readme (heroku address, how to check ips, etc).

type CommandFn = (input?: string) => Promise<string>|string;

interface ConversationData {
  commandFn?: CommandFn;
  mediaQuery?: MediaQuery;
  media?: Media;
  tasks?: any[];     // An array of any kind of data to be dealt with before Swiper can proceed.
  pageNum?: number;
}

// Info from the client to identify media
// All null values are treated as undetermined.
export interface MediaQuery {
  title: string,
  type: 'movie'|'tv'|null,
  episodes: EpisodesDescriptor|null,
  year: string|null
}

// Map from each desired season to an array of episode numbers or 'all'.
export type SeasonEpisodes = {[season: string]: number[]|'all'};

export type EpisodesDescriptor = SeasonEpisodes|'new'|'all';

type Conversation = ConversationData & { id: number; }

export class Swiper {

  private _dbManager: DBManager;

  private _conversations: {[id: number]: Conversation} = {};

  private _downloading = [];

  // Monitored episodes that are currently or will soon actively be searched for.
  private _upcoming = [];

  constructor(
    private _sendMsg: (id: number, msg: string) => Promise<void>
  ) {
    this._dbManager = new DBManager();
    this._dbManager.initDB()
    .catch(err => {
      console.error(`Error initializing database: ${err}`);
    });
  }

  public async handleMsg(id: number, msg?: string): Promise<void> {
    msg = msg || '';
    // Initialize the conversation if it does not exist and get the command function.
    this._updateConversation(id);
    const existingCommandFn = this._conversations[id].commandFn;
    const [command, input] = splitFirst(msg.toLowerCase());
    const commandFn = this._getCommandFn(id, command);

    // Run a new command or an existing command.
    let resp: string;
    if (commandFn) {
      this._conversations[id] = {id, commandFn};
      resp = await commandFn(input);
    } else if (existingCommandFn) {
      resp = await existingCommandFn(msg);
    } else {
      resp = `Use 'help' to see what I can do`;
    }

    // Send a response to the client.
    try {
      await this._sendMsg(id, resp);
    } catch (err) {
      // TODO: Handle send error
      console.error('Client reply error');
    }
  }

  private _getCommandFn(id: number, command: string): CommandFn|null {
    switch (command) {
      case "download":
      case "get":
        return (input?: string) => this._download(id, (input || '').trim());
      case "search":
        return (input?: string) => this._search(id, (input || '').trim());
      case "monitor":
      case "watch":
        return (input?: string) => this._monitor(id, (input || '').trim());
      case "check":
        return (input?: string) => this._check(id);
      case "info":
        return (input?: string) => this._info(id, (input || '').trim());
      case "remove":
      case "delete":
        return (input?: string) => this._remove(id, (input || '').trim());
      case "abort":
        return (input?: string) => this._abort(id);
      case "status":
      case "progress":
      case "state":
        return (input?: string) => this._status(id);
      case "help":
      case "commands":
        return (input?: string) => this._help(id, (input || '').trim());
      case "cancel":
        return (input?: string) => this._cancel(id);
      default:
        return null;
    }
  }

  private async _download(id: number, input?: string): Promise<string> {
    const resp = await this._search(id, input);
    if (resp) {
      return resp;
    }

    const convo = this._conversations[id];

    // Queue the download.
    await this._queueDownload(id, convo.media!);
  }

  private async _search(id: number, input?: string): Promise<string> {
    if (!input) {
      return `Nothing was specified`;
    }

    // Add the media item to the conversation.
    const resp = await this._addMediaToConversation(id, input);
    if (resp) {
      return resp;
    }

    // Perform the search.
    return 'TODO: Perform the search';
  }

  private async _monitor(id: number, input?: string): Promise<string> {
    if (!input) {
      return `Nothing was specified`;
    }

    // Add the media item to the conversation.
    const resp = await this._addMediaToConversation(id, input);
    if (resp) {
      return resp;
    }

    // Declare media since it is now confirmed defined.
    const media = this._conversations[id].media as Media;

    // Add the media item to monitored.
    await this._dbManager.add(media, {queue: false, monitor: true, addedBy: id});

    delete this._conversations[id];
    return `Added ${media.toString()} to monitored`;
  }

  private _check(id: number): Promise<string> {

  }

  private async _info(id: number, input?: string): Promise<string> {
    if (!input) {
      return `Nothing was specified`;
    }

    const convo = this._conversations[id];

    // Add the media item to the conversation.
    const resp = await this._addMediaToConversation(id, input, 'all');
    if (resp) {
      return resp;
    }

    const media = convo.media as Media;
    if (media.type === 'movie') {
      // For movies, give release and DVD release.
      const movie = media as Movie;
      return `${movie.title}\n` +
        `Release: ${movie.release || 'N/A'} | DVD Release: ${movie.dvd || 'N/A'}`;
    } else {
      // For shows, give how many seasons and episodes per season. Also give last and next air date.
      const show = media as Show;
      const leastOld = getLastAired(show.episodes);
      const leastNew = getNextToAir(show.episodes);
      const lastAired = leastOld ? getAiredStr(leastOld.airDate!) : '';
      const nextAirs = leastNew ? getAiredStr(leastNew.airDate!) : '';
      return `${show.title}\n` +
        `${getEpisodesPerSeasonStr(show.episodes)}\n` +
        `${lastAired}${(lastAired && nextAirs) ? '|' : ''}${nextAirs}`;
    }
  }

  private async _remove(id: number, input?: string): Promise<string> {
    if (!input) {
      return `Nothing was specified`;
    }

    const convo = this._conversations[id];

    // If mediaQuery has not been found yet, find it.
    if (!convo.mediaQuery) {
      const resp = this._addMediaQueryToConversation(id, input);
      if (resp) {
        return resp;
      }
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
        return `Nothing matching ${input} was found`;
      } else {
        // Provide the confirmation question for the first task.
        convo.tasks = rows;
        return getConfirmRemovalString(rows[0], mediaQuery.episodes);
      }
    }

    // Ask the user about a row if they are not all dealt with.
    if (convo.tasks.length > 0) {
      const match = matchYesNo(input);
      if (match) {
        // If yes or no, shift the task to 'complete' it, then remove it from the database.
        const media: ResultRow = convo.tasks.shift();
        if (match === 'yes') {
          // Remove media
          await this._dbManager.remove(media, mediaQuery.episodes);
        }
      }
      if (!match || convo.tasks.length > 0) {
        // If the match failed or if there are still more tasks, ask about the next one.
        return getConfirmRemovalString(convo.tasks[0], mediaQuery.episodes);
      }
    }

    delete this._conversations[id];
    return `Ok`;
  }

  private async _abort(id: number): Promise<string> {
    // Remove all queued downloads.
    await this._dbManager.removeAllQueued();

    return `TODO: Stop all downloads`;
  }

  private async _status(id: number): Promise<string> {
    const status = await this._dbManager.getAll();

    const monitoredStr = status.monitored.map(media => {
      if (media.type === 'movie') {
        const dvd = media.dvd && (media.dvd > getMorning());
        const dvdStr = dvd ? ` (Digital: ${media.dvd!.toDateString()})` : ` ${media.year}`;
        return `- ${media.title}${dvdStr}`;
      } else {
        const next = getNextToAir(media.episodes);
        return `- ${media.title} ${getEpisodeStr(media.episodes)}` +
          next ? ` (${getAiredStr(next!.airDate!)})` : '';
      }
    }).join('\n');
    if (!monitoredStr) {
      return "Nothing to report";
    }
    return (monitoredStr ? `\nMonitoring:\n${monitoredStr}\n` : '');
  }

  private _help(id: number, input?: string): string {
    if (!input) {
      return `Commands:\n` +
        `${Object.keys(commands).join(', ')}\n\n` +
        `"help <command>" for details`;
    } else {
      const cmdInfo = commands[input];
      if (!cmdInfo) {
        return `${input} isn't a command`;
      } else {
        const argStr = cmdInfo.arg ? ` ${cmdInfo.arg}` : ``;
        const contentDesc = cmdInfo.arg !== '<content>' ? '' : `Where <content> is of the form:\n` +
          `    (movie/tv) <title> (<year>) (season <num>) (episode <num>)\n` +
          `Ex:\n` +
          `    game of thrones\n` +
          `    tv game of thrones 2011 s02\n` +
          `    game of thrones s01-03, s04e05 & e08\n`;
        return `${input}${argStr}:  ${cmdInfo.desc}\n\n${contentDesc}`;
      }
    }
  }

  private _cancel(id: number): string {
    delete this._conversations[id];
    return `Ok`;
  }

  private async _queueDownload(id: number, media: Media): Promise<string|void> {
    // Add the item to the database.
    await this._dbManager.add(media, {queue: true, monitor: false, addedBy: id});
  }

  private _addMediaQueryToConversation(id: number, input: string): string|void {
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
      return `Can't parse download input`;
    }
    const rem = removePrefix(input, title);
    const [year] = execCapture(rem, yearFinder);
    const seasonEpisodeStr = rem.trim();
    let episodes: EpisodesDescriptor|null = null;
    if (seasonEpisodeStr.length > 0) {
      type = 'tv';
      episodes = getEpisodesIdentifier(rem);
    }
    this._conversations[id].mediaQuery = {title, type, episodes, year};
  }

  // Adds a media content item to the conversation. Returns a string if Swiper requires
  // more information from the user. Returns nothing on success.
  private async _addMediaToConversation(
    id: number,
    input: string,
    episodes?: EpisodesDescriptor
  ): Promise<string|void> {
    const convo = this._conversations[id];

    // If mediaQuery has not been found yet, find it.
    if (!convo.mediaQuery) {
      const resp = this._addMediaQueryToConversation(id, input);
      if (resp) {
        return resp;
      }
    }

    const mediaQuery = convo.mediaQuery as MediaQuery;

    // If episodes was added as an optional argument, prioritize it.
    if (episodes) {
      mediaQuery.episodes = episodes;
    }

    // If media has not been found yet, find it.
    if (!convo.media) {
      const resp = await identifyMedia(mediaQuery);
      if (!resp.data) {
        return resp.err!;
      }
      convo.media = resp.data;
    }

    // If the media is a tv show and the episodes weren't specified, ask about them.
    if (convo.media.type === 'tv' && !mediaQuery.episodes) {
      const show = convo.media as Show;
      if (!input) {
        return `Specify episodes:\n` +
          `ex: new | all | S1 | S03E02-06 | S02-04 | S04E06 & 7, S05E02`;
      } else {
        // Need to parse season episode string.
        const episodesIdentifier = getEpisodesIdentifier(input);
        mediaQuery.episodes = episodesIdentifier;
        const filtered = filterEpisodes(show.episodes, episodesIdentifier);
        show.episodes = filtered;
      }
    }
  };

  // Updates and returns the updated conversation.
  private _updateConversation(id: number, update?: ConversationData): Conversation {
    if (!this._conversations[id]) {
      this._conversations[id] = {id};
    }
    return Object.assign(this._conversations[id], update || {});
  }
}

// Given either a Movie or Show ResultRow and an episodes identifier (which is only relevant
// to Shows), create a string to confirm removal with the user.
function getConfirmRemovalString(row: ResultRow, episodes: MediaQuery["episodes"]): string {
  let preStr = '';
  let postStr = '';
  if (row.type === 'tv' && (episodes === 'all' || episodes === 'new')) {
    preStr = `${episodes} episodes of `;
  } else if (row.type === 'tv') {
    postStr = ` ${episodes}`;
  }
  const mediaStr = `${preStr}${row.title}${postStr}`;
  if (row.isQueued) {
    return `Cancel downloading ${mediaStr}?`;
  } else if (row.isMonitored) {
    return `Stop monitoring ${mediaStr}?`;
  } else {
    throw new Error(`getConfirmRemovalString error: ${row.title} is not queued or monitored`);
  }
}

// Takes a human-entered input of seasons and episodes of the following form:
//       'S01E01-04 & E06-E08, S03-S05, S06E02&6, S07 & S08'
// Returns a SeasonEpisodes object.
function getEpisodesIdentifier(input: string): SeasonEpisodes|'new'|'all' {
  if (input === 'all' || input === 'new') {
    return input;
  }
  const numberStr = input.replace('season', 's').replace('episode', 'e');
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
};
