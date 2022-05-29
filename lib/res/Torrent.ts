import TextFormatter from '../io/formatters/TextFormatter';
import * as path from 'path';

interface BuildArg {
  id: number;
  hash: string;
  videoId: number;
  quality: string;
  resolution: string;
  sizeMb: number;
  status: TorrentStatus;
  queueIndex?: number;
}

const NO_PEERS = '(awaiting peers)';
const PAUSED = '(waiting)';
const REMOVED = '(removed)';
const SLOW = '(slow)';

export default class Torrent implements ITorrent {
  public id: number;
  public hash: string;
  public videoId: number;
  public quality: string;
  public resolution: string;
  public sizeMb: number;
  public status: TorrentStatus;
  public queueIndex?: number;

  public video?: IVideo;

  constructor(values: BuildArg) {
    this.id = values.id;
    this.hash = values.hash;
    this.videoId = values.videoId;
    this.quality = values.quality;
    this.resolution = values.resolution;
    this.sizeMb = values.sizeMb;
    this.status = values.status;
    this.queueIndex = values.queueIndex;
  }

  public getDownloadPath(): string {
    return path.join(`${this.videoId}`, `${this.id}`);
  }

  public addVideo(video: IVideo): VTorrent {
    this.video = video;
    return (this as VTorrent);
  }

  public format(f: TextFormatter, peers: number, progress: number): string {
    const data = f.dataRow(
      this.resolution,
      formatSize(this.sizeMb),
      formatPeers(peers),
      formatProgress(progress)
    );
    const statusTxt = getTorrentStatusText(this.status, peers);
    return [data, statusTxt].join(' ');
  }

  public toString() {
    return `T${this.id}`;
  }
}

function getTorrentStatusText(status: TorrentStatus, peers: number) {
  if (status === 'removed') {
    return REMOVED;
  } else if (status === 'paused') {
    return PAUSED;
  } else if (peers === 0) {
    return NO_PEERS;
  } else if (status === 'slow') {
    return SLOW;
  }
  return '';
}

function formatSize(sizeMb: number) {
  return sizeMb ? `${(sizeMb / 1000).toFixed(1)}GB` : null;
}

function formatPeers(peers: number): string|null {
  return peers ? `${peers}x` : null;
}

function formatProgress(progress: number) {
  return progress ? `${progress.toFixed(1)}%` : null;
}
