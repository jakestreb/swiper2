import Torrent from '../models/Torrent';
import Base from './Base';

interface TorrentInsertArg {
  hash: string;
  videoId: number;
  quality: string;
  resolution: string;
  sizeMb: number;
  status: TorrentStatus;
  isUserPick: boolean;
}

interface TorrentDBRow {
  id: number;
  hash: string;
  videoId: number;
  quality: string;
  resolution: string;
  sizeMb: number;
  status: TorrentStatus;
  isUserPick: boolean;
  queueIndex: number;
  createdAt: Date;
}

export default class Torrents extends Base<TorrentDBRow, ITorrent> {
  public async init(): Promise<this> {
    await this.run(`CREATE TABLE IF NOT EXISTS torrents (
      id INTEGER PRIMARY KEY,
      hash TEXT UNIQUE ON CONFLICT REPLACE,
      videoId INTEGER,
      quality TEXT,
      resolution TEXT,
      sizeMb INTEGER,
      status TEXT,
      isUserPick INTEGER DEFAULT 0,
      queueIndex INTEGER DEFAULT -1,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    return this;
  }

  public buildInstance(row: TorrentDBRow): ITorrent {
    return new Torrent(row);
  }

  public async getForVideo(videoId: number): Promise<ITorrent[]> {
    return this.all(`SELECT * FROM torrents WHERE videoId=? AND status!='removed'`, [videoId]);
  }

  public getWithStatus(...statuses: TorrentStatus[]): Promise<ITorrent[]> {
    return this.all(`SELECT * FROM torrents WHERE status IN (${statuses.map(e => '?')})`, statuses);
  }

  public async setStatus(torrent: ITorrent, status: TorrentStatus): Promise<ITorrent> {
    if (torrent.status === status) {
      return torrent;
    }
    await this.run('UPDATE torrents SET status=? WHERE id=?', [status, torrent.id]);
    return { ...torrent, status };
  }

  public async insert(arg: TorrentInsertArg): Promise<void> {
    await this.run(`INSERT INTO torrents (hash, videoId, quality, resolution, sizeMb, status, isUserPick)`
      + ` VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [arg.hash, arg.videoId, arg.quality, arg.resolution, arg.sizeMb, arg.status, arg.isUserPick]);
  }

  public async setQueueOrder(torrents: ITorrent[]): Promise<void> {
    await Promise.all(torrents.map((t, i) => {
      return this.run(`UPDATE torrents SET queueIndex=? WHERE id=?`, [i, t.id]);
    }));
  }

  public async delete(...ids: number[]): Promise<void> {
    await this.run(`DELETE FROM torrents WHERE id IN (${ids.map(e => '?')})`, ids);
  }
}
