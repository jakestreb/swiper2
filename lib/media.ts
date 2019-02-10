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

export interface Metadata {
  magnet: string|null;
  quality: string|null;
  resolution: string|null;
  size: number|null;
  blacklisted: string[]; // Array of blacklisted magnets
}

export type MovieMeta = Movie & Metadata;
export type EpisodeMeta = Episode & Metadata;
export type VideoMeta = MovieMeta|EpisodeMeta;

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

// Filters all shows episodes in the media array, and removes any shows without episodes.
export function filterMediaEpisodes(mediaItems: Media[], filter: EpisodesDescriptor): Media[] {
  return mediaItems
  .map(media => {
    if (media.type === 'tv') {
      media.episodes = filterEpisodes(media.episodes, filter);
    }
    return media;
  })
  .filter(media => media.type === 'movie' || media.episodes.length > 0);
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

export function getFileSafeTitle(video: Video): string {
  const regex = /[\\/:*?"<>|'\.]/g;
  if (video.type === 'movie') {
    return video.title.replace(regex, '');
  } else if (video.type === 'episode') {
    return video.show.title.replace(regex, '');
  } else {
    throw new Error(`getFileSafeTitle error: invalid video`);
  }
}

export function getDescription(anyMedia: Movie|Show|Episode): string {
  if (anyMedia.type === 'episode') {
    return `${anyMedia.show.title} S${padZeros(anyMedia.seasonNum)}E${padZeros(anyMedia.episodeNum)}`;
  } else if (anyMedia.type === 'tv') {
    return `${anyMedia.title} ${getExpandedEpisodeStr(anyMedia.episodes)}`;
  } else {
    return anyMedia.title;
  }
}

// If the media object represents a single video, returns that video. Otherwise returns null.
export function getVideo(media: Media): Video|null {
  if (media.type === 'movie') {
    return media;
  } else if (media.type === 'tv' && media.episodes.length === 1) {
    return media.episodes[0];
  } else {
    return null;
  }
}

/**
 * Returns a string giving all seasons and episodes for a show already fetched from TVDB.
 */
function getExpandedEpisodeStr(episodes: Episode[]): string {
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
      str += `${chain > 0 ? `-${padZeros(lastEpisode)}` : ``} & E${padZeros(ei)}`;
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
