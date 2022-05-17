import TextFormatter from '../io/formatters/TextFormatter';
import * as path from 'path';

interface BuildArg {
  id: number;
  magnet: string;
  videoId: number;
  quality: string;
  resolution: string;
  sizeMb: number;
  status: TorrentStatus;
  queueIndex?: number;
}

const NO_PEERS = '(awaiting peers)';
const PAUSED = '(awaiting space)';
const REMOVED = '(removed)';

export default class Torrent implements ITorrent {
  public id: number;
  public magnet: string;
  public videoId: number;
  public quality: string;
  public resolution: string;
  public sizeMb: number;
  public status: TorrentStatus;
  public queueIndex?: number;

  constructor(values: BuildArg) {

  }

  public getDownloadPath(): string {
    return path.join(`${this.videoId}`, `${this.id}`);
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
  }
  const isPaused = status === 'paused';
  const hasPeers = peers > 0;
  return isPaused ? PAUSED : (!hasPeers ? NO_PEERS : '');
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
