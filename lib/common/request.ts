// TODO: Consider replacing TVDB with TMDB.
import * as TVDB from 'node-tvdb';
import axios from 'axios';

import {MediaQuery} from '../Swiper';
import * as log from './logger';
import {Episode, Media, Movie, Show, sortEpisodes} from './media';
import {getDateFromStr} from './util';

// TVDB temporary token cache.
let tvdbToken = '';
let tvdbTokenTimestamp = 0;

// Implements all requests to web libraries as individual utility functions.
interface DataResponse<T> {
  data?: T;
  err?: string;
}

interface TMDBResult {
  movies: Movie[];
  page: number;
  total_pages: number;
}

interface TMDBPopularity {
  vote_count: number;
  vote_average: number;
  title: string;
  popularity: number;
  adult: boolean;
  release_date: string;
}

interface TMDBMovie {
  id: number;
  media_type: string;
  title: string;
  release_date: string;
}

interface TMDBShow {
  id: number;
  media_type: string;
  first_air_date: string;
}

type TMDBMedia = TMDBMovie | TMDBShow;

// Return type of the TVDB database, with only fields we need defined.
interface TVDB {
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

// Returns the media with all episodes. Filtering must be performed afterward.
export async function identifyMedia(info: MediaQuery): Promise<DataResponse<Media>> {
  log.debug(`identifyMedia(${JSON.stringify(info)})`);
  try {
    return {
      data: await _searchTMDB(info)
    };
  } catch (err) {
    log.error(err);
    return { err: 'The Movie Database is not responding' };
  }
}

export async function getPopularReleasedBetween(
  startDate: Date,
  endDate: Date,
  page: number = 1
): Promise<TMDBResult> {
  // Vote count is a weird arbitrary metric that helps indicate how popular a movie is.
  const minVoteCount = 100;
  const startDateStr = getYMDString(startDate);
  const endDateStr = getYMDString(endDate);
  const url = `https://api.themoviedb.org/4/discover/movie?primary_release_date.gte=${startDateStr}`
    + `&primary_release_date.lte=${endDateStr}&vote_count.gte=${minVoteCount}`
    + `&sort_by=release_date.desc&include_adult=false&page=${page}`;
  let response: any;
  try {
    response = await axios.get(url, {
      headers: { Authorization: `Bearer ${process.env.TMDB_READ_ACCESS}` },
    });
  } catch (err) {
    log.error(`TMDB is not responding to requests: ${err}`);
  }
  // If the query fails or returns no movies, return no movies.
  const tmdbResult = response.data;
  if (!tmdbResult || !tmdbResult.data.results) {
    return {
      movies: [],
      total_pages: 0,
      page: 1
    };
  }
  // Filter out any adult movies just in case.
  const tmdbArray: TMDBPopularity[] = tmdbResult.results;
  // Identify each TMDB movie.
  const requestArray = tmdbArray.map(tmdb => identifyMedia({
    title: tmdb.title,
    type: 'movie',
    episodes: null,
    year: getTMDBYear(tmdb.release_date)
  }));
  const responses: Array<DataResponse<Media>> = await Promise.all(requestArray);
  const movies = responses.filter(r => r.data).map(r => r.data) as Movie[];
  return {
    movies,
    total_pages: tmdbResult.total_pages,
    page: tmdbResult.page
  };
}

function convertImdbId(imdbId: string): number {
  return parseInt(imdbId.slice(2), 10);
}

async function _searchTMDB(info: MediaQuery): Promise<Media> {
  let mediaResult: TMDBMedia;
  const title = encodeURIComponent(info.title);
  if (info.type === 'movie') {
    // Searching for movie
    const uri = `https://api.themoviedb.org/4/search/movie?query=${title}`
      + `&primary_release_year=${info.year}`;
    mediaResult = await _makeTMDBMediaRequest(uri, info.year);
    return _convertTMDBMovie(mediaResult as TMDBMovie);
  } else if (info.type === 'tv') {
    // Searching for tv series
    const uri = `https://api.themoviedb.org/4/search/tv?query=${title}`
      + `&first_air_date_year=${info.year}`;
    mediaResult = await _makeTMDBMediaRequest(uri, info.year);
    return _convertTMDBShow(mediaResult as TMDBShow);
  } else {
    // Searching for either
    const uri = `https://api.themoviedb.org/4/search/multi?&query=${title}`;
    mediaResult = await _makeTMDBMediaRequest(uri, info.year) as TMDBMedia;
    if (mediaResult.media_type === 'movie') {
      return _convertTMDBMovie(mediaResult as TMDBMovie);
    } else if (mediaResult.media_type === 'tv') {
      return _convertTMDBShow(mediaResult as TMDBShow);
    } else {
      throw new Error(`Result not a movie or tv show`);
    }
  }
}

async function _convertTMDBMovie(info: TMDBMovie): Promise<Movie> {
  const imdbId = await _getTMDBImdbId(info, 'movie');
      // TODO: Convert to v4 when supported.
  const url = `https://api.themoviedb.org/3/movie/${info.id}/release_dates?api_key=${process.env.TMDB_ID}`;
  let digitalRelease;
  try {
    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${process.env.TMDB_READ_ACCESS}` },
    });
    const movieResults = response.data.results;
    console.warn('response!!!!', movieResults);
    const usaResult = movieResults.find((_res: any) => _res.iso_3166_1 === 'US');
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
    log.debug(`_convertTMDBMovie find release date failed: ${err}`);
  }
  return {
    id: convertImdbId(imdbId),
    type: 'movie',
    title: info.title,
    year: getTMDBYear(info.release_date),
    release: getDateFromStr(info.release_date),
    dvd: digitalRelease ? getDateFromStr(digitalRelease) : null
  };
}

async function _convertTMDBShow(info: TMDBShow): Promise<Show> {
  const imdbId = await _getTMDBImdbId(info, 'tv');
  let tvdbResult: TVDB;
  try {
    tvdbResult = await _searchTVDB(imdbId);
  } catch (err) {
    log.error(`_searchTVDB Failed: ${err}`);
    throw new Error(`Can't find that show`);
  }
  const show: Show = {
    id: convertImdbId(imdbId),
    type: 'tv',
    title: tvdbResult.seriesName,
    episodes: ([] as Episode[])
  };
  const episodes = tvdbResult.episodes.map(ep => ({
    show,
    id: hashEpisodeId(show.id, ep.airedSeason, ep.airedEpisodeNumber),
    type: 'episode' as 'episode',
    seasonNum: ep.airedSeason,
    episodeNum: ep.airedEpisodeNumber,
    airDate: ep.firstAired ? new Date(`${ep.firstAired} ${tvdbResult.airsTime}`) : null
  }));
  show.episodes.push(...sortEpisodes(episodes));
  return show;
}

async function _getTMDBImdbId(info: TMDBMedia, type: 'movie'|'tv'): Promise<string> {
  // TODO: Convert to v4 when supported.
  const url = `https://api.themoviedb.org/3/${type}/${info.id}/external_ids?api_key=${process.env.TMDB_ID}`;
  const response = await axios.get(url, {
    headers: { Authorization: `Bearer ${process.env.TMDB_READ_ACCESS}` },
  });
  return response.data.imdb_id;
}

async function _makeTMDBMediaRequest(url: string, year?: string|null): Promise<TMDBMedia> {
  try {
    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${process.env.TMDB_READ_ACCESS}` },
    });
    let results = response.data.results;
    if (year) {
      results = results.filter((_media: TMDBMedia) =>
        (_media as TMDBMovie).release_date && getTMDBYear((_media as TMDBMovie).release_date) === year ||
        (_media as TMDBShow).first_air_date && getTMDBYear((_media as TMDBShow).first_air_date) === year);
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

// Helper function to search TVDB and retry with a refreshed API token on error.
async function _searchTVDB(imdbId: string): Promise<TVDB> {
  const loginUrl = 'https://api.thetvdb.com/login';
  const searchUrl = 'https://api.thetvdb.com/search/series';

  // Token lasts for 24 hours - refresh if necessary.
  const now = new Date().getTime();
  const day = 24 * 60 * 60 * 1000;
  if (now - tvdbTokenTimestamp > day) {
    // Needs refresh.
    log.debug(`_searchTVDB: Refreshing token`);
    const response = await axios.post(loginUrl, {
      apikey: process.env.TVDB_ID,
    });
    tvdbToken = response.data.token;
    tvdbTokenTimestamp = now;
  }

  // Get the TVDB series ID from the imdbID.
  log.debug(`_searchTVDB: Fetching TVDB ID from IMDB ID`);
  const searchResponse = await axios.get(searchUrl, {
    headers: {Authorization: `Bearer ${tvdbToken}`},
    params: {imdbId}
  });
  const entries = JSON.parse(searchResponse.data).data;
  if (entries.length === 0) { throw new Error('Series not found in TVDB'); }
  const seriesId = entries[0].id;

  // Retrieved the ID, now fetch the series and episodes.
  log.debug(`_searchTVDB: Fetching series`);
  const seriesUrl = `https://api.thetvdb.com/series/${seriesId}`;
  const seriesResponse = await axios.get(seriesUrl, {
    headers: {Authorization: `Bearer ${tvdbToken}`},
  });

  // Convert and return.
  const series = JSON.parse(seriesResponse.data).data;
  series.episodes = await fetchEpisodes(seriesId);
  return series;
}

// Episodes sometimes need to be fetched in multiple requests if there are a lot.
// This function facilitates that.
async function fetchEpisodes(seriesId: number): Promise<TVDBEpisode[]> {
  log.debug(`_searchTVDB: Fetching episodes`);
  const doFetch = async (pageNum: number) => {
    const url = `https://api.thetvdb.com/series/${seriesId}/episodes`;
    const response = await axios.get(url, {
      headers: {Authorization: `Bearer ${tvdbToken}`},
      params: {page: pageNum}
    });
    return JSON.parse(response.data);
  };
  const firstResult = await doFetch(1);
  const episodes = firstResult.data;
  if (firstResult.links.last > 1) {
    const fetchArray = [...Array(firstResult.links.last - 1)].map((_, idx) => idx + 2);
    const moreResults = await Promise.all(fetchArray.map(async pageNum => doFetch(pageNum)));
    moreResults.forEach((res: any) => { episodes.push(...res.data); });
  }
  return episodes;
}

function getTMDBYear(tmdbDate: string): string {
  const date = getDateFromStr(tmdbDate);
  return date ? `${date.getFullYear()}` : '';
}

function hashEpisodeId(showId: number, seasonNum: number, episodeNum: number): number {
  return (showId * 1000 * 1000) + (seasonNum * 1000) + episodeNum;
}

function getYMDString(date: Date): string {
  const month = ('0' + (date.getMonth() + 1)).slice(-2);
  const day = ('0' + date.getDate()).slice(-2);
  return `${date.getFullYear()}-${month}-${day}`;
}
