import * as ptn from 'parse-torrent-name';
import * as path from 'path';
import * as rmfr from 'rmfr';
import * as WebTorrent from 'webtorrent';
import {getFileSafeTitle, getSearchTerm, Video, VideoMeta} from './media';
import {settings} from './settings';
import {logDebug, logSubProcessError} from './terminal';
import {delay} from './util';

const DOWNLOAD_ROOT = process.env.DOWNLOAD_ROOT || path.resolve(__dirname, '../downloads');

// Typescript doesn't recognize the default export of TSA.
// tslint:disable-next-line
const torrentSearchApi = require('torrent-search-api');
torrentSearchApi.enableProvider('ThePirateBay');
torrentSearchApi.enableProvider('Rarbg');
// torrentSearchApi.enableProvider('Torrentz2');
torrentSearchApi.enableProvider('1337x');
torrentSearchApi.enableProvider('ExtraTorrent');

export interface Torrent {
  title: string;
  parsedTitle: string;
  size: number; // Size in MB
  seeders: number;
  leechers: number;
  uploadTime: string;
  magnet: string;
  quality: string;
  resolution: string;
}

export interface DownloadProgress {
  progress: string;  // (0-100)
  speed: string;     // (MB/s)
  remaining: string; // (min)
  peers: number;
}

export class SearchClient {
  private _client: GenericSearchClient;
  // Array of search delay promise resolvers.
  private _searchPendingQueue: Array<() => void> = [];
  private _activeSearchCount = 0;
  private readonly _maxActiveSearches = 1;

  constructor() {
    // Create a TorrentSearchApi search implementation with 1 retry default.
    this._client = new TSA(1);
  }

  // Perform the search, delaying searches so that no more than the maxActiveSearches count occur
  // concurrently.
  public async search(video: Video): Promise<Torrent[]> {
    this._activeSearchCount += 1;
    if (this._activeSearchCount > this._maxActiveSearches) {
      await new Promise(resolve => {
        this._searchPendingQueue.push(resolve);
      });
    }
    try {
      return await this._doSearch(video);
    } finally {
      if (this._searchPendingQueue.length > 0) {
        const resolver = this._searchPendingQueue.shift()!;
        resolver();
      }
      this._activeSearchCount -= 1;
    }
  }

  private _doSearch(video: Video): Promise<Torrent[]> {
    const searchTerm = getSearchTerm(video);
    return this._client.search(searchTerm);
  }
}

export class DownloadClient {
  private _client: GenericDownloadClient;

  constructor() {
    this._client = new WT();
  }

  public download(magnet: string): Promise<string[]> {
    return this._client.download(magnet);
  }

  public getProgress(magnet: string): DownloadProgress {
    return this._client.getProgress(magnet);
  }

  public stopDownload(magnet: string): Promise<void> {
    return this._client.stopDownload(magnet);
  }

  public deleteFiles(magnet: string): Promise<void> {
    return this._client.deleteFiles(magnet);
  }

  public allDownloadsCompleted(): void {
    this._client.allDownloadsCompleted();
  }
}

export function assignMeta(video: Video|VideoMeta, torrent: Torrent): VideoMeta {
  return Object.assign(video, {
    magnet: torrent.magnet,
    quality: torrent.quality,
    resolution: torrent.resolution,
    size: torrent.size,
    blacklisted: []
  });
}

export function getTorrentString(torrent: Torrent): string {
  const seed = torrent.seeders ? `${torrent.seeders} peers ` : '';
  // const leech = torrent.leechers ? `${torrent.leechers} leech ` : '';
  return `*${torrent.title.replace(/\./g, ' ')}*\n` +
    `\`       \`_${torrent.size}MB with ${seed}_\n` +
    `\`       \`_${torrent.uploadTime}_`;
}

// Get download quality tier. The tiers range from 0 <-> (2 * number of quality preferences)
function getTorrentTier(video: VideoMeta, torrent: Torrent): number {
  // Check if any insta-reject strings match (ex. CAMRip).
  const rejected = settings.reject.find(r => Boolean(torrent.title.match(r)));
  if (rejected) { return 0; }

  // Check if the size is too big or too small.
  const sizeRule = settings.size[video.type].find(_sr => torrent.size >= _sr.min);
  const sizePoints = sizeRule ? sizeRule.points : 0;
  if (!sizePoints) { return 0; }

  // Get the quality preference index.
  const qualityPrefOrder = settings.quality[video.type];
  const qualityIndex = qualityPrefOrder.findIndex(q => Boolean(torrent.title.match(q)));
  if (qualityIndex === -1) { return 0; }

  // Check that the torrent isn't blacklisted.
  if (video.blacklisted.includes(torrent.magnet)) { return 0; }

  let score = 0;

  // Make sure the title matches.
  const wrongTitle = torrent.parsedTitle !== getFileSafeTitle(video);
  if (!wrongTitle) { score += 1.5; }

  // Prioritize minSeeders over having the best quality.
  const seederRule = settings.seeders.find(_sr => torrent.seeders >= _sr.min);
  const points = seederRule ? seederRule.points : 0;
  score += points;

  // Add a point relative to the index in the quality preference array.
  score += qualityPrefOrder.length - qualityIndex - 1;

  // Add correct size points
  score += sizePoints;

  return score;
}

// Returns the best torrent as a match to the video. Returns null if none are decided as good.
export function getBestTorrent(video: VideoMeta, torrents: Torrent[]): Torrent|null {
  let bestTorrent = null;
  let bestTier = 0;
  torrents.forEach(t => {
    const tier = getTorrentTier(video, t);
    if (tier > bestTier) {
      bestTorrent = t;
      bestTier = tier;
    }
  });
  return bestTorrent;
}

/**
 * Any search library should be made to extend SearchImpl then added to searchers.
 */
abstract class GenericSearchClient {
  constructor(public readonly retries: number) {}

  public search(searchTerm: string): Promise<Torrent[]> {
    const doRetrySearch: (retries: number) => Promise<Torrent[]> = async retries => {
      const res = await this._doSearch(searchTerm);
      if (res.length === 0 && retries > 0) {
        await delay(100);
        return doRetrySearch(retries - 1);
      } else {
        return res;
      }
    };
    return doRetrySearch(this.retries);
  }

  public abstract async _doSearch(searchTerm: string): Promise<Torrent[]>;
}

interface TSAResult {
  title: string;
  size: string;
  seeds: number;
  peers: number;
  time: string;
  magnet: string;
}

class TSA extends GenericSearchClient {
  constructor(retries: number = 3) {
    super(retries);
  }

  public async _doSearch(searchTerm: string): Promise<Torrent[]> {
    const results = await torrentSearchApi.search(searchTerm);
    const torrents: Torrent[] = results.filter((res: TSAResult) => res.title && res.magnet && res.size)
    .map((res: TSAResult) => this._createTorrent(res))
    .filter((torrent: Torrent) => torrent.size > -1);
    // Sort by peers desc
    torrents.sort((a, b) => b.seeders - a.seeders || b.leechers - a.leechers);
    return torrents;
  }

  private _createTorrent(result: TSAResult): Torrent {
    const parsed = ptn(result.title);
    return {
      title: result.title,
      parsedTitle: parsed.title,
      size: getSizeInMB(result.size) || -1,
      seeders: result.seeds || 0,
      leechers: result.peers || 0,
      uploadTime: result.time,
      magnet: result.magnet,
      quality: parsed.quality || '',
      resolution: parsed.resolution || ''
    };
  }
}

abstract class GenericDownloadClient {
  // Returns the download directory.
  public abstract async download(magnet: string): Promise<string[]>;
  public abstract getProgress(magnet: string): DownloadProgress;
  public abstract async stopDownload(magnet: string): Promise<void>;
  public abstract async deleteFiles(magnet: string): Promise<void>;
  // Indicates that all of the queued downloads have completed. Added to allow removing
  // WebTorrent instance until another download starts to avoid the library's memory leak.
  public abstract allDownloadsCompleted(): void;
}

class WT extends GenericDownloadClient {
  private _client: WebTorrent.Instance|null;

  constructor() {
    super();
  }

  // Returns the download directory.
  public async download(magnet: string): Promise<string[]> {
    logDebug(`WT: download(${magnet})`);
    return new Promise((resolve, reject) => {
      this.client.add(magnet, {path: DOWNLOAD_ROOT}, wtTorrent => {
        wtTorrent.on('done', () => {
          const filePaths = wtTorrent.files.map(f => f.path);
          wtTorrent.destroy();
          resolve(filePaths);
        });
        wtTorrent.on('error', async (err) => {
          this.deleteFiles(magnet);
          wtTorrent.destroy();
          reject(err);
        });
      });
    });
  }

  public getProgress(magnet: string): DownloadProgress {
    logDebug(`WT: getProgress(${magnet})`);
    const wtTorrent = this.client.get(magnet);
    return {
      progress: wtTorrent ? (wtTorrent.progress * 100).toPrecision(2) : '0',
      speed: wtTorrent ? (wtTorrent.downloadSpeed / (1000 * 1000)).toPrecision(2) : '0',
      remaining: wtTorrent ? Math.round(wtTorrent.timeRemaining / (60 * 1000)).toString() : '',
      peers: wtTorrent ? wtTorrent.numPeers : 0
    };
  }

  public async stopDownload(magnet: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client.remove(magnet, err => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  public async deleteFiles(magnet: string): Promise<void> {
    try {
      const wtTorrent = this.client.get(magnet);
      if (!wtTorrent) {
        throw new Error(`torrent not found from magnet`);
      }
      // Get all the paths that should be deleted.
      const paths: string[] = [];
      wtTorrent.files.forEach(file => {
        const torrentDir = file.path.split('/').shift();
        if (torrentDir) {
          const origPath = path.join(wtTorrent.path, torrentDir);
          if (!paths.includes(origPath)) {
            paths.push(origPath);
          }
        }
      });
      // Delete all the paths.
      await Promise.all(paths.map(p => rmfr(p)));
    } catch (err) {
      logSubProcessError(`Error deleting torrent files: ${err}`);
    }
  }

  public allDownloadsCompleted(): void {
    this._client = null;
  }

  // Getter ensures the existence of the WebTorrent instance
  private get client(): WebTorrent.Instance {
    // If the client has shut down, restart it.
    if (!this._client) { this._startClient(); }
    return this._client!;
  }

  private _startClient(): void {
    this._client = new WebTorrent();
    this._client.on('error', (err) => {
      logSubProcessError(`WebTorrent fatal error: ${err}`);
      this._startClient();
    });
  }
}

// Expects a string which starts with a decimal number and either GiB, MiB, or kiB
function getSizeInMB(sizeStr: string): number|null {
  const factorMap: {[prefix: string]: number} = {g: 1000.0, m: 1.0, k: 0.001};
  const [valStr, units] = sizeStr.replace(/,/g, '').split(/\s/g);
  const val = parseFloat(valStr);
  if (units.length > 0 && units[0].toLowerCase() in factorMap) {
    const factor = factorMap[units[0].toLowerCase()];
    return val * factor;
  } else {
    return null;
  }
}
