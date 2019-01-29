import * as ptn from 'parse-torrent-name';
import * as path from 'path';
import * as rmfr from 'rmfr';
import * as WebTorrent from 'webtorrent';
import {getSearchTerm, Video} from './media';
import {settings} from './settings';
import {logSubProcessError} from './terminal';
import {delay} from './util';

const DOWNLOAD_ROOT = process.env.DOWNLOAD_ROOT;

// Typescript doesn't recognize the default export of TSA.
const torrentSearchApi = require('torrent-search-api');
// this._torrentSearch.enableProvider('ThePirateBay');
torrentSearchApi.enableProvider('Rarbg');
torrentSearchApi.enableProvider('Torrentz2');
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
}

export class TorrentClient {
  private _searchClient: SearchClient;
  private _downloadClient: DownloadClient;

  constructor() {
    this._searchClient = new TSA(1);
    this._downloadClient = new WT();
  }

  public search(video: Video): Promise<Torrent[]> {
    // Create a TorrentSearchApi search implementation with 1 retry default.
    const searchTerm = getSearchTerm(video);
    return this._searchClient.search(searchTerm);
  }

  public download(magnet: string): Promise<void> {
    return this._downloadClient.download(magnet);
  }

  public stopDownload(magnet: string): Promise<void> {
    return this._downloadClient.stopDownload(magnet);
  }
}


export function getTorrentString(torrent: Torrent): string {
  const seed = torrent.seeders ? `${torrent.seeders} seed | ` : '';
  const leech = torrent.leechers ? `${torrent.leechers} leech | ` : '';
  return `${torrent.title.replace(/\./g, ' ')} (${torrent.size}MB)\n` +
    `      ${seed}${leech}${torrent.uploadTime}`;
}

// Get download quality tier. The tiers range from 0 <-> (2 * number of quality preferences)
function getTorrentTier(video: Video, torrent: Torrent): number {
  // Make sure the title matches.
  const videoTitle = video.type === 'movie' ? video.title : video.show.title;
  // console.warn('!!!', torrent.parsedTitle, videoTitle.replace(/[\\/:*?"<>|']/g, ''));
  const wrongTitle = torrent.parsedTitle !== videoTitle.replace(/[\\/:*?"<>|']/g, '');
  if (wrongTitle) {
    return 0;
  }
  // Check if any insta-reject strings match (ex. CAMRip).
  const rejected = settings.reject.find(r => Boolean(torrent.title.match(r)));
  if (rejected) {
    return 0;
  }
  // Check if the size is too big or too small.
  const sizeBounds = settings.size[video.type];
  const goodSize = torrent.size >= sizeBounds.min && torrent.size <= sizeBounds.max;
  if (!goodSize) {
    return 0;
  }
  // Get the quality preference index.
  const qualityPrefOrder = settings.quality[video.type];
  const qualityIndex = qualityPrefOrder.findIndex(q => Boolean(torrent.title.match(q)));
  if (qualityIndex === -1) {
    return 0;
  }
  // Prioritize minSeeders over having the best quality.
  const hasMinSeeders = torrent.seeders >= settings.minSeeders;
  return (hasMinSeeders ? qualityPrefOrder.length : 0) + (qualityPrefOrder.length - qualityIndex);
}

// Returns the best torrent as a match to the video. Returns null if none are decided as good.
export function getBestTorrent(video: Video, torrents: Torrent[]): Torrent|null {
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
abstract class SearchClient {
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

class TSA extends SearchClient {
  constructor(retries: number = 3) {
    super(retries);
  }

  public async _doSearch(searchTerm: string): Promise<Torrent[]> {
    const results = await torrentSearchApi.search(searchTerm);
    return results
    .map((res: TSAResult) => this._createTorrent(res))
    .filter((torrent: Torrent) => torrent.size > -1);
  }

  private _createTorrent(result: TSAResult): Torrent {
    return {
      title: result.title,
      parsedTitle: ptn(result.title).title,
      size: getSizeInMB(result.size) || -1,
      seeders: result.seeds,
      leechers: result.peers,
      uploadTime: result.time,
      magnet: result.magnet
    };
  }
}

abstract class DownloadClient {
  constructor() {}
  public abstract async download(magnet: string): Promise<void>;
  public abstract async stopDownload(magnet: string): Promise<void>;
}

class WT extends DownloadClient {
  private _client: WebTorrent.Instance;

  constructor() {
    super();
    this._startClient();
  }

  public async download(magnet: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this._client.add(magnet, { path: DOWNLOAD_ROOT }, wtTorrent => {
        wtTorrent.once('done', () => {
          resolve();
        });
        wtTorrent.on('error', async (err) => {
          this._removeDownloadFiles(wtTorrent);
          reject(err);
        });
      });
    });
  }

  public async stopDownload(magnet: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this._client.remove(magnet, err => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  private async _removeDownloadFiles(wtTorrent: WebTorrent.Torrent): Promise<void> {
    try {
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
  const factorMap: {[prefix: string]: number} = {'g': 1000.0, 'm': 1.0, 'k': 0.001};
  const [valStr, units] = sizeStr.replace(/,/g, '').split(/\s/g);
  const val = parseFloat(valStr);
  if (units.length > 0 && units[0].toLowerCase() in factorMap) {
    const factor = factorMap[units[0].toLowerCase()];
    return val * factor;
  } else {
    return null;
  }
}
