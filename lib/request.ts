import * as TVDB from 'node-tvdb';
import * as rp from 'request-promise';

import {Episode, Media, Movie, Show, sortEpisodes} from './media';
import {MediaQuery} from './Swiper';
import {logDebug, logError} from './terminal';
import {getDateFromStr} from './util';

// TVDB temporary token cache.
let tvdbToken = '';
let tvdbTokenTimestamp = 0;

// Implements all requests to web libraries as individual utility functions.
interface DataResponse<T> {
  data?: T;
  err?: string;
}

// Return type of the TVDB database, with only fields we need defined.
interface TVDB {
  episodes: TVDBEpisode[];
  airsDayOfWeek: string;
  airsTime: string;
  seriesName: string;
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
}

type TMDBMedia = TMDBMovie | TMDBShow;

interface TVDBEpisode {
  airedEpisodeNumber: number;
  airedSeason: number;
  firstAired: string;
  imdbId: string; // Ex: tt0000000
}

// Returns the media with all episodes. Filtering must be performed afterward.
export async function identifyMedia(info: MediaQuery): Promise<DataResponse<Media>> {
  logDebug(`identifyMedia(${JSON.stringify(info)})`);
  try {
    return {
      data: await _searchTMDB(info)
    };
  } catch (err) {
    logError(err);
    return { err: 'The Movie Database is not responding' };
  }
}




export async function getPopularReleasedBetween(startDate: Date, endDate: Date): Promise<Movie[]> {
  // Vote count is a weird arbitrary metric that helps indicate how popular a movie is.
  const minVoteCount = 250;
  const startDateStr = getYMDString(startDate);
  const endDateStr = getYMDString(endDate);
  const uri = `https://api.themoviedb.org/4/discover/movie?api_key=${process.env.TMDB_ID}`
    + `&primary_release_date.gte=${startDateStr}`
    + `&primary_release_date.lte=${endDateStr}&vote_count.gte=${minVoteCount}`;
  let tmdbResult;
  try {
    tmdbResult = await rp({
      uri,
      headers: {
        Authorization: `Bearer ${process.env.TMDB_READ_ACCESS}`,
        'Content-Type': 'application/json;charset=utf-8'
      }
    });
  } catch (err) {
    logError(err);
    logError(`TMDB is not responding to requests`);
  }
  // If the query fails or returns no movies, return no movies.
  if (!tmdbResult || !tmdbResult.results) {
    return [];
  }
  // Filter out any adult movies just in case.
  const tmdbArray: TMDBPopularity[] = tmdbResult.results.filter((tmdb: TMDBPopularity) => !tmdb.adult);
  // Identify each TMDB movie.
  const requestArray = tmdbArray.map(tmdb => identifyMedia({
    title: tmdb.title,
    type: 'movie',
    episodes: null,
    year: (new Date(tmdb.release_date)).getFullYear().toString()
  }));
  const responses: Array<DataResponse<Media>> = await Promise.all(requestArray);
  const movies = responses.filter(r => r.data).map(r => r.data) as Movie[];
  return movies;
}

function convertImdbId(imdbId: string): number {
  return parseInt(imdbId.slice(2), 10);
}

async function _searchTMDB(info: MediaQuery): Promise<Media> {
  let mediaResult: TMDBMedia;
  const title = encodeURIComponent(info.title);
  if (info.type === 'movie') {
    // Searching for movie
    const uri = `https://api.themoviedb.org/4/search/movie?api_key=${process.env.TMDB_ID}`
      + `&query=${title}&primary_release_year=${info.year}`;
    mediaResult = await _makeTMDBMediaRequest(uri, 'movie');
    return _convertTMDBMovie(mediaResult as TMDBMovie);
  } else if (info.type === 'tv') {
    // Searching for tv series
    const uri = `https://api.themoviedb.org/4/search/tv?api_key=${process.env.TMDB_ID}`
      + `&query=${title}&first_air_date_year=${info.year}`;
    mediaResult = await _makeTMDBMediaRequest(uri, 'tv');
    return _convertTMDBShow(mediaResult as TMDBShow);
  } else {
    // Searching for either
    const uri = `https://api.themoviedb.org/4/search/multi?api_key=${process.env.TMDB_ID}`;
    mediaResult = await _makeTMDBMediaRequest(uri) as TMDBMedia;
    if (mediaResult.media_type === 'movie') {
      return _convertTMDBMovie(mediaResult as TMDBMovie);
    } else {
      return _convertTMDBShow(mediaResult as TMDBShow);
    }
  }
}

async function _convertTMDBMovie(info: TMDBMovie): Promise<Movie> {
  const imdbId = await _getTMDBImdbId(info, 'movie');
  console.warn('GET YEAR FROM THIS:', info.release_date);
  let digitalRelease;
  try {
    const tmdbRelease = await rp({
      uri: `https://api.themoviedb.org/4/movie/${info.id}/release_dates?api_key=${process.env.TMDB_ID}`,
      headers: { Authorization: `Bearer ${process.env.TMDB_READ_ACCESS}` }
    });
    if (tmdbRelease.status_code) {
      throw new Error(tmdbRelease.status_message);
    }
    // Release types:
    // 1. Premiere
    // 2. Theatrical (limited)
    // 3. Theatrical
    // 4. Digital
    // 5. Physical
    // 6. TV
    const relevant = tmdbRelease.release_dates.filter((_release: any) => _release.type === 4);
    if (relevant.length === 0) {
      throw new Error('No results');
    }
    digitalRelease = relevant[0];
  } catch (err) {
    logError(`_convertTMDBMovie find release date failed: ${err}`);
  }
  return {
    id: convertImdbId(imdbId),
    type: 'movie',
    title: info.title,
    year: info.release_date,
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
    logError(`_searchTVDB Failed: ${err}`);
    throw new Error(`Can't find that show`)
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
  const idsResp = await rp({
    uri: `https://api.themoviedb.org/4/${type}/${info.id}/external_ids?api_key=${process.env.TMDB_ID}`,
    headers: { Authorization: `Bearer ${process.env.TMDB_READ_ACCESS}` }
  });
  if (idsResp.status_code) {
    throw new Error(idsResp.status_message);
  }
  return idsResp.imdb_id;
}

async function _makeTMDBMediaRequest(uri: string, year?: string|null, type?: 'movie'|'tv'): Promise<TMDBMedia> {
  try {
    let tmdbResp = await rp({
      uri,
      headers: { Authorization: `Bearer ${process.env.TMDB_READ_ACCESS}` }
    });
    if (tmdbResp.status_code) {
      throw new Error(tmdbResp.status_message);
    }
    let results = tmdbResp.results;
    console.warn('!!!!! FIX YEAR FILTER');
    if (year) {
      // results = results.filter((_media: TMDBMedia) =>
      //   _media.release_date && _media.release_date === year ||
      //   _media.first_air_date && _media.first_air_date === year);
    }
    if (type) {
      results = results.filter((_media: TMDBMedia) => _media.media_type === type);
    }
    if (results.length === 0) {
      throw new Error(`No results`);
    }
    const result = results[0];
    if (result.media_type !== 'movie' && result.media_type !== 'tv') {
      throw new Error(`Not a movie or tv show`);
    }
    return result;
  } catch (err) {
    logError(err);
    throw `Failed The Movie Database search: ${err}`;
  }
}

// Helper function to search TVDB and retry with a refreshed API token on error.
async function _searchTVDB(imdbId: string): Promise<TVDB> {
  // Token lasts for 24 hours - refresh if necessary.
  const now = new Date().getTime();
  const day = 24 * 60 * 60 * 1000;
  if (now - tvdbTokenTimestamp > day) {
    // Needs refresh.
    logDebug(`_searchTVDB: Refreshing token`);
    const {token} = await rp({
      uri: 'https://api.thetvdb.com/login',
      method: 'POST',
      json: { apikey: process.env.TVDB_ID }
    });
    tvdbToken = token;
    tvdbTokenTimestamp = now;
  }

  // Get the TVDB series ID from the imdbID.
  logDebug(`_searchTVDB: Fetching TVDB ID from IMDB ID`);
  const entriesJson = await rp({
    uri: 'https://api.thetvdb.com/search/series',
    headers: { 'Authorization': `Bearer ${tvdbToken}` },
    method: 'GET',
    qs: { imdbId }
  });
  const entries = JSON.parse(entriesJson).data;
  if (entries.length === 0) { throw new Error('Series not found in TVDB'); }
  const seriesId = entries[0].id;

  // Retrieved the ID, now fetch the series and episodes.
  logDebug(`_searchTVDB: Fetching series`);
  const seriesJson = await rp({
    uri: `https://api.thetvdb.com/series/${seriesId}`,
    headers: { 'Authorization': `Bearer ${tvdbToken}` },
    method: 'GET'
  })
  logDebug(`_searchTVDB: Fetching episodes`);
  const episodesJson = await rp({
    uri: `https://api.thetvdb.com/series/${seriesId}/episodes`,
    headers: { 'Authorization': `Bearer ${tvdbToken}` },
    method: 'GET'
  });

  // Convert and return.
  const series = JSON.parse(seriesJson).data;
  const episodes = JSON.parse(episodesJson).data;
  series.episodes = episodes;
  return series;
}

function hashEpisodeId(showId: number, seasonNum: number, episodeNum: number) {
  return (showId * 1000 * 1000) + (seasonNum * 1000) + episodeNum;
}

function getYMDString(date: Date): string {
  return `${date.getFullYear()}-${(date.getMonth() + 1)}-${date.getDate()}`;
}
