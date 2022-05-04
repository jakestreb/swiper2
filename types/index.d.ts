declare module 'node-tvdb';
declare module 'parse-torrent-name';

declare type Status = 'identified'|'unreleased'|'queued'|'downloading'|'uploading'|'completed';
declare type MediaType = 'movie'|'tv'|'episode';

declare interface TorrentResult {
  title: string;
  parsedTitle: string;
  seeders: number;
  leechers: number;
  uploadTime: string;
  magnet: string;
  quality: string;
  resolution: string;
  sizeMb: number;
}

declare interface DBEpisode {
  id: number; // IMDB id
  seasonNum: number;
  episodeNum: number;
  airDate: Date|null;
  showId: number;
  status: Status;
  addedBy?: number;
}

declare interface DBMovie {
  id: number; // IMDB id
  title: string;
  year: string;
  theatricalRelease: Date|null;
  streamingRelease: Date|null;
  status: Status;
  addedBy?: number;
}

declare interface DBShow {
  id: number; // Hashed id using show IMDB id, season num and episode num
  title: string;
  addedBy?: number;
}

declare interface DBTorrent {
  magnet: string;
  videoId: number;
  quality: string;
  resolution: string;
  sizeMb: number;
}

declare type DBMedia = DBMovie|DBShow;
declare type DBVideo = DBMovie|DBEpisode;

declare interface DBInsertOptions {
  status: Status;
  addedBy: number;
}

declare interface DBSearchOptions {
  type?: MediaType;
}

declare type Movie = DBMovie & {
  type: 'movie';
}

declare type Show = DBShow & {
  type: 'tv';
  episodes: Episode[];
}

declare type Episode = DBEpisode & {
  type: 'episode';
  showTitle: string;
}

declare type Media = Movie|Show;
declare type Video = Movie|Episode;

declare type TMovie = Movie & {
  torrents: DBTorrent[];
}

declare type TEpisode = Episode & {
  torrents: DBTorrent[];
}

declare type TVideo = TMovie|TEpisode;

declare interface DownloadProgress {
  progress: string;  // (0-100)
  speed: string;     // (MB/s)
  remaining: string; // (min)
  peers: number;
}
