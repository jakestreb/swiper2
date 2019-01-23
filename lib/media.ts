import {EpisodesDescriptor} from './Swiper';
import {getMorning} from './util';

export type Media = Movie | Show;

export interface Movie {
  type: 'movie',
  title: string,
  year: string
}

export interface Show {
  type: 'tv',
  title: string,
  episodes: Episode[]
}

export interface Episode {
  seasonNum: number,
  episodeNum: number,
  airDate: Date|null
}

export function stringify(media: Media): string {
  if (media.type === 'movie') {
    return `${media.title} (${media.year})`;
  } else {
    return media.title;
  }
}

export function createMovie(title: string, year: string): Movie {
  return {type: 'movie', title, year};
}

export function createShow(title: string, episodes: Episode[]): Show {
  return {type: 'tv', title, episodes};
};

export function createEpisode(seasonNum: number, episodeNum: number, airDate: Date|null): Episode {
  return {seasonNum, episodeNum, airDate};
};

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
