import ptn from 'parse-torrent-name';
import * as util from '../util';
import * as log from '../log';
import ConcurrencyLock from './helpers/ConcurrencyLock';
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

export default class TorrentSearch {
  public static searchRetryCount = 2;
  public static searchConcurrency = 1;

  public static lock = new ConcurrencyLock(TorrentSearch.searchConcurrency);

  public static search(video: IVideo): Promise<TorrentResult[]> {
    log.debug(`TorrentSearch.search ${video}`);
    return this.lock.acquire(() => this.doRetrySearch(video));
  }

  public static async addBestTorrent(video: IVideo): Promise<boolean> {
    const torrents = await this.search(video);
    const best = await this.getBestTorrent(video, torrents);
    if (!best) {
      log.debug(`TorrentSearch: getBestTorrent(${video}) failed (no torrent found)`);
      return false;
    }
    log.debug(`TorrentSearch: getBestTorrent(${video}) succeeded`);
    const torrent = { ...best, status: 'paused' as TorrentStatus, videoId: video.id };
    await db.torrents.insert(torrent);
    return !!torrent;
  }

  public static async getBestTorrent(video: IVideo, torrents: TorrentResult[]): Promise<TorrentResult|null> {
    log.debug(`TorrentSearch: getBestTorrent(${video})`);
    const videoTorrents = await db.torrents.getForVideo(video.id);
    const removed = videoTorrents.filter(t => t.status === 'removed');
    const badMagnets = new Set(removed.map(t => t.magnet));

    let bestTorrent = null;
    let bestTier = 0;
    torrents
      .filter(t => !badMagnets.has(t.magnet))
      .forEach(t => {
        const tier = new TorrentRanker(video).getScore(t);
        if (tier > bestTier) {
          bestTorrent = t;
          bestTier = tier;
        }
      });

    return bestTorrent;
  }

  private static doRetrySearch(video: IVideo): Promise<TorrentResult[]> {
    const doRetrySearch: (retries: number) => Promise<TorrentResult[]> = async retries => {
      log.debug(`TorrentSearch: performing search for ${video}`);
      let results;
      try {
        results = await this.doSearch(video);
        if (results.length === 0 && retries > 0) {
          throw new Error('No torrents found with retries remaining');
        }
        return results;
      } catch (err) {
        log.error(`TorrentSearch search failed: ${err}`);
        if (retries > 0) {
          await util.delay(100);
          log.debug(`TorrentSearch: retrying search ${video}`);
          return doRetrySearch(retries - 1);
        }
        throw err;
      }
    };
    return doRetrySearch(TorrentSearch.searchRetryCount);
  }

  private static async doSearch(video: IVideo): Promise<TorrentResult[]> {
    const searchTerm = getSearchTerm(video);
    const results: TSAResult[] = await TorrentSearchApi.search(searchTerm);
    console.warn('RESULTS', results.slice(0, 3));
    const filtered: TSAResult[] = results.filter((res: TSAResult) => res.title && res.size);
    const filteredWithMagnet: (TSAResultWithMagnet|null)[] = await Promise.all(
      filtered.map((res: TSAResult) => this.addMissingMagnet(res))
    );
    const torrents = filteredWithMagnet.filter(notNull)
      .map((res: TSAResultWithMagnet) => this.createTorrent(res, video))
      .filter((torrent: TorrentResult) => torrent.sizeMb > -1);
    // Sort by peers desc
    torrents.sort((a, b) => b.score - a.score || b.seeders - a.seeders);
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

  private static createTorrent(result: TSAResultWithMagnet, video: IVideo): TorrentResult {
    const parsed = ptn(result.title);
    const partial = {
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
    return {
      ...partial,
      score: new TorrentRanker(video).getScore(partial),
      starRating: new TorrentRanker(video).getStars(partial),
    };
  }
}

function getSearchTerm(video: IVideo): string {
  if (video.isMovie()) {
    const cleanTitle = video.title.replace(/\'/g, "").replace(/[^a-zA-Z ]+/g, " ");
    return `${cleanTitle} ${video.year}`;
  } else if (video.isEpisode()) {
    const cleanTitle = video.showTitle.replace(/\'/g, "").replace(/[^a-zA-Z ]+/g, " ");
    return `${cleanTitle} s${padZeros(video.seasonNum)}e${padZeros(video.episodeNum)}`;
  } else {
    throw new Error(`getSearchTerm error: invalid video`);
  }
}

// Expects a string which starts with a decimal number and either GiB, MiB, or kiB
function getSizeInMb(sizeStr: string): number|null {
  const factorMap: {[prefix: string]: number} = {g: 1024.0, m: 1.0, k: 0.00097656};
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

function padZeros(int: number): string {
  return ('00' + int).slice(-2);
}
