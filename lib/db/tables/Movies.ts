import Base from './Base';

export default class Movies extends Base {
  public async init(): Promise<this> {
    await this.db.run(`CREATE TABLE IF NOT EXISTS movies (
      id INTEGER PRIMARY KEY,
      title TEXT,
      year TEXT,
      theatricalRelease DATETIME,
      streamingRelease DATETIME,
      status TEXT,
      queueIndex INTEGER DEFAULT -1,
      addedBy INTEGER,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    return this;
  }

  public async get(id: number): Promise<Movie|null> {
    const movies = await this.all('SELECT * FROM movies WHERE id=? LIMIT 1', [id]);
    return movies.length > 0 ? movies[0] : null;
  }

  public search(input: string): Promise<Movie[]> {
    return this.all(`SELECT * FROM movies WHERE title LIKE ?`, [`%${input}%`]);
  }

  public getWithStatus(...statuses: Status[]): Promise<Movie[]> {
    return this.all(`SELECT * FROM movies WHERE status IN (${statuses.map(e => '?')})`, statuses);
  }

  public async setStatus(movie: Movie, status: Status): Promise<Movie> {
    if (movie.status === status) {
      return movie;
    }
    await this.db.run('UPDATE movies SET status=? WHERE id=?', [status, movie.id]);
    return { ...movie, status };
  }

  public async addTorrents(movie: Movie): Promise<TMovie> {
    const torrents = await this.db.torrents.getForVideo(movie.id);
    return { ...movie, torrents };
  }

  public async insert(arg: Movie, options: DBInsertOptions): Promise<void> {
    await this.db.run('INSERT INTO movies '
      + '(id, title, year, theatricalRelease, streamingRelease, status, addedBy) '
      + 'VALUES (?, ?, ?, ?, ?, ?, ?)',
        [arg.id, arg.title, arg.year, arg.theatricalRelease, arg.streamingRelease,
        options.status, options.addedBy]);
  }

  private async all(sqlCommand: string, sqlArgs: any[] = []): Promise<Movie[]> {
    const rows: DBMovie[] = await this.db.all(sqlCommand, sqlArgs);
    const movies = await Promise.all(rows.map(r => rowToMovie(r)));
    return movies;
  }

  public async delete(...ids: number[]): Promise<void> {
    await this.db.run(`DELETE FROM movies WHERE id IN (${ids.map(e => '?')})`, ids);
  }
}

function rowToMovie(row: DBMovie): Movie {
  return {
    ...row,
    type: 'movie',
  };
}
