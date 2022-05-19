import TextFormatter from '../io/formatters/TextFormatter';
import Video from './Video';

interface BuildArg {
  id: number;
  status: Status;
  title: string;
  year: string;
  releases: Releases;
  queueIndex?: number;
}

export default class Movie extends Video implements IVideo, IMedia {
  private static DAYS_BEFORE_DIGITAL = 10;
  private static DAYS_AFTER_THEATRICAL = 21;

  public type: 'movie' = 'movie';
  public title: string;
  public year: string;
  public releases: Releases;

  constructor(values: BuildArg) {
    super(values);

    this.title = values.title;
    this.year = values.year;
    this.releases = values.releases;
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

  public getExpectedRelease(): Date {
    const { theatrical, digital } = this.releases;
    if (!theatrical && !digital) {
      return new Date();
    }
    const offset = digital ? -Movie.DAYS_BEFORE_DIGITAL : Movie.DAYS_AFTER_THEATRICAL;
    const date = new Date(digital || theatrical!);
    date.setDate(date.getDate() + offset);
    return date;
  }

  public format(f: TextFormatter): string {
    return f.b(this.title);
  }

  public toString(): string {
    return this.title;
  }
}
