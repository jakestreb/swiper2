import {EpisodesDescriptor} from './Swiper';
import {getMorning, padZeros} from './util';

export type Media = Movie | Show;

export interface Movie {
  type: 'movie';
  title: string;
  year: string;
  release: Date|null;
  dvd: Date|null;
}

export interface Show {
  type: 'tv';
  title: string;
  episodes: Episode[];
}

export interface Episode {
  seasonNum: number;
  episodeNum: number;
  airDate: Date|null;
}

export function filterEpisodes(episodes: Episode[], filter: EpisodesDescriptor): Episode[] {
  if (filter === 'new') {
    // Unaired episodes only
    const morning = getMorning();
    return episodes.filter(ep => ep.airDate && (ep.airDate > morning));
  } else if (filter === 'all') {
    return episodes;
  } else {
    // Specific seasons/episodes
    return episodes.filter(ep => {
      const season = filter[ep.seasonNum];
      return season && (season === 'all' || season.includes(ep.episodeNum));
    });
  }
}

export function sortEpisodes(episodes: Episode[]): Episode[] {
  episodes.sort((a, b) => a.seasonNum < b.seasonNum ||
    (a.seasonNum === b.seasonNum && a.episodeNum < b.episodeNum) ? -1 : 1);
  return episodes;
}

// Returns a string of the form: "S01 - S04: 6 episodes, S05: 8 episodes"
export function getEpisodesPerSeasonStr(episodes: Episode[]): string {
  if (episodes.length === 0) {
    return 'No episodes';
  }
  const episodeCount: {[seasonNum: string]: number} = {};
  episodes.forEach(ep => { episodeCount[ep.seasonNum] += 1; });
  const order = Object.keys(episodeCount).map(seasonStr => parseInt(seasonStr, 10)).sort((a, b) => a - b);
  let streakStart: number = 0;
  let str = '';
  for (const s of order) {
    if (s <= 1 || order[s] !== order[s - 1]) {
      if (streakStart < s - 1) {
        str += `S${padZeros(streakStart)} - S${padZeros(s - 1)}: ${episodeCount[s - 1]} episodes, `;
      } else {
        str += `S${padZeros(s - 1)}: ${episodeCount[s - 1]} episodes, `;
      }
      streakStart = s;
    }
  }
  // Remove ending comma.
  return str.slice(0, str.length - 2);
}

export function getNextToAir(episodes: Episode[]): Episode|null {
  const morning = getMorning();
  return episodes.find(ep => ep.airDate !== null && (ep.airDate >= morning)) || null;
}

export function getLastAired(episodes: Episode[]): Episode|null {
  const morning = getMorning();
  return episodes.slice().reverse().find(ep => ep.airDate !== null && (ep.airDate < morning)) || null;
}

export function getEpisodeStr(episodes: Episode[]): string {
  let str = "";
  let chain = 0;
  let lastEpisode = -1;
  let lastSeason = -1;
  episodes.forEach((episode: Episode, i: number) => {
    const si = episode.seasonNum;
    const ei = episode.episodeNum;
    if (lastSeason === -1 && lastEpisode === -1) {
      str += `S${padZeros(si)}E${padZeros(ei)}`;
    } else if (si > lastSeason) {
      // New season
      str += `-${padZeros(lastEpisode)}, S${padZeros(si)}E${padZeros(ei)}`;
      chain = 0;
    } else if (si === lastSeason && (ei > lastEpisode + 1)) {
      // Same season, later episode
      str += `${chain > 1 ?
        `-${padZeros(lastEpisode)}` : ``} & E${padZeros(ei)}`;
      chain = 0;
    } else if (i === episodes.length - 1) {
      // Last episode
      str += `-${padZeros(ei)}`;
    } else {
      chain++;
    }
    lastSeason = si;
    lastEpisode = ei;
  });
  return str;
}
