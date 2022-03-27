import ptn from 'parse-torrent-name';
import {getSearchTerm, Video} from '../common/media';
import {delay} from '../common/util';
import {Torrent} from './util';

// Typescript doesn't recognize the default export of TSA.
// tslint:disable-next-line
const torrentSearchApi = require('torrent-search-api');
torrentSearchApi.enableProvider('ThePirateBay');
torrentSearchApi.enableProvider('Rarbg');
// torrentSearchApi.enableProvider('Torrentz2');
torrentSearchApi.enableProvider('1337x');
torrentSearchApi.enableProvider('ExtraTorrent');

interface TSAResult {
  title: string;
  size: string;
  seeds: number;
  peers: number;
  time: string;
  magnet: string;
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
