declare module 'parse-torrent-name';

declare type Status = 'identified'|'unreleased'|'searching'|'downloading'|'uploading'|'completed';
declare type TorrentStatus = 'downloading'|'slow'|'paused';
declare type MediaType = 'movie'|'tv'|'episode';
declare type JobType = 'AddTorrent'|'DeleteVideo'|'QueueVideo';
declare type JobSchedule = 'once'|'repeated'|'backoff';

declare interface SwiperReply {
  data?: string;
  err?: string;
  final?: boolean;
}

declare interface MediaQuery {
  title: string;
  type: 'movie'|'tv'|null;
  episodes: EpisodesDescriptor|null;
  year: string|null;
}

declare interface SeasonEpisodes {
  [season: string]: number[]|'all';
}

declare type EpisodesDescriptor = SeasonEpisodes|'new'|'all';

declare type CommandFn = (input?: string) => Promise<SwiperReply>|SwiperReply;

declare interface Conversation {
  id: number;
  input?: string;
  commandFn?: CommandFn;
  mediaQuery?: MediaQuery;
  media?: Media;
  position?: 'first'|'last';
  torrents?: TorrentResult[];
  storedMedia?: Media[];
  pageNum?: number;
}

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

declare interface JobDescription {
  type: JobType;
  videoId: number;
  schedule: JobSchedule;
  intervalSeconds: number;
}

declare interface DBEpisode {
  id: number; // IMDB id
  seasonNum: number;
  episodeNum: number;
  airDate: Date|null;
  showId: number;
  status: Status;
  addedBy?: number;
  queueIndex: number;
}

declare interface DBMovie {
  id: number; // IMDB id
  title: string;
  year: string;
  theatricalRelease: Date;
  streamingRelease: Date;
  status: Status;
  addedBy?: number;
  queueIndex: number;
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
  status: TorrentStatus;
  queueIndex?: number;
}

declare interface DBJob {
  id: number;
  type: JobType;
  videoId: number;
  schedule: JobSchedule;
  intervalSeconds: number;
  runCount: number;
  runAt: Date;
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
  progress: number;  // (0-100)
  speed: number;     // (MB/s)
  remaining: number; // (min)
  peers: number;
  receivedMb: number;
}
