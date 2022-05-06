import axios from 'axios';
import * as log from '../../common/logger';
import {sortEpisodes} from '../../common/media';

// Return type of the TVDB database, with only fields we need defined.
interface TVDBShow {
  episodes: TVDBEpisode[];
  airsDayOfWeek: string;
  airsTime: string;
  seriesName: string;
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
  public static async search(imdbId: string): Promise<TVDBShow> {
    // Get the TVDB series ID from the imdbID.
    log.debug(`TVDB.search: Fetching TVDB ID from IMDB ID`);
    const data = await this.makeRequest<any>(TVDB.SEARCH_URL, { imdbId });
    const entries = data.data;
    if (entries.length === 0) {
      throw new Error('Series not found in TVDB');
    }
    const seriesId = entries[0].id;

    // Retrieved the ID, now fetch the series and episodes.
    log.debug(`TVDB.search: Fetching series`);
    const seriesUrl = this.getSeriesUrl(seriesId);
    const seriesData = await this.makeRequest<any>(seriesUrl);
    const series = seriesData.data;
    series.episodes = await this.fetchEpisodes(seriesId);
    return series;
  }

  public static async toShow(info: TVDBShow, imdbId: string): Promise<Show> {
    const show: Show = {
      id: convertImdbId(imdbId),
      type: 'tv',
      title: info.seriesName,
      episodes: [],
    };
    const episodes: Episode[] = info.episodes.map(ep => ({
      id: hashEpisodeId(show.id, ep.airedSeason, ep.airedEpisodeNumber),
      type: 'episode',
      seasonNum: ep.airedSeason,
      episodeNum: ep.airedEpisodeNumber,
      airDate: ep.firstAired ? new Date(`${ep.firstAired} ${info.airsTime}`).getTime() : undefined,
      showId: show.id,
      showTitle: show.title,
      status: 'identified',
      queueIndex: -1,
    }));
    show.episodes.push(...sortEpisodes(episodes));
    return show;
  }

  private static async makeRequest<T>(url: string, params: any = {}): Promise<T> {
    await this.refreshToken();
    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${TVDB.token}`,
      },
      params,
    });
    return response.data;
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
      log.debug(`TVDB.search: Refreshing token`);
      const response = await axios.post(TVDB.LOGIN_URL, {
        apikey: TVDB.API_KEY,
        pin: TVDB.PIN
      });
      TVDB.token = response.data.token;
      TVDB.tokenTs = now;
    }
  }

  private static async fetchEpisodes(seriesId: number): Promise<TVDBEpisode[]> {
    log.debug(`_searchTVDB: Fetching episodes`);
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

function hashEpisodeId(showId: number, seasonNum: number, episodeNum: number): number {
  return (showId * 1000 * 1000) + (seasonNum * 1000) + episodeNum;
}
