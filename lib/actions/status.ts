import db from '../db';
import {getDescription, getNextToAir} from '../common/media';
import * as priorityUtil from '../common/priority';
import {getAiredStr, getMorning} from '../common/util';
import Swiper from '../Swiper';

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

export async function status(this: Swiper, convo: Conversation): Promise<SwiperReply> {
  const monitored = await db.media.getWithStatus('unreleased');
  const downloading = await db.videos.getWithStatus('searching', 'downloading', 'uploading', 'completed');
  const downloadingWithTorrents = await Promise.all(downloading.map(d => db.videos.addTorrents(d)));
  const sorted = priorityUtil.sortByPriority(downloadingWithTorrents, getSortPriority);

  const monitoredStr = monitored.map(media => {
    if (media.type === 'movie') {
      const release = media.streamingRelease && (media.streamingRelease > getMorning().getTime());
      const releaseStr = release ? ` _Streaming ${new Date(media.streamingRelease!).toDateString()}_` : ` _${media.year}_`;
      return `*${media.title}*${releaseStr}`;
    } else {
      const next = getNextToAir(media.episodes);
      return `${getDescription(media)}` +
        ((next && next.airDate) ? ` _${getAiredStr(new Date(next!.airDate!))}_` : '');
    }
  }).join('\n');

  const downloadingStr = sorted.map(video => {
    if (video.status === 'completed') {
      return formatCompleted(video);
    }
    const statusIcon = getVideoStatusIcon(video);
    const torrentStrs = video.torrents.map(t => {
      const { sizeMb, resolution, status } = t;
      const { progress, peers } = this.downloadManager.getProgress(t);
      return formatTorrentRow({ sizeMb, resolution, peers, progress, status });
    });
    const details = torrentStrs.length > 0 ? torrentStrs.join('\n') : SEARCHING;
    return `\`${statusIcon} \`${getDescription(video)}\n\` \`_${details}_`;
  });

  const strs = [];
  if (monitoredStr) {
    strs.push(`\`MONITORING\`\n${monitoredStr}`);
  }
  if (downloadingStr) {
    strs.push(`\`DOWNLOADING\`\n${downloadingStr.join('\n')}`);
  }
  const str = strs.join('\n');
  return {
    data: str || "Nothing to report",
    final: true
  };
}

function formatCompleted(video: Video) {
  return `~~${getDescription(video)}~~`
}

function getVideoStatusIcon(video: TVideo) {
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
