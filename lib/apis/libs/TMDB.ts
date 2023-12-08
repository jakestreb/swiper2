import axios from 'axios';
import * as log from '../../log';
import * as util from '../../util';
import Movie from '../../res/Movie';
import PublicError from '../../util/errors/PublicError';

interface TMDBMovie {
  id: number;
  media_type: 'movie';
  title: string;
  release_date: string;
  adult: boolean;
}

interface TMDBShow {
  id: number;
  media_type: 'tv';
  first_air_date: string;
}

type TMDBMedia = TMDBMovie | TMDBShow;

export default class TMDB {
  private static API_KEY = process.env.TMDB_ID;
  private static AUTH_TOKEN = process.env.TMDB_READ_ACCESS;

  private static URL_V3 = 'https://api.themoviedb.org/3';

  public static async search(info: MediaQuery): Promise<TMDBMedia> {
    log.debug(`TMDB.search ${info.title}`);
    const { title, year, type } = info;
    const url = this.getSearchUrl(title, year, type);
    let { results } = await this.makeRequest<any>(url);
    if (year) {
      results = results.filter((_media: TMDBMedia) =>
        (_media as TMDBMovie).release_date && getYear((_media as TMDBMovie).release_date) === year ||
        (_media as TMDBShow).first_air_date && getYear((_media as TMDBShow).first_air_date) === year);
    }
    if (results.length === 0) {
      throw new PublicError('No results found');
    }
    const match: TMDBMedia = results[0];
    if (type) {
      // Note that TMDB stopped including the media_type in tv/movie specific searches
      match.media_type = type;
    }
    return match;
  }

  public static async getSynopsis(movieId: number): Promise<string> {
    log.debug(`TMDB.getSynopsis ${movieId}`);
    const tmdbMovie = await this.getTmdbMovie(movieId);
    const url = await this.getMovieDetailsUrl(tmdbMovie.id);
    const data = await this.makeRequest<any>(url);
    return data.overview;
  }

  public static async refreshReleases(movie: IMovie): Promise<IMovie> {
    log.debug(`TMDB.refreshReleases ${movie}`);
    const tmdbMovie = await this.getTmdbMovie(movie.id);
    const freshMovie = await this.toMovie(tmdbMovie);
    movie.releases = freshMovie.releases;
    return movie;
  }

  public static async toMovie(info: TMDBMovie): Promise<IMovie> {
    const imdbId = await this.getImdbId(info);
    const url = this.getMovieReleaseDateUrl(info.id);

    let digitalRelease;
    try {
      const data = await this.makeRequest<any>(url);
      const usaResult = data.results.find((_res: any) => _res.iso_3166_1 === 'US');
      if (!usaResult) {
        throw new Error('No results for the US');
      }
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
      digitalRelease = relevant[0].release_date;
    } catch (err) {
      log.debug(`TMDB.toMovie fetching release date failed: ${err}`);
    }

    const releases = {
      theatrical: util.parseDate(info.release_date) || undefined,
      digital: util.parseDate(digitalRelease) || undefined,
    };

    return new Movie({
      id: parseImdbId(imdbId),
      title: info.title,
      year: getYear(info.release_date),
      releases,
      status: 'identified',
      queueIndex: -1,
    });
  }

  public static async getImdbId(info: TMDBMedia): Promise<string> {
    const type = isMovie(info) ? 'movie' : 'tv';
    const url = this.getExternalIdsUrl(info.id, type);
    const data = await this.makeRequest<any>(url);
    return data.imdb_id;
  }

  private static async getTmdbMovie(movieId: number): Promise<TMDBMovie> {
    const url = this.getTmdbMovieUrl(movieId);
    const info = await this.makeRequest<any>(url);
    if (info.movie_results.length === 0) {
      throw new Error('No results for movie\'s saved imdbId');
    }
    return info.movie_results[0];
  }

  private static getSearchUrl(title: string, year: string|null, type: 'movie'|'tv'|null): string {
    const safeTitle = encodeURIComponent(title);
    if (type) {
      const yearParam = type === 'movie' ? 'primary_release_year' : 'first_air_date_year';
      const yearQuery = year ? `&${yearParam}=${year}` : '';
      return `${TMDB.URL_V3}/search/${type}?query=${safeTitle}${yearQuery}`;
    }
    return `${TMDB.URL_V3}/search/multi?query=${safeTitle}`;
  }

  private static getTmdbMovieUrl(movieId: number): string {
    return `${TMDB.URL_V3}/find/${getImdbId(movieId)}?api_key=${TMDB.API_KEY}&external_source=imdb_id`;
  }

  private static getMovieDetailsUrl(tmdbId: number): string {
    return `${TMDB.URL_V3}/movie/${tmdbId}?api_key=${TMDB.API_KEY}`;
  }

  private static getMovieReleaseDateUrl(tmdbId: number): string {
    return `${TMDB.URL_V3}/movie/${tmdbId}/release_dates?api_key=${TMDB.API_KEY}`;
  }

  private static getExternalIdsUrl(tmdbId: number, type: 'movie'|'tv'): string {
    return `${TMDB.URL_V3}/${type}/${tmdbId}/external_ids?api_key=${TMDB.API_KEY}`;
  }

  private static async makeRequest<T>(url: string): Promise<T> {
    try {
      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${TMDB.AUTH_TOKEN}`,
        },
      });
      return response.data;
    } catch (err: any) {
      log.error(`Failed The Movie Database request: ${err}`);
      throw err;
    }
  }
}

function parseImdbId(imdbId: string): number {
  return parseInt(imdbId.slice(2), 10);
}

function getImdbId(movieId: number): string {
  return `tt${movieId}`;
}

function getYear(tmdbDate: string): string {
  const date = util.parseDate(tmdbDate);
  return date ? `${date.getFullYear()}` : '';
}

function isMovie(tmdbMedia: TMDBMedia): tmdbMedia is TMDBMovie {
  return !(tmdbMedia as any).first_air_date;
}
