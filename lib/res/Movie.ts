import TextFormatter from '../io/formatters/TextFormatter';
import Video from './Video';

interface BuildArg {
  id: number;
  status: Status;
  title: string;
  year: string;
  theatricalRelease?: number;
  streamingRelease?: number;
  queueIndex?: number;
}

export default class Movie extends Video implements IVideo, IMedia {
  public type: 'movie' = 'movie';
  public title: string;
  public year: string;
  public theatricalRelease?: number;
  public streamingRelease?: number;

  constructor(values: BuildArg) {
    super(values);

    this.title = values.title;
    this.year = values.year;
    this.theatricalRelease = values.theatricalRelease;
    this.streamingRelease = values.streamingRelease;
  }

  public isMovie(): this is IMovie {
    return true;
  }

  public isShow(): this is IShow {
    return false;
  }

  public getVideo(): IVideo|null {
    return this;
  }

  public getVideos(): IVideo[] {
    return [this];
  }

  public getFileSafeTitle(): string {
    return this.title.replace(this.badFilenameChars, '');
  }

  public format(f: TextFormatter): string {
    return f.b(this.title);
  }

  public toString(): string {
    return this.title;
  }
}
