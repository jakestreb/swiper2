import ptn from 'parse-torrent-name';
import * as util from '../../util/index.js';
import logger from '../../util/logger.js';
import ConcurrencyLock from './helpers/ConcurrencyLock.js';
import TorrentRanker from './helpers/TorrentRanker.js';
import db from '../../db/index.js';
import PublicError from '../../util/errors/PublicError.js'

import TorrentSearchApi from 'torrent-search-api';
TorrentSearchApi.enableProvider('ThePirateBay');

interface TSAResult {
  title: string;
  size: string;
  seeds: number;
  peers: number;
  time: string;
  link?: string;
  magnet?: string;
  hash?: string;
}

type TSAResultWithHash = TSAResult & {
  hash: string;
}

export default class TorrentSearch {
  public static searchRetryCount = 2;
  public static searchConcurrency = 1;

  public static hashRegex = /(?<![\w\d])([\w\d]{32}|[\w\d]{40})(?![\w\d])/i;

  public static lock = new ConcurrencyLock(TorrentSearch.searchConcurrency);

  public static search(video: IVideo): Promise<TorrentResult[]> {
    logger.debug(`TorrentSearch.search ${video}`);
    return this.lock.acquire(() => this.doRetrySearch(video));
  }

  public static async addBestTorrent(video: IVideo, minRating: number = 1): Promise<boolean> {
    const torrents = await this.search(video);
    const best = await this.getBestTorrent(video, torrents, minRating);
    if (!best) {
      logger.debug(`TorrentSearch: getBestTorrent(${video}, ${minRating}) failed (no torrent found)`);
      return false;
    }
    logger.debug(`TorrentSearch: getBestTorrent(${video}) succeeded`);
    const torrent = {
      ...best,
      status: 'pending' as TorrentStatus,
      videoId: video.id,
      isUserPick: false,
    };
    await db.torrents.insert(torrent);
    return !!torrent;
  }

  public static async getBestTorrent(video: IVideo, torrents: TorrentResult[], minRating: number = 1): Promise<TorrentResult|null> {
    logger.debug(`TorrentSearch: getBestTorrent(${video})`);
    const ranker = new TorrentRanker(video);

    const selected = await db.torrents.getForVideo(video.id);
    const removed = await db.torrents.getWithStatus('removed');
    const selectedSet = new Set(selected.map(t => t.hash));
    const removedSet = new Set(removed.map(t => t.hash));

    const freshResults = torrents.filter(t =>
      !selectedSet.has(t.hash) && !removedSet.has(t.hash));
    const removedResults = torrents.filter(t => removedSet.has(t.hash));

    const bestFresh = util.max(freshResults, t => ranker.getScore(t));
    if (bestFresh && ranker.getStars(bestFresh) >= minRating) {
      return bestFresh;
    }

    // Re-add best removed if there are no fresh options remaining
    const bestRemoved = util.max(removedResults, t => ranker.getScore(t));
    if (bestRemoved && ranker.getStars(bestRemoved) >= minRating) {
      return bestRemoved;
    }

    return null;
  }

  private static doRetrySearch(video: IVideo): Promise<TorrentResult[]> {
    const doRetrySearch: (retries: number) => Promise<TorrentResult[]> = async retries => {
      logger.debug(`TorrentSearch: performing search for ${video}`);
      let results;
      try {
        results = await this.doSearch(video);
        if (results.length === 0 && retries > 0) {
          throw new Error('No torrents found with retries remaining');
        }
        return results;
      } catch (err) {
        logger.error(`TorrentSearch search failed: ${err}`);
        if (retries > 0) {
          await util.delay(100);
          logger.debug(`TorrentSearch: retrying search ${video}`);
          return doRetrySearch(retries - 1);
        }
        throw err;
      }
    };
    const searchPromise = doRetrySearch(TorrentSearch.searchRetryCount);
    const timeoutError = new PublicError('Torrent search timed out');
    return util.awaitWithTimeout(searchPromise, 180000, timeoutError);
  }

  private static async doSearch(video: IVideo): Promise<TorrentResult[]> {
    const searchTerm = getSearchTerm(video);
    logger.info(`Using search term: ${searchTerm}`);
    const results: TSAResult[] = await (TorrentSearchApi as any).search(searchTerm);
    logger.info(`Search result count: ${results.length}`);
    const filtered: TSAResult[] = results.filter((res: TSAResult) => res.title && res.size);
    const filteredWithHash: (TSAResultWithHash|null)[] = await Promise.all(
      filtered.map((res: TSAResult) => this.addHash(res))
    );
    const torrents = filteredWithHash.filter(notNull)
      .map((res: TSAResultWithHash) => this.createTorrent(res, video))
      .filter((torrent: TorrentResult) => torrent.sizeMb > -1);
    // Sort by peers desc
    torrents.sort((a, b) => b.score - a.score || b.seeders - a.seeders);
    return torrents;
  }

  private static async addHash(result: TSAResult): Promise<TSAResultWithHash|null> {
    let fetchedMagnet: string;
    if (!result.magnet && !result.link) {
      fetchedMagnet = await TorrentSearchApi.getMagnet(result as any);
      if (!fetchedMagnet) {
        logger.debug(`Failed to fetch magnet for torrent result: ${result.title}`);
        return null;
      }
    }
    const uri = result.magnet || result.link || fetchedMagnet!;
    const matches = uri.match(TorrentSearch.hashRegex);
    if (!matches) {
      logger.error(`No hash match for torrent: ${uri}`);
      return null;
    }
    result.hash = matches[1].toUpperCase();
    return (result as TSAResultWithHash);
  }

  private static createTorrent(result: TSAResultWithHash, video: IVideo): TorrentResult {
    const parsed = ptn(result.title);
    const partial = {
      title: result.title,
      parsedTitle: parsed.title,
      sizeMb: getSizeInMb(result.size) || -1,
      seeders: result.seeds || 0,
      leechers: result.peers || 0,
      uploadTime: result.time,
      hash: result.hash,
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
    return `${getSearchTitle(video.title)} ${video.year}`;
  } else if (video.isEpisode()) {
    return `${getSearchTitle(video.showTitle)} s${padZeros(video.seasonNum)}e${padZeros(video.episodeNum)}`;
  } else {
    throw new Error(`getSearchTerm error: invalid video`);
  }
}

function getSearchTitle(title: string): string {
  return util.normalizeTitle(title);
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
