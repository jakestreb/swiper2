import * as ptn from 'parse-torrent-name';
import {getSearchTerm, Video} from './media';
import {settings} from './settings';
import {delay} from './util';

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
  uploadDate: Date;
  magnetLink: string;
}

export function torrentSearch(video: Video): Promise<Torrent[]> {
  // Create a TorrentSearchApi search implementation with 1 retry default.
  const tsaSearcher = new TSA(1);
  const searchTerm = getSearchTerm(video);
  return tsaSearcher.search(searchTerm);
}

export function getTorrentString(torrent: Torrent): string {
  return `${torrent.title.replace(/\./g, ' ')} (${torrent.size}MB)\n` +
    `${torrent.seeders || '???'} seed | ${torrent.leechers || '???'} leech | ${torrent.uploadDate}`;
}

// Get download quality tier. The tiers range from 0 <-> (2 * number of quality preferences)
export function getTorrentTier(video: Video, torrent: Torrent): number {
  // Make sure the title matches.
  const videoTitle = video.type === 'movie' ? video.title : video.show.title;
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

/**
 * Any search library should be made to extend SearchImpl then added to searchers.
 */
abstract class SearchImpl {
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

// abstract class DownloadImpl {
//   constructor() {}
// }

interface TSAResult {
  title: string;
  size: string;
  seeds: number;
  peers: number;
  time: string;
  magnet: string;
}

class TSA extends SearchImpl {
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
      parsedTitle: ptn(result.title),
      size: getSizeInMB(result.size) || -1,
      seeders: result.seeds,
      leechers: result.peers,
      uploadDate: new Date(result.time),
      magnetLink: result.magnet
    };
  }
}

// Expects a string which starts with a decimal number and either GiB, MiB, or kiB
function getSizeInMB(sizeStr: string): number|null {
  const factorMap: {[prefix: string]: number} = {'g': 1000.0, 'm': 1.0, 'k': 0.001};
  const [valStr, units] = sizeStr.split(/\s/g);
  const val = parseFloat(valStr);
  if (units.length > 0 && units[0].toLowerCase() in factorMap) {
    const factor = factorMap[units[0].toLowerCase()];
    return val * factor;
  } else {
    return null;
  }
}
