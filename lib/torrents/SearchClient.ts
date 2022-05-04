import ptn from 'parse-torrent-name';
import {getSearchTerm} from '../common/media';
import {delay} from '../common/util';

// Typescript doesn't recognize the default export of TSA.
// tslint:disable-next-line
const TorrentSearchApi = require('torrent-search-api');
TorrentSearchApi.enablePublicProviders();
// torrentSearchApi.enableProvider('ThePirateBay');
// torrentSearchApi.enableProvider('Rarbg');
// torrentSearchApi.enableProvider('Torrentz2');
// torrentSearchApi.enableProvider('1337x');
// torrentSearchApi.enableProvider('ExtraTorrent');

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
  public async search(video: Video): Promise<TorrentResult[]> {
    this._activeSearchCount += 1;
    if (this._activeSearchCount > this._maxActiveSearches) {
      await new Promise(resolve => {
        this._searchPendingQueue.push(resolve as () => void);
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

  private _doSearch(video: Video): Promise<TorrentResult[]> {
    const searchTerm = getSearchTerm(video);
    return this._client.search(searchTerm);
  }
}

/**
 * Any search library should be made to extend SearchImpl then added to searchers.
 */
abstract class GenericSearchClient {
  constructor(public readonly retries: number) {}

  public search(searchTerm: string): Promise<TorrentResult[]> {
    const doRetrySearch: (retries: number) => Promise<TorrentResult[]> = async retries => {
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

  public abstract _doSearch(searchTerm: string): Promise<TorrentResult[]>;
}

class TSA extends GenericSearchClient {
  constructor(retries: number = 3) {
    super(retries);
  }

  public async _doSearch(searchTerm: string): Promise<TorrentResult[]> {
    const results: TSAResult[] = await TorrentSearchApi.search(searchTerm);
    const filtered: TSAResult[] = results.filter((res: TSAResult) => res.title && res.size);
    const filteredWithMagnet: (TSAResultWithMagnet|null)[] = await Promise.all(
      filtered.map((res: TSAResult) => this._addMissingMagnet(res))
    );
    const torrents = filteredWithMagnet.filter(notNull)
      .map((res: TSAResultWithMagnet) => this._createTorrent(res))
      .filter((torrent: TorrentResult) => torrent.sizeMb > -1);
    // Sort by peers desc
    torrents.sort((a, b) => b.seeders - a.seeders || b.leechers - a.leechers);
    return torrents;
  }

  private async _addMissingMagnet(result: TSAResult): Promise<TSAResultWithMagnet|null> {
    if (result.magnet) {
      return result as TSAResultWithMagnet;
    }
    const magnet = await TorrentSearchApi.getMagnet(result);
    if (!magnet) {
      return null;
    }
    return { ...result, magnet };
  }

  private _createTorrent(result: TSAResultWithMagnet): TorrentResult {
    const parsed = ptn(result.title);
    return {
      title: result.title,
      parsedTitle: parsed.title,
      sizeMb: getSizeInMB(result.size) || -1,
      seeders: result.seeds || 0,
      leechers: result.peers || 0,
      uploadTime: result.time,
      magnet: result.magnet,
      quality: parsed.quality || '',
      resolution: parsed.resolution || '',
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

function notNull<T>(value: T|null|undefined): value is T {
    return value !== null && value !== undefined;
}
