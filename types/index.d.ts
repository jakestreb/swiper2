declare module 'any-date-parser';
declare module 'get-folder-size';
declare module 'parse-torrent-name';

declare type Status = 'identified'|'unreleased'|'searching'|'downloading'|'exporting'|'completed';

// Note torrents should only have status 'removed' if they were singularly removed
declare type TorrentStatus = 'pending'|'downloading'|'slow'|'paused'|'completed'|'removed';

declare type JobStatus = 'pending'|'running'|'done';

declare type MediaType = 'movie'|'tv'|'episode';

declare type JobType = 'AddTorrent'|'CheckForRelease'|'DeleteVideo'|'MonitorDownload'|'StartSearching';

declare type JobSchedule = 'once'|'repeated'|'backoff';

declare type EpisodesDescriptor = SeasonEpisodes|'upcoming'|'latest season'|'latest episode'|'all';

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

declare interface TextFormatter {
  multiMessage(...items: string[]): string;
  dataRow(...items: Array<string|null>): string;
  commands(...rows: string[]): string;

  sp(length: number): string; // Fixed space
  b(text: string): string; // Bold
  i(text: string): string; // Italics
  u(text: string): string; // Underline
  s(text: string): string; // Strikethrough
  m(text: string): string; // Monospace
}

declare interface SeasonEpisodes {
  [season: string]: number[]|'all';
}

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
  hash: string;
  quality: string;
  score: number;
  starRating: 0|1|2|3|4|5;
}

declare interface JobDescription {
  type: JobType;
  videoId: number;
  startAt: Date;
}

declare interface DownloadProgress {
  progress?: number;  // (0-100)
  speed?: number;     // (MB/s)
  remaining?: number; // (min)
  peers?: number;
}

declare interface DBInsertOptions {
  status: Status;
  addedBy: number;
}

declare interface DBSearchOptions {
  type?: MediaType;
}
