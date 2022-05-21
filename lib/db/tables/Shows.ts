import Show from '../../res/Show';
import Base from './Base';

interface ShowInsertArg {
  id: number;
  title: string;
  episodes: IEpisode[];
}

interface ShowDBRow {
  id: number;
  title: string;
  addedBy: number;
  createdAt: Date;
}

export default class Shows extends Base<ShowDBRow, IShow> {
  public async init(): Promise<this> {
    await this.run(`CREATE TABLE IF NOT EXISTS shows (
      id INTEGER PRIMARY KEY ON CONFLICT REPLACE,
      title TEXT,
      addedBy INTEGER,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    return this;
  }

  public async buildInstance(row: ShowDBRow): Promise<IShow> {
    const show = new Show({ ...row, episodes: [] });
    show.episodes = await this.db.episodes.getFromShow(show.id);
    return show;
  }

  public async getEmpty(showId: number): Promise<IShow|void> {
    const row = await this.db.get(`SELECT * FROM shows WHERE id=? LIMIT 1`, [showId]);
    return new Show({ ...row, episodes: [] });
  }

  // Returns shows with episodes filtered by the given statuses
  public async getWithStatus(...statuses: Status[]): Promise<IShow[]> {
    const episodes: IEpisode[] = await this.db.episodes.getWithStatus(...statuses);
    const episodesByShow: { [showId: number]: IEpisode[] } = {};
    episodes.forEach(e => {
      episodesByShow[e.showId] = episodesByShow[e.showId] || [];
      episodesByShow[e.showId].push(e);
    });
    const showIds = Object.keys(episodesByShow);
    const shows: IShow[] = await this.all(`SELECT * FROM shows WHERE id IN (${showIds.map(id => '?')})`, showIds);
    shows.forEach(s => s.episodes = episodesByShow[s.id]);
    return shows;
  }

  public search(input: string): Promise<IShow[]> {
    return this.all('SELECT * FROM shows WHERE title LIKE ?', [`%${input}%`]);
  }

  public async insert(arg: ShowInsertArg, options: DBInsertOptions): Promise<void> {
    await this.run(`INSERT INTO shows (id, title, addedBy) VALUES (?, ?, ?)`,
        [arg.id, arg.title, options.addedBy]);
    await Promise.all(arg.episodes.map(e => this.db.episodes.insert(e, options)));
  }
}
