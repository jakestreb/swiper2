import TextFormatter from '../io/formatters/TextFormatter';

interface BuildArg {
  id: number;
  status: Status;
  addedBy?: number;
  queueIndex?: number;
}

export default abstract class Video implements IVideo {
  public abstract type: 'movie'|'episode';

  public id: number;
  public status: Status;
  public addedBy?: number;
  public queueIndex?: number;

  public torrents?: ITorrent[];
  public badFilenameChars: RegExp = /[\\/:*?"<>|'\.]/g;

  constructor(values: BuildArg) {
    this.id = values.id;
    this.status = values.status;
    this.addedBy = values.addedBy;
    this.queueIndex = values.queueIndex;
  }

  public isMovie(): this is IMovie {
    return this.type === 'movie';
  }

  public isEpisode(): this is IEpisode {
    return this.type === 'episode';
  }

  public addTorrents(torrents: ITorrent[]): TVideo {
    this.torrents = torrents;
    return (this as TVideo);
  }

  public getDownloadPath(): string {
    return `${this.id}`;
  }

  public abstract format(f: TextFormatter): string;

  public abstract getFileSafeTitle(): string;

  public abstract toString(): string;
}
