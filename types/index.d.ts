declare module 'get-folder-size';
declare module 'parse-torrent-name';

declare type Status = 'identified'|'unreleased'|'searching'|'downloading'|'uploading'|'completed';

// Note torrents should only have status 'removed' if they specifically were removed
declare type TorrentStatus = 'downloading'|'slow'|'paused'|'completed'|'removed';

declare type MediaType = 'movie'|'tv'|'episode';

declare type JobType = 'AddTorrent'|'CheckForRelease'|'DeleteVideo'|'MonitorDownload'|'StartSearching';
declare type JobSchedule = 'once'|'repeated'|'backoff';

declare interface SwiperReply {
  data?: string;
  err?: string;
  final?: boolean;
}

declare interface MediaQuery {
  title: string;
  type: 'movie'|'tv'|'torrent'|null;
  episodes: EpisodesDescriptor|null;
  year: string|null;
}

declare interface SeasonEpisodes {
  [season: string]: number[]|'all';
}

declare type EpisodesDescriptor = SeasonEpisodes|'upcoming'|'latest season'|'latest episode'|'all';

declare type CommandFn = (input?: string) => Promise<SwiperReply>|SwiperReply;

declare interface Conversation {
  id: number;
  input?: string;
  commandFn?: CommandFn;
  mediaQuery?: MediaQuery;
  media?: Media;
  torrents?: TorrentResult[];
  storedMedia?: Media[];
  storedVideos?: TVideo[];
  pageNum?: number;
}

declare interface PartialTorrent {
  title: string;
  parsedTitle: string;
  seeders: number;
  resolution: string;
  sizeMb: number;
}

declare type TorrentResult = PartialTorrent & {
  leechers: number;
  uploadTime: string;
  magnet: string;
  quality: string;
  starRating: 1|2|3|4;
}

declare interface JobDescription {
  type: JobType;
  videoId: number;
  startAt: number;
}

declare interface DBEpisode {
  id: number; // IMDB id
  seasonNum: number;
  episodeNum: number;
  airDate?: number;
  showId: number;
  status: Status;
  addedBy?: number;
  queueIndex?: number;
}

declare interface DBMovie {
  id: number; // IMDB id
  title: string;
  year: string;
  theatricalRelease?: number;
  streamingRelease?: number;
  status: Status;
  addedBy?: number;
  queueIndex?: number;
}

declare interface DBShow {
  id: number; // Hashed id using show IMDB id, season num and episode num
  title: string;
  addedBy?: number;
}

declare interface DBTorrent {
  id: number;
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
  intervalS: number;
  runCount: number;
  startAt: number;
  nextRunAt: number;
  isDone: boolean;
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

declare type VTorrent = DBTorrent & { video: Video };

declare interface DownloadProgress {
  progress: number;  // (0-100)
  speed: number;     // (MB/s)
  remaining: number; // (min)
  peers: number;
}
