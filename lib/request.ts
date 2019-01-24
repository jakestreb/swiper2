import * as TVDB from 'node-tvdb';

import {Media, sortEpisodes} from './media';
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
  imdbID: string;
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
}

// Returns the media with all episodes. Filtering must be performed afterward.
export async function identifyMedia(info: MediaQuery): Promise<DataResponse<Media>> {
  // TODO: Define return type.
  let omdbResult: OMDB;
  let tvdbResult: TVDB;
  try {
    // Escape all ampersands in the title for searching via web API
    const title = info.title.replace(/\&/g, '\\&');
    const year = info.year ? `&y=${info.year}` : ``;
    const type = info.type ? `&type=${info.type}` : ``;
    const resp = await fetch(`http://www.omdbapi.com/?apikey=${process.env.OMDB_ID}` +
      `&t=${title}` + year + type);
    omdbResult = await resp.json();
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
      return { err: `Can't find that show` };
    }
    const episodes = tvdbResult.episodes.map(ep => ({
      seasonNum: ep.airedSeason,
      episodeNum: ep.airedEpisodeNumber,
      airDate: ep.firstAired ? new Date(`${ep.firstAired} ${tvdbResult.airsTime}`) : null
    }));
    return {
      data: {
        type: 'tv',
        title: omdbResult.Title,
        episodes: sortEpisodes(episodes);
      }
    };
  }
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
