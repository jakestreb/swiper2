import ptn from 'parse-torrent-name';
import {delay, padZeros} from '../common/util';
import {getDescription} from '../common/media';
import * as log from '../common/logger';
import TorrentRanker from './helpers/TorrentRanker';
import db from '../db';

// Typescript doesn't recognize the default export of TSA.
const TorrentSearchApi = require('torrent-search-api');
TorrentSearchApi.enablePublicProviders();

interface TSAResult {
  title: string;
  size: string;
  seeds: number;
  peers: number;
  time: string;
  magnet?: string;
}

type TSAResultWithMagnet = TSAResult & {
  magnet: string
}

// TODO: If concurrent searches is a problem, add queue logic
// // Array of search delay promise resolvers.
// private _searchPendingQueue: Array<() => void> = [];
// private _activeSearchCount = 0;
// private readonly _maxActiveSearches = 1;

// // Perform the search, delaying searches so that no more than the maxActiveSearches count occur
// // concurrently.
// public async search(video: Video): Promise<TorrentResult[]> {
//   this._activeSearchCount += 1;
//   if (this._activeSearchCount > this._maxActiveSearches) {
//     await new Promise(resolve => {
//       this._searchPendingQueue.push(resolve as () => void);
//     });
//   }
//   try {
//     return await this.doSearch(video);
//   } finally {
//     if (this._searchPendingQueue.length > 0) {
//       const resolver = this._searchPendingQueue.shift()!;
//       resolver();
//     }
//     this._activeSearchCount -= 1;
//   }
// }

export default class TorrentSearch {
  public static RETRY_COUNT = 1;

  public static search(video: Video): Promise<TorrentResult[]> {
    const searchTerm = getSearchTerm(video);
    return this.doRetrySearch(searchTerm);
  }

  public static async addBestTorrent(video: Video): Promise<boolean> {
    const torrents = await this.search(video);
    const best = this.getBestTorrent(video, torrents);
    if (!best) {
      log.debug(`TorrentSearch: getBestTorrent(${getDescription(video)}) failed (no torrent found)`);
      // TODO: Schedule search
      return false;
    }
    log.debug(`TorrentSearch: getBestTorrent(${getDescription(video)}) succeeded`);
    const torrent = { ...best, status: 'paused' as TorrentStatus, videoId: video.id };
    await db.torrents.insert(torrent);
    return !!torrent;
  }

  public static getBestTorrent(video: Video, torrents: TorrentResult[]): TorrentResult|null {
    log.debug(`TorrentSearch: getBestTorrent(${getDescription(video)})`);
    let bestTorrent = null;
    let bestTier = 0;
    torrents.forEach(t => {
      const tier = new TorrentRanker(video).getScore(t);
      if (tier > bestTier) {
        bestTorrent = t;
        bestTier = tier;
      }
    });
    return bestTorrent;
  }

  private static doRetrySearch(searchTerm: string): Promise<TorrentResult[]> {
    const doRetrySearch: (retries: number) => Promise<TorrentResult[]> = async retries => {
      const res = await this.doSearch(searchTerm);
      if (res.length === 0 && retries > 0) {
        await delay(100);
        return doRetrySearch(retries - 1);
      } else {
        return res;
      }
    };
    return doRetrySearch(TorrentSearch.RETRY_COUNT);
  }

  private static async doSearch(searchTerm: string): Promise<TorrentResult[]> {
    const results: TSAResult[] = await TorrentSearchApi.search(searchTerm);
    const filtered: TSAResult[] = results.filter((res: TSAResult) => res.title && res.size);
    const filteredWithMagnet: (TSAResultWithMagnet|null)[] = await Promise.all(
      filtered.map((res: TSAResult) => this.addMissingMagnet(res))
    );
    const torrents = filteredWithMagnet.filter(notNull)
      .map((res: TSAResultWithMagnet) => this.createTorrent(res))
      .filter((torrent: TorrentResult) => torrent.sizeMb > -1);
    // Sort by peers desc
    torrents.sort((a, b) => b.seeders - a.seeders || b.leechers - a.leechers);
    return torrents;
  }

  private static async addMissingMagnet(result: TSAResult): Promise<TSAResultWithMagnet|null> {
    if (result.magnet) {
      return result as TSAResultWithMagnet;
    }
    const magnet = await TorrentSearchApi.getMagnet(result);
    if (!magnet) {
      return null;
    }
    return { ...result, magnet };
  }

  private static createTorrent(result: TSAResultWithMagnet): TorrentResult {
    const parsed = ptn(result.title);
    return {
      title: result.title,
      parsedTitle: parsed.title,
      sizeMb: getSizeInMb(result.size) || -1,
      seeders: result.seeds || 0,
      leechers: result.peers || 0,
      uploadTime: result.time,
      magnet: result.magnet,
      quality: parsed.quality || '',
      resolution: parsed.resolution || '',
    };
  }
}

function getSearchTerm(video: Video): string {
  if (video.type === 'movie') {
    const cleanTitle = video.title.replace(/\'/g, "").replace(/[^a-zA-Z ]+/g, " ");
    return `${cleanTitle} ${video.year}`;
  } else if (video.type === 'episode') {
    const cleanTitle = video.showTitle.replace(/\'/g, "").replace(/[^a-zA-Z ]+/g, " ");
    return `${cleanTitle} s${padZeros(video.seasonNum)}e${padZeros(video.episodeNum)}`;
  } else {
    throw new Error(`getSearchTerm error: invalid video`);
  }
}

// Expects a string which starts with a decimal number and either GiB, MiB, or kiB
function getSizeInMb(sizeStr: string): number|null {
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

function notNull<T>(value: T|null|undefined): value is T {
    return value !== null && value !== undefined;
}
