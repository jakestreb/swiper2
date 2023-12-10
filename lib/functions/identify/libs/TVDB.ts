import axios from 'axios';
import get from 'lodash/get';
import logger from '../../../util/logger';
import Show from '../../../db/models/Show';
import Episode from '../../../db/models/Episode';
import PublicError from '../../../util/errors/PublicError';

// Return type of the TVDB database, with only fields we need defined.
interface TVDBShow {
  id: number;
  episodes: TVDBEpisode[];
  airsDayOfWeek: string;
  airsTime: string;
  seriesName: string;
  overview: string;
}

interface TVDBEpisode {
  airedEpisodeNumber: number;
  airedSeason: number;
  firstAired: string;
  imdbId: string; // Ex: tt0000000
}

export default class TVDB {
  private static PIN = process.env.TVDB_PIN;
  private static API_KEY = process.env.TVDB_API_KEY;

  private static URL = 'https://api.thetvdb.com';
  private static LOGIN_URL = `${TVDB.URL}/login`;
  private static SEARCH_URL = `${TVDB.URL}/search/series`;

  private static token = '';
  private static tokenTs = 0;

  // Helper function to search TVDB and retry with a refreshed API token on error.
  public static async getShow(imdbId: string): Promise<TVDBShow> {
    const series = await this.getTvdbShow(imdbId);
    series.episodes = await this.fetchEpisodes(series.id);
    return series;
  }

  public static async getSynopsis(show: IShow): Promise<string> {
    // TODO: This is wasteful since this was just called to identify the show
    // Use sequelize and differentiate DB models from fetched media interfaces to keep overview in the object
    const series = await this.getTvdbShow(getImdbId(show.id));
    return series.overview;
  }

  public static async toShow(info: TVDBShow, imdbId: string): Promise<IShow> {
    const yearRegex = /\(\d{4}\)/g;
    // Sometimes, the year in parenthesis is included in the title - if so, remove it
    const title = info.seriesName.replace(yearRegex, '').trim();
    const show: IShow = new Show({
      id: convertImdbId(imdbId),
      title,
      episodes: [],
    });
    show.episodes = info.episodes.map(ep => new Episode({
      id: hashEpisodeId(show.id, ep.airedSeason, ep.airedEpisodeNumber),
      seasonNum: ep.airedSeason,
      episodeNum: ep.airedEpisodeNumber,
      airDate: ep.firstAired ? new Date(`${ep.firstAired} ${info.airsTime}`) : undefined,
      showId: show.id,
      showTitle: show.title,
      status: 'identified',
      queueIndex: -1,
    }));
    show.sortEpisodes();
    return show;
  }

  // Does not include episodes
  private static async getTvdbShow(imdbId: string): Promise<TVDBShow> {
    // Get the TVDB series ID from the imdbID.
    logger.debug(`TVDB.getShow: Fetching TVDB ID from IMDB ID`);
    const data = await this.makeRequest<any>(TVDB.SEARCH_URL, { imdbId });
    const entries = data.data;
    if (entries.length === 0) {
      throw new Error('Series not found in TVDB');
    }
    const seriesId = entries[0].id;

    // Retrieved the ID, now fetch the series and episodes.
    logger.debug(`TVDB.getShow: Fetching series`);
    const seriesUrl = this.getSeriesUrl(seriesId);
    const seriesData = await this.makeRequest<any>(seriesUrl);
    return seriesData.data;
  }

  private static async makeRequest<T>(url: string, params: any = {}): Promise<T> {
    await this.refreshToken();
    try {
      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${TVDB.token}`,
        },
        params,
      });
      return response.data;
    } catch (err: any) {
      const status = get(err, 'response.status');
      const code = get(err, 'response.code');
      logger.error('TVDB request error', { err: err.message, url, status, code });
      if (status === 404) {
        throw new PublicError('Media not found in TVDB');
      }
      throw new PublicError('Error searching TVDB');
    }
  }

  private static getSeriesUrl(seriesId: number): string {
    return `${TVDB.URL}/series/${seriesId}`;
  }

  private static getEpisodesUrl(seriesId: number): string {
    return `${TVDB.URL}/series/${seriesId}/episodes`;
  }

  private static async refreshToken() {
    // Token lasts for 24 hours - refresh if necessary.
    const now = new Date().getTime();
    const day = 24 * 60 * 60 * 1000;
    if (now - TVDB.tokenTs > day) {
      // Needs refresh.
      logger.debug(`Refreshing TVDB token`);
      const response = await axios.post(TVDB.LOGIN_URL, {
        apikey: TVDB.API_KEY,
        pin: TVDB.PIN
      });
      TVDB.token = response.data.token;
      TVDB.tokenTs = now;
    }
  }

  private static async fetchEpisodes(seriesId: number): Promise<TVDBEpisode[]> {
    logger.debug(`_searchTVDB: Fetching episodes`);
    const url = this.getEpisodesUrl(seriesId);
    const doFetch = async (pageNum: number) => this.makeRequest<any>(url, { page: pageNum });
    const firstResult = await doFetch(1);
    const episodes = firstResult.data;
    if (firstResult.links.last > 1) {
      const fetchArray = [...Array(firstResult.links.last - 1)].map((_, idx) => idx + 2);
      const moreResults = await Promise.all(fetchArray.map(async pageNum => doFetch(pageNum)));
      moreResults.forEach((res: any) => {
        episodes.push(...res.data);
      });
    }
    return episodes;
  }
}

function convertImdbId(imdbId: string): number {
  return parseInt(imdbId.slice(2), 10);
}

function getImdbId(showId: number): string {
  const minLength = 7;
  const idLength = Math.max(`${showId}`.length, minLength);
  const sevenDigit = `0000000${showId}`.slice(-idLength);
  return `tt${sevenDigit}`;
}

function hashEpisodeId(showId: number, seasonNum: number, episodeNum: number): number {
  return (showId * 1000 * 1000) + (seasonNum * 1000) + episodeNum;
}
