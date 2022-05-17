import TextFormatter from '../io/formatters/TextFormatter';
import Video from './Video';

interface BuildArg {
  id: number;
  status: Status;
  seasonNum: number;
  episodeNum: number;
  showId: number;
  showTitle: string;
  airDate?: number;
  addedBy?: number;
  queueIndex?: number;
}

export default class Episode extends Video implements IEpisode {
  public type: 'episode' = 'episode';
  public seasonNum: number;
  public episodeNum: number;
  public showId: number;
  public showTitle: string;
  public airDate?: number;

  constructor(values: BuildArg) {
    super(values);

    this.seasonNum = values.seasonNum;
    this.episodeNum = values.episodeNum;
    this.showId = values.showId;
    this.showTitle = values.showTitle;
    this.airDate = values.airDate;
  }

  public getFileSafeTitle(): string {
    return this.showTitle.replace(this.badFilenameChars, '');
  }

  public format(f: TextFormatter) {
    return f.b(`${this.showTitle} S${this.seasonNum} E${this.episodeNum}`);
  }

  public toString() {
    return `${this.showTitle} (S${this.seasonNum} E${this.episodeNum})`;
  }
}
