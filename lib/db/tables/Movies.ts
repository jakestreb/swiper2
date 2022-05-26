import Movie from '../../res/Movie';
import Base from './Base';

interface MovieInsertArg {
  id: number;
  title: string;
  year: string;
  releases: {
    theatrical: Date;
    digital: Date;
  };
}

interface MovieDBRow {
  id: number;
  title: string;
  year: string;
  theatricalRelease?: number;
  digitalRelease?: number;
  status: Status;
  queueIndex: number;
  addedBy: number;
  createdAt: Date;
}

export default class Movies extends Base<MovieDBRow, IMovie> {
  public async init(): Promise<this> {
    await this.run(`CREATE TABLE IF NOT EXISTS movies (
      id INTEGER PRIMARY KEY,
      title TEXT,
      year TEXT,
      theatricalRelease DATETIME,
      digitalRelease DATETIME,
      status TEXT,
      queueIndex INTEGER DEFAULT -1,
      addedBy INTEGER,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    return this;
  }

  public buildInstance(row: MovieDBRow): IMovie {
    const releases = {
      digital: row.digitalRelease ? new Date(row.digitalRelease) : undefined,
      theatrical: row.theatricalRelease ? new Date(row.theatricalRelease) : undefined,
    };
    return new Movie({ ...row, releases });
  }

  public async getOne(id: number): Promise<IMovie|void> {
    return this.get('SELECT * FROM movies WHERE id=? LIMIT 1', [id]);
  }

  public search(input: string): Promise<IMovie[]> {
    return this.all(`SELECT * FROM movies WHERE title LIKE ?`, [`%${input}%`]);
  }

  public getWithStatus(...statuses: Status[]): Promise<IMovie[]> {
    return this.all(`SELECT * FROM movies WHERE status IN (${statuses.map(e => '?')})`, statuses);
  }

  public async setStatus(movie: IMovie, status: Status): Promise<IMovie> {
    if (movie.status === status) {
      return movie;
    }
    await this.run('UPDATE movies SET status=? WHERE id=?', [status, movie.id]);
    return { ...movie, status };
  }

  public async addTorrents(movie: IMovie): Promise<TMovie> {
    const torrents = await this.db.torrents.getForVideo(movie.id);
    return { ...movie, torrents };
  }

  public async insert(arg: MovieInsertArg, options: DBInsertOptions): Promise<void> {
    const { theatrical, digital } = arg.releases;
    await this.run('INSERT INTO movies '
      + '(id, title, year, theatricalRelease, digitalRelease, status, addedBy) '
      + 'VALUES (?, ?, ?, ?, ?, ?, ?)',
        [arg.id, arg.title, arg.year, theatrical, digital, options.status, options.addedBy]);
  }

  public async delete(...ids: number[]): Promise<void> {
    await this.run(`DELETE FROM movies WHERE id IN (${ids.map(e => '?')})`, ids);
  }
}
