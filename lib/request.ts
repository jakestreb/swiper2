import {get} from 'http';
import * as TVDB from 'node-tvdb';

import {Episode, Media, Show, sortEpisodes} from './media';
import {MediaQuery} from './Swiper';
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
}

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
  // TODO: Define return type.
  let omdbResult: OMDB;
  let tvdbResult: TVDB;
  const title = info.title.replace(/\&/g, '\\&');
  const year = info.year ? `&y=${info.year}` : ``;
  const type = info.type ? `&type=${info.type}` : ``;
  const url = `http://www.omdbapi.com/?apikey=${process.env.OMDB_ID}&t=${title}` + year + type;
  try {
    // Escape all ampersands in the title for searching via web API
    omdbResult = await getJSONResponse(url) as OMDB;
  } catch (err) {
    return { err: `Can't access the Open Movie Database` };
  }
  if (!omdbResult) {
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
        dvd: getDateFromStr(omdbResult.DVD),
        magnet: null
      }
    };
  } else {
    // TV Show
    try {
      tvdbResult = await _searchTVDB(omdbResult.imdbID);
    } catch (err) {
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
      airDate: ep.firstAired ? new Date(`${ep.firstAired} ${tvdbResult.airsTime}`) : null,
      magnet: null
    }));
    show.episodes.push(...sortEpisodes(episodes))
    return {
      data: show
    };
  }
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

async function getJSONResponse(url: string): Promise<{[key: string]: any}> {
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
