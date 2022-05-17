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
  startAt: Date;
}

declare interface Releases {
  theatrical?: Date;
  digital?: Date;
  dvd?: Date;
}

// declare interface DBEpisode {
//   id: number; // IMDB id
//   seasonNum: number;
//   episodeNum: number;
//   airDate?: number;
//   showId: number;
//   status: Status;
//   addedBy?: number;
//   queueIndex?: number;
// }

// declare interface DBMovie {
//   id: number; // IMDB id
//   title: string;
//   year: string;
//   theatricalRelease?: number;
//   streamingRelease?: number;
//   status: Status;
//   addedBy?: number;
//   queueIndex?: number;
// }

// declare interface DBShow {
//   id: number; // Hashed id using show IMDB id, season num and episode num
//   title: string;
//   addedBy?: number;
// }

// declare interface DBTorrent {
//   id: number;
//   magnet: string;
//   videoId: number;
//   quality: string;
//   resolution: string;
//   sizeMb: number;
//   status: TorrentStatus;
//   queueIndex?: number;
// }

declare interface IJob {
  id: number;
  type: JobType;
  videoId: number;
  schedule: JobSchedule;
  intervalS: number;
  runCount: number;
  startAt: Date;
  nextRunAt: Date;
  isDone: boolean;
}

// declare type DBMedia = DBMovie|DBShow;
// declare type DBVideo = DBMovie|DBEpisode;

declare interface DBInsertOptions {
  status: Status;
  addedBy: number;
}

declare interface DBSearchOptions {
  type?: MediaType;
}

declare interface IVideo {
  id: number;
  type: string;
  status: Status;
  addedBy?: number;
  queueIndex?: number;

  isMovie(): this is IMovie;
  isEpisode(): this is IEpisode;
  getDownloadPath(): string;
  getFileSafeTitle(): string;
  format(f: TextFormatter): string;
  toString(): string;
}

declare interface IMedia {
  id: number;
  type: string;
  title: string;
  addedBy?: number;

  isMovie(): this is IMovie;
  isShow(): this is IShow;
  getVideo(): IVideo|null;
  getVideos(): IVideo[];
  format(f: TextFormatter): string;
  toString(): string;
}

declare type IMovie = IVideo & IMedia & {
  type: 'movie';
  year: string;
  releases: Releases;
}

declare type IShow = IMedia & {
  type: 'tv';
  episodes: IEpisode[];

  sortEpisodes(): void;
  filterEpisodes(filter: EpisodesDescriptor): void;
}

declare type IEpisode = IVideo & {
  type: 'episode';
  seasonNum: number;
  episodeNum: number;
  airDate?: Date;
  showId: number;
  showTitle: string;
}

declare interface ITorrent {
  id: number;
  magnet: string;
  videoId: number;
  quality: string;
  resolution: string;
  sizeMb: number;
  status: TorrentStatus;
  queueIndex?: number;

  getDownloadPath(): string;
  format(f: TextFormatter, peers: number, progress: number): string;
  toString(): string;
}

declare type TVideo = IVideo & {
  torrents: ITorrent[];
}

declare type TMovie = TVideo & IMovie;
declare type TEpisode = TVideo & IEpisode;

declare type VTorrent = ITorrent & {
  video: IVideo;
}

// declare type OMovie = DBMovie & {
//   type: 'movie';
// }

// declare type OShow = DBShow & {
//   type: 'tv';
//   episodes: Episode[];
// }

// declare type OEpisode = DBEpisode & {
//   type: 'episode';
//   showTitle: string;
// }

// declare type OMedia = OMovie|OShow;
// declare type OVideo = OMovie|OEpisode;

// declare type TMovie = OMovie & {
//   torrents: DBTorrent[];
// }

// declare type TEpisode = OEpisode & {
//   torrents: DBTorrent[];
// }

// declare type TVideo = TMovie|TEpisode;

// declare type VTorrent = DBTorrent & { video: OVideo };

declare interface DownloadProgress {
  progress: number;  // (0-100)
  speed: number;     // (MB/s)
  remaining: number; // (min)
  peers: number;
}
