import {get} from 'http';
import * as TVDB from 'node-tvdb';

import {Episode, Media, Movie, Show, sortEpisodes} from './media';
import {MediaQuery} from './Swiper';
import {logDebug, logError} from './terminal';
import {getDateFromStr} from './util';

let tvdb = new TVDB(process.env.TVDB_ID);

// Implements all requests to web libraries as individual utility functions.

interface DataResponse<T> {
  data?: T;
  err?: string;
}

// Return type of the OMDB database, with only fields we need defined.
interface OMDB {
  Title: string;
  Year: string;
  Type: 'movie'|'series';
  imdbID: string; // Ex: tt0000000
  Released: string;
  DVD: string;
  Error: string;
}

// Return type of the TVDB database, with only fields we need defined.
interface TVDB {
  episodes: TVDBEpisode[];
  airsDayOfWeek: string;
  airsTime: string;
  seriesName: string;
}

interface TMDB {
  vote_count: number;
  vote_average: number;
  title: string;
  popularity: number;
  adult: boolean;
  release_date: string;
}

interface TVDBEpisode {
  airedEpisodeNumber: number;
  airedSeason: number;
  firstAired: string;
  imdbId: string; // Ex: tt0000000
}

// Returns the media with all episodes. Filtering must be performed afterward.
export async function identifyMedia(info: MediaQuery): Promise<DataResponse<Media>> {
  logDebug(`identifyMedia(${JSON.stringify(info)})`);
  // TODO: Define return type.
  let omdbResult: OMDB;
  let tvdbResult: TVDB;
  // Escape any ampersands in the title for the URL string.
  const title = encodeURIComponent(info.title);
  const year = info.year ? `&y=${info.year}` : ``;
  const type = info.type ? `&type=${info.type === 'movie' ? 'movie' : 'series'}` : ``;
  const url = `http://www.omdbapi.com/?apikey=${process.env.OMDB_ID}&t=${title}` + year + type;
  try {
    // Escape all ampersands in the title for searching via web API
    omdbResult = await _getJSONResponse(url) as OMDB;
    logDebug(`OMDB Response: ${JSON.stringify(omdbResult)}`);
  } catch (err) {
    return { err: `Can't access the Open Movie Database` };
  }
  if (omdbResult.Error) {
    logError(`OMDB call failed: ${omdbResult.Error}`);
    // Failed to ID
    return { err: `I can't identify that` };
  } else if (omdbResult.Type === 'movie') {
    // Movie
    return {
      data: {
        id: convertImdbId(omdbResult.imdbID),
        type: 'movie',
        title: omdbResult.Title,
        year: omdbResult.Year,
        release: getDateFromStr(omdbResult.Released),
        dvd: getDateFromStr(omdbResult.DVD)
      }
    };
  } else {
    // TV Show
    try {
      tvdbResult = await _searchTVDB(omdbResult.imdbID);
    } catch (err) {
      logError(`_searchTVDB Failed: ${err}`);
      return { err: `Can't find that show` };
    }
    const show: Show = {
      id: convertImdbId(omdbResult.imdbID),
      type: 'tv',
      title: omdbResult.Title,
      episodes: ([] as Episode[])
    };
    const episodes = tvdbResult.episodes.filter(ep => ep.imdbId).map(ep => ({
      show,
      id: convertImdbId(ep.imdbId),
      type: 'episode' as 'episode',
      seasonNum: ep.airedSeason,
      episodeNum: ep.airedEpisodeNumber,
      airDate: ep.firstAired ? new Date(`${ep.firstAired} ${tvdbResult.airsTime}`) : null
    }));
    show.episodes.push(...sortEpisodes(episodes));
    return {
      data: show
    };
  }
}

export async function getPopularReleasedBetween(startDate: Date, endDate: Date): Promise<Movie[]> {
  // Vote count is a weird arbitrary metric that helps indicate how popular a movie is.
  const minVoteCount = 250;
  const startDateStr = getYMDString(startDate);
  const endDateStr = getYMDString(endDate);
  const url = 'http://api.themoviedb.org/3/discover/movie';
  const queryStr = `?primary_release_date.gte=${startDateStr}&primary_release_date.lte=${endDateStr}` +
    `&vote_count.gte=${minVoteCount}&api_key=${process.env.TMDB_ID}`;
  const tmdbResult = await _getJSONResponse(url + queryStr);
  // Filter out any adult movies just in case.
  const tmdbArray: TMDB[] = tmdbResult.results.filter((tmdb: TMDB) => !tmdb.adult);
  console.warn('TMDB', tmdbArray);
  // Identify each TMDB movie.
  const requestArray = tmdbArray.map(tmdb => identifyMedia({
    title: tmdb.title,
    type: 'movie',
    episodes: null,
    year: (new Date(tmdb.release_date)).getFullYear().toString()
  }))
  const responses: Array<DataResponse<Media>> = await Promise.all(requestArray);
  const movies = responses.filter(r => r.data).map(r => r.data) as Movie[];
  return movies;
}

function convertImdbId(imdbId: string): number {
  return parseInt(imdbId.slice(2), 10);
}

// Helper function to search TVDB and retry with a refreshed API token on error.
async function _searchTVDB(imdbId: string, isRetryAttempt: boolean = false): Promise<TVDB> {
  const entries = await tvdb.getSeriesByImdbId(imdbId);
  try {
    return tvdb.getSeriesAllById(entries[0].id);
  } catch (err) {
    if (isRetryAttempt) {
      throw err;
    }
    // On initial failure, refresh authentication.
    tvdb = new TVDB(process.env.TVDB_ID);
    return _searchTVDB(imdbId, true);
  }
}

async function _getJSONResponse(url: string): Promise<{[key: string]: any}> {
  return new Promise((resolve, reject) => {
    get(url, res => {
      res.setEncoding("utf8");
      let body = "";
      res.on("data", data => { body += data; });
      res.on("end", () => {
        resolve(JSON.parse(body));
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

function getYMDString(date: Date): string {
  return `${date.getFullYear()}-${(date.getMonth() + 1)}-${date.getDate()}`;
}
