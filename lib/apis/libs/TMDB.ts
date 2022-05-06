import axios from 'axios';
import * as log from '../../common/logger';
import {getDateFromStr} from '../../common/util';

interface TMDBMovie {
  id: number;
  media_type: 'movie';
  title: string;
  release_date: string;
}

interface TMDBShow {
  id: number;
  media_type: 'tv';
  first_air_date: string;
}

type TMDBMedia = TMDBMovie | TMDBShow;

// TODO: Evaluate API usage
export default class TMDB {
  private static API_KEY = process.env.TMDB_ID;
  private static AUTH_TOKEN = process.env.TMDB_READ_ACCESS;

  private static URL_V3 = 'https://api.themoviedb.org/3';
  private static URL_V4 = 'https://api.themoviedb.org/4';

  public static async search(info: MediaQuery): Promise<TMDBMedia> {
    const { title, year, type } = info;
    const url = this.getSearchUrl(title, year, type);
    return this.makeMediaRequest(url, year);
  }

  public static async toMovie(info: TMDBMovie): Promise<Movie> {
    const imdbId = await this.getImdbId(info);
    const url = this.getMovieReleaseDateUrl(info.id);

    let streamingRelease;
    try {
      const data = await this.makeRequest<any>(url);
      const usaResult = data.results.find((_res: any) => _res.iso_3166_1 === 'US');
      if (!usaResult) {
        throw new Error('No results for the US');
      }
      console.warn('release dates', usaResult);
      // Release types:
      // 1. Premiere
      // 2. Theatrical (limited)
      // 3. Theatrical
      // 4. Digital
      // 5. Physical
      // 6. TV
      const relevant = usaResult.release_dates.filter((_release: any) => _release.type === 4);
      if (relevant.length === 0) {
        throw new Error('No results');
      }
      streamingRelease = relevant[0].release_date;
    } catch (err) {
      log.debug(`TMDB.toMovie fetching release date failed: ${err}`);
    }
    return {
      id: parseImdbId(imdbId),
      type: 'movie',
      title: info.title,
      year: getYear(info.release_date),
      theatricalRelease: getDateFromStr(info.release_date)!,
      streamingRelease: getDateFromStr(streamingRelease)!,
      status: 'identified',
      queueIndex: -1,
    };
  }

  public static async getImdbId(info: TMDBMedia): Promise<string> {
    const url = this.getExternalIdsUrl(info.id, info.media_type);
    const data = await this.makeRequest<any>(url);
    return data.imdb_id;
  }

  private static async makeRequest<T>(url: string): Promise<T> {
    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${TMDB.AUTH_TOKEN}`,
      },
    });
    return response.data;
  }

  private static getSearchUrl(title: string, year: string|null, type: 'movie'|'tv'|null): string {
    const safeTitle = encodeURIComponent(title);
    if (type) {
      const yearParam = type === 'movie' ? 'primary_release_year' : 'first_air_date_year';
      const yearQuery = year ? `&${yearParam}=${year}` : '';
      return `${TMDB.URL_V4}/search/${type}?query=${safeTitle}${yearQuery}`;
    }
    return `${TMDB.URL_V4}/search/multi?query=${safeTitle}`;
  }

  private static getMovieReleaseDateUrl(tmdbId: number): string {
    return `${TMDB.URL_V3}/movie/${tmdbId}/release_dates?api_key=${TMDB.API_KEY}`;
  }

  private static getExternalIdsUrl(tmdbId: number, type: 'movie'|'tv'): string {
    return `${TMDB.URL_V3}/${type}/${tmdbId}/external_ids?api_key=${TMDB.API_KEY}`;
  }

  private static async makeMediaRequest(url: string, year: string|null): Promise<TMDBMedia> {
    try {
      const data = await this.makeRequest<any>(url);
      let results = data.results;
      if (year) {
        results = results.filter((_media: TMDBMedia) =>
          (_media as TMDBMovie).release_date && getYear((_media as TMDBMovie).release_date) === year ||
          (_media as TMDBShow).first_air_date && getYear((_media as TMDBShow).first_air_date) === year);
      }
      if (results.length === 0) {
        throw new Error(`No results`);
      }
      return results[0];
    } catch (err) {
      log.error(err);
      throw new Error(`Failed The Movie Database search: ${err}`);
    }
  }
}

function parseImdbId(imdbId: string): number {
  return parseInt(imdbId.slice(2), 10);
}

function getYear(tmdbDate: string): string {
  const date = getDateFromStr(tmdbDate);
  return date ? `${date.getFullYear()}` : '';
}

// interface TMDBPopularity {
//   vote_count: number;
//   vote_average: number;
//   title: string;
//   popularity: number;
//   adult: boolean;
//   release_date: string;
// }

// interface TMDBResult {
//   movies: Movie[];
//   page: number;
//   total_pages: number;
// }

// export async function getPopularReleasedBetween(
//   startDate: Date,
//   endDate: Date,
//   page: number = 1
// ): Promise<TMDBResult> {
//   // Vote count is a weird arbitrary metric that helps indicate how popular a movie is.
//   const minVoteCount = 100;
//   const startDateStr = getYMDString(startDate);
//   const endDateStr = getYMDString(endDate);
//   const url = `https://api.themoviedb.org/4/discover/movie?primary_release_date.gte=${startDateStr}`
//     + `&primary_release_date.lte=${endDateStr}&vote_count.gte=${minVoteCount}`
//     + `&sort_by=release_date.desc&include_adult=false&page=${page}`;
//   let response: any;
//   try {
//     response = await axios.get(url, {
//       headers: { Authorization: `Bearer ${process.env.TMDB_READ_ACCESS}` },
//     });
//   } catch (err) {
//     log.error(`TMDB is not responding to requests: ${err}`);
//   }
//   // If the query fails or returns no movies, return no movies.
//   const tmdbResult = response.data;
//   if (!tmdbResult || !tmdbResult.results) {
//     return {
//       movies: [],
//       total_pages: 0,
//       page: 1
//     };
//   }
//   // Filter out any adult movies just in case.
//   const tmdbArray: TMDBPopularity[] = tmdbResult.results;
//   // Identify each TMDB movie.
//   const requestArray = tmdbArray.map(tmdb => identifyMedia({
//     title: tmdb.title,
//     type: 'movie',
//     episodes: null,
//     year: getTMDBYear(tmdb.release_date)
//   }));
//   const responses: DataResponse<Media>[] = await Promise.all(requestArray);
//   const movies = responses.filter(r => r.data).map(r => r.data) as Movie[];
//   return {
//     movies,
//     total_pages: tmdbResult.total_pages,
//     page: tmdbResult.page
//   };
// }

// function getYMDString(date: Date): string {
//   const month = ('0' + (date.getMonth() + 1)).slice(-2);
//   const day = ('0' + date.getDate()).slice(-2);
//   return `${date.getFullYear()}-${month}-${day}`;
// }
