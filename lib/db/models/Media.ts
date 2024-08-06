import TextFormatter from '../../functions/message/formatters/TextFormatter.js';

interface BuildArg {
  id: number;
  title: string;
  addedBy?: number;
}

export default abstract class Media implements IMedia {
  public abstract type: 'tv'|'movie';

  public id: number;
  public title: string;
  public addedBy?: number;

  constructor(values: BuildArg) {
    this.id = values.id;
    this.title = values.title;
    this.addedBy = values.addedBy;
  }

  public isMovie(): this is IMovie {
    return this.type === 'movie';
  }

  public isShow(): this is IShow {
    return this.type === 'tv';
  }

  public abstract format(f: TextFormatter): string;

  public abstract getVideo(): IVideo|null;

  public abstract getVideos(): IVideo[];

  public abstract toString(): string;
}
