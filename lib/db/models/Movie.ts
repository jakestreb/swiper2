import TextFormatter from '../../functions/message/formatters/TextFormatter';
import Video from './Video';

interface BuildArg {
  id: number;
  status: Status;
  title: string;
  year: string;
  releases: Releases;
  queueIndex: number;
}

export default class Movie extends Video implements IVideo, IMedia {
  private static SEARCH_DAYS_BEFORE_DIGITAL = 10;
  private static SEARCH_DAYS_AFTER_THEATRICAL = 21;

  private static EXPECT_DAYS_AFTER_THEATRICAL = 60;

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

  public getSearchDate(): Date {
    const { theatrical, digital } = this.releases;
    if (!theatrical && !digital) {
      return new Date();
    }
    const offset = digital ? -Movie.SEARCH_DAYS_BEFORE_DIGITAL : Movie.SEARCH_DAYS_AFTER_THEATRICAL;
    const date = new Date(digital || theatrical!);
    date.setDate(date.getDate() + offset);
    return date;
  }

  public getExpectedRelease(): Date|null {
    const { theatrical, digital } = this.releases;
    if (!theatrical && !digital) {
      return null;
    }
    const offset = digital ? 0 : Movie.EXPECT_DAYS_AFTER_THEATRICAL;
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
