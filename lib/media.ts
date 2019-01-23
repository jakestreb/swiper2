import {SeasonEpisodes} from './Swiper';
import {getMorning, padZeros} from './util';

type Media = Movie | Show;

interface Movie {
  title: string,
  year: string
}

interface Show {
  title: string,
  episodes: Episode[]
}

interface Episode {

}



export abstract class Media {
  constructor(public readonly type: string, public readonly title: string) {}

  public toString(): string {
    return this.title;
  }
}

export class Episode {
  constructor(
    private _show: Show,
    private _seasonNum: number,
    private _episodeNum: number,
    private _airDate: Date|null
  ) {}

  public get show(): Show {
    return this._show;
  }

  public get seasonNum(): number {
    return this._seasonNum;
  };

  public get episodeNum(): number {
    return this._episodeNum;
  };

  public get airDate(): Date|null {
    return this._airDate;
  }

  public isEarlierThan(ep: Episode) {
    return this.seasonNum < ep.seasonNum || (this.seasonNum === ep.seasonNum &&
      this.episodeNum < ep.episodeNum);
  };

  public toString(): string {
    return `${this._show.title} S${this._seasonNum}E${this._episodeNum}`;
  };
}

export class Movie extends Media {
  constructor(title: string, private _year: string) {
    super('movie', title);
  }

  public get year() {
    return this._year;
  };

  public toString(): string {
    return `${this.title} (${this.year})`;
  };
}

export class Show extends Media {
  private _episodes: Episode[];

  constructor(title: string) {
    super('tv', title);
  }

  public get episodes() {
    return this._episodes;
  };

  public setEpisodes(episodes: Episode[]): void {
    episodes.sort((a, b) => a.isEarlierThan(b) ? -1 : 1);
    this._episodes = episodes;
  }

  public filterEpisodes(filter: SeasonEpisodes|'all'|'new'): void {
    if (filter === 'new') {
      // Unaired episodes only
      const morning = getMorning();
      this._episodes = this._episodes.filter(ep => ep.airDate && (ep.airDate > morning));
    } else if (filter !== 'all') {
      // Specific seasons/episodes
      this._episodes = this._episodes.filter(ep => {
        const season = filter[ep.seasonNum];
        return season && (season === 'all' || season.includes(ep.episodeNum));
      });
    }
  }

  public toString(): string {
    let epDesc = "";
    let epChain = 0;
    let lastEpisodeNum: number = -1;
    let lastSeasonNum: number = -1;
    this.episodes.forEach((ep, i) => {
      const e = padZeros(ep.episodeNum);
      const s = padZeros(ep.seasonNum);
      if (lastSeasonNum === -1 && lastEpisodeNum === -1) {
        epDesc += `S${s}E${e}`;
      } else if (ep.seasonNum > lastSeasonNum) {
        // New season
        epDesc += `-${padZeros(lastEpisodeNum)}, S${s}E${e}`;
        epChain = 0;
      } else if (ep.seasonNum === lastSeasonNum && (ep.episodeNum > lastEpisodeNum + 1)) {
        // Same season, later episode
        epDesc += `${epChain > 1 ? `-${padZeros(lastEpisodeNum)}` : ``} & E${e}`;
        epChain = 0;
      } else if (i === this.episodes.length - 1) {
        // Last episode
        epDesc += `-${e}`;
      } else {
        epChain++;
      }
      lastSeasonNum = ep.seasonNum;
      lastEpisodeNum = ep.episodeNum;
    });
    return `${this.title} ${epDesc}`;
  }
}
