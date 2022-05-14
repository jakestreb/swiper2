import db from '../db';
import * as priorityUtil from '../common/priority';
import Swiper from '../Swiper';
import TextFormatter from '../io/formatters/TextFormatter';

const UP_ARROW = '\u2191';
const DOWN_ARROW = '\u2913';
const HOURGLASS = '\u29D6';

const NO_PEERS = '(awaiting peers)';
const PAUSED = '(awaiting space)';
const SEARCHING = '(searching)';

interface TorrentInfo {
  sizeMb: number;
  resolution: string;
  peers: number;
  progress: number;
  status: TorrentStatus;
}

export async function queued(this: Swiper, convo: Conversation, f: TextFormatter): Promise<SwiperReply> {
  const downloading = await db.videos.getWithStatus('searching', 'downloading', 'uploading', 'completed');
  const downloadingWithTorrents = await Promise.all(downloading.map(d => db.videos.addTorrents(d)));
  const sorted = priorityUtil.sortByPriority(downloadingWithTorrents, getSortPriority);

  const downloadRows = sorted.map(video => {
    if (video.status === 'completed') {
      return `${f.sp(2)}${formatCompleted(video, f)}`;
    }
    const torrentRows = video.torrents.map(t => {
      const { sizeMb, resolution, status } = t;
      const { progress, peers } = this.downloadManager.getProgress(t);
      return formatTorrentRow({ sizeMb, resolution, peers, progress, status });
    });
    const details = torrentRows.length > 0 ? torrentRows.join('\n') : SEARCHING;
    const rows = [
      `${getIcon(video)}${f.sp(1)}${f.res(video)}`,
      `${f.sp(2)}${f.i(details)}`,
    ];
    return rows.join('\n');
  });

  this.downloadManager.memoryManager.log(); // TODO: Remove
  this.downloadManager.downloadClient.logTorrents(); // TODO: Remove
  return {
    data: downloadRows.length > 0 ? downloadRows.join('\n') : 'No downloads',
    final: true
  };
}

function formatCompleted(video: Video, f: TextFormatter) {
  return f.s(f.res(video));
}

function getIcon(video: TVideo) {
  if (video.status === 'completed') {
    return '';
  }
  const isDownloading = video.torrents.some(t => t.status === 'downloading');
  const isUploading = video.status === 'uploading';
  return isDownloading ? DOWN_ARROW : (isUploading ? UP_ARROW : HOURGLASS);
}

function getTorrentStatusText(status: TorrentStatus, peers: number) {
  const isPaused = status === 'paused';
  const hasPeers = peers > 0;
  return isPaused ? PAUSED : (!hasPeers ? NO_PEERS : '');
}

function formatTorrentRow(info: TorrentInfo): string {
  const { sizeMb, resolution, peers, progress, status } = info;
  const elems = [resolution, formatSize(sizeMb), formatPeers(peers), formatProgress(progress)];
  const infoTxt = elems.filter(x => x).join(' | ');
  const statusTxt = getTorrentStatusText(status, peers);
  return [infoTxt, statusTxt].join(' ');
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

function getSortPriority(video: Video) {
  const queueIndex = video.queueIndex!;
  return [
    video.status === 'uploading',
    video.status === 'downloading',
    video.status === 'searching',
    video.status === 'completed',
    queueIndex >= 0,
    -queueIndex,
  ];
}
