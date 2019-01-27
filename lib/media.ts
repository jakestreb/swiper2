import {EpisodesDescriptor} from './Swiper';
import {getMorning, padZeros} from './util';

export type Media = Movie|Show;
export type Video = Movie|Episode;

export interface Movie {
  id: number;
  type: 'movie';
  title: string;
  year: string;
  release: Date|null;
  dvd: Date|null;
}

export interface Show {
  id: number;
  type: 'tv';
  title: string;
  episodes: Episode[];
}

export interface Episode {
  id: number;
  type: 'episode';
  show: Show;
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

export function getNextToAir(episodes: Episode[]): Episode|null {
  const morning = getMorning();
  return episodes.find(ep => ep.airDate !== null && (ep.airDate >= morning)) || null;
}

export function getLastAired(episodes: Episode[]): Episode|null {
  const morning = getMorning();
  return episodes.slice().reverse().find(ep => ep.airDate !== null && (ep.airDate < morning)) || null;
}

export function getSearchTerm(video: Video): string {
  if (video.type === 'movie') {
    const cleanTitle = video.title.replace(/\'/g, "").replace(/[^a-zA-Z ]+/g, " ");
    return `${cleanTitle} ${video.year}`;
  } else if (video.type === 'episode') {
    const cleanTitle = video.show.title.replace(/\'/g, "").replace(/[^a-zA-Z ]+/g, " ");
    return `${cleanTitle} s${padZeros(video.seasonNum)}e${padZeros(video.episodeNum)}`;
  } else {
    throw new Error(`getSearchTerm error: invalid video`);
  }
}
