import Episode from '../../res/Episode';
import Base from './Base';

interface EpisodeDBRow {
  id: number;
  seasonNum: number;
  episodeNum: number;
  airDate?: number;
  showId: number;
  showTitle: string;
  status: Status;
  queueIndex: number;
  addedBy: number;
  createdAt: Date;
}

export default class Episodes extends Base<EpisodeDBRow, IEpisode> {
  public async init(): Promise<this> {
    await this.run(`CREATE TABLE IF NOT EXISTS episodes (
      id INTEGER PRIMARY KEY,
      seasonNum INTEGER,
      episodeNum INTEGER,
      airDate DATETIME,
      showId INTEGER,
      showTitle TEXT,
      status TEXT DEFAULT unreleased,
      queueIndex INTEGER DEFAULT -1,
      addedBy INTEGER,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    return this;
  }

  public async buildInstance(row: EpisodeDBRow): Promise<IEpisode> {
    const airDate = row.airDate ? new Date(row.airDate) : undefined;
    return new Episode({ ...row, airDate });
  }

  public async getOne(id: number): Promise<IEpisode|void> {
    return this.get('SELECT * FROM episodes WHERE id=? LIMIT 1', [id]);
  }

  public getWithStatus(...statuses: Status[]): Promise<IEpisode[]> {
    return this.all(`SELECT * FROM episodes WHERE status IN (${statuses.map(e => '?')})`, statuses);
  }

  public getFromShow(showId: number): Promise<IEpisode[]> {
    return this.all('SELECT * FROM episodes WHERE showId=?', [showId]);
  }

  public async setStatus(episode: IEpisode, status: Status): Promise<IEpisode> {
    if (episode.status === status) {
      return episode;
    }
    await this.run('UPDATE episodes SET status=? WHERE id=?', [status, episode.id]);
    return { ...episode, status };
  }

  public async addTorrents(episode: IEpisode): Promise<TEpisode> {
    const torrents = await this.db.torrents.getForVideo(episode.id);
    return { ...episode, torrents };
  }

  public async insert(arg: IEpisode, options: DBInsertOptions): Promise<void> {
    await this.run(`INSERT INTO episodes (id, seasonNum, episodeNum, airDate, ` +
        `showId, showTitle, status, addedBy) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [arg.id, arg.seasonNum, arg.episodeNum, arg.airDate, arg.showId,
          arg.showTitle, options.status, options.addedBy]);
  }

  public async delete(...ids: number[]): Promise<void> {
    await this.run(`DELETE FROM episodes WHERE id IN (${ids.map(e => '?')})`, ids);
    // Delete show if no episodes remain
    await this.run(`DELETE FROM shows WHERE id NOT IN (SELECT showId FROM episodes)`);
  }
}
