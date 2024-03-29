declare interface Releases {
  theatrical?: Date;
  digital?: Date;
}

declare interface IVideo {
  id: number;
  type: string;
  status: Status;
  addedBy?: number;
  queueIndex: number;

  isMovie(): this is IMovie;
  isEpisode(): this is IEpisode;
  getDownloadPath(): string;
  addTorrents(torrents: ITorrent[]): TVideo;
  getFileSafeTitle(): string;
  getSearchDate(): Date;
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

  getExpectedRelease(): Date|null;
}

declare type IShow = IMedia & {
  type: 'tv';
  episodes: IEpisode[];

  get year(): string;

  getNextToAir(): IEpisode|null;
  getLastAired(): IEpisode|null;
  sortEpisodes(): void;
  filterEpisodes(filter: EpisodesDescriptor): void;
  episodesToString(): string;
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
  hash: string;
  videoId: number;
  quality: string;
  resolution: string;
  sizeMb: number;
  status: TorrentStatus;
  isUserPick: boolean;
  queueIndex: number;

  getDownloadPath(): string;
  addVideo(v: IVideo): VTorrent;
  format(f: TextFormatter, peers?: number, progress?: number): string;
  toString(): string;
}

declare interface IJob {
  id: number;
  type: JobType;
  status: JobStatus;
  videoId: number;
  schedule: JobSchedule;
  intervalS: number;
  runCount: number;
  startAt: Date;
  nextRunAt: Date;
}

declare type TVideo = IVideo & {
  torrents: ITorrent[];
}

declare type TMovie = TVideo & IMovie;
declare type TEpisode = TVideo & IEpisode;

declare type VTorrent = ITorrent & {
  video: IVideo;
}
