import TextFormatter from '../io/formatters/TextFormatter';
import Media from './Media';
import * as util from '../util';

interface BuildArg {
  id: number;
  title: string;
  episodes: IEpisode[];
  addedBy?: number;
}

export default class Show extends Media implements IMedia {
  public type: 'tv' = 'tv';
  public id: number;
  public episodes: IEpisode[] = [];
  public title: string;
  public addedBy?: number;

  constructor(values: BuildArg) {
    super(values);
    this.id = values.id;
    this.episodes = values.episodes;
    this.addedBy = values.addedBy;
  }

  public getNextToAir(): IEpisode|null {
    return util.getNextToAir(this.episodes);
  }

  public getLastAired(): IEpisode|null {
    return util.getLastAired(this.episodes);
  }

  public getVideo(): IVideo|null {
    if (this.episodes.length === 1) {
      return this.episodes[0];
    }
    return null;
  }

  public getVideos(): IVideo[] {
    return this.episodes;
  }

  public sortEpisodes() {
    this.episodes.sort((a, b) => a.seasonNum < b.seasonNum ||
      (a.seasonNum === b.seasonNum && a.episodeNum < b.episodeNum) ? -1 : 1);
  }

  public filterEpisodes(filter: EpisodesDescriptor) {
    const episodes = this.episodes;
    if (filter === 'upcoming') {
      // Unaired episodes only
      const morning = util.getMorning();
      this.episodes = episodes.filter(ep => ep.airDate && (new Date(ep.airDate) > morning));
    } else if (filter === 'latest season') {
      const seasonEp = util.getNextToAir(episodes) || util.getLastAired(episodes);
      if (!seasonEp) {
        throw new Error('Cannot find latest season');
      }
      this.episodes = episodes.filter(ep => ep.seasonNum === seasonEp.seasonNum);
    } else if (filter === 'latest episode') {
      const ep = util.getLastAired(episodes);
      if (!ep) {
        throw new Error('Cannot find latest episode');
      }
      this.episodes = [ep];
    } else if (filter === 'all') {
      this.episodes = episodes;
    } else {
      // Specific seasons/episodes
      this.episodes = episodes.filter(ep => {
        const season = filter[ep.seasonNum];
        return season && (season === 'all' || season.includes(ep.episodeNum));
      });
    }
  }

  public format(f: TextFormatter): string {
    return `${f.b(this.title)} (${this.episodesToString()})`;
  }

  public toString(): string {
    return `${this.title} (${this.episodesToString()})`;
  }

  private episodesToString(): string {
    const episodes = this.episodes;
    let str = "";
    let chain = 0;
    let lastEpisode = -1;
    let lastSeason = -1;
    episodes.forEach((episode: IEpisode, i: number) => {
      const si = episode.seasonNum;
      const ei = episode.episodeNum;
      if (lastSeason === -1 && lastEpisode === -1) {
        str += `S${si} E${ei}`;
      } else if (si > lastSeason) {
        // New season
        str += `-${lastEpisode}, S${si} E${ei}`;
        chain = 0;
      } else if (si === lastSeason && (ei > lastEpisode + 1)) {
        // Same season, later episode
        str += `${chain > 0 ? `-${lastEpisode}` : ``} & E${ei}`;
        chain = 0;
      } else if (i === episodes.length - 1) {
        // Last episode
        str += `-${ei}`;
      } else {
        chain++;
      }
      lastSeason = si;
      lastEpisode = ei;
    });
    return str;
  }
}
