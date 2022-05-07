import db from '../db';
import {getDescription, getNextToAir} from '../common/media';
import {getAiredStr, getMorning} from '../common/util';
import Swiper from '../Swiper';

const UP_ARROW = '\uA71B';
const DOWN_ARROW = '\uA71C';
const HOURGLASS = '\u29D6';

const NO_PEERS = '(awaiting peers)';
const PAUSED = '(awaiting space)';

export async function status(this: Swiper, convo: Conversation): Promise<SwiperReply> {
  const monitored = await db.media.getWithStatus('unreleased');
  const downloading = await db.videos.getWithStatus('downloading', 'uploading', 'completed');
  const downloadingWithTorrents = await Promise.all(downloading.map(d => db.videos.addTorrents(d)));

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

  const downloadingStr = downloadingWithTorrents.map((video, i) => {
    const statusIcon = getVideoStatusIcon(video);
    const torrentStrs = video.torrents.map(t => {
      const {progress, peers} = this.downloadManager.getProgress(t);
      const sizeStr = t.sizeMb ? `${(t.sizeMb / 1000).toFixed(1)}GB | ` : '';
      const resStr = t.resolution ? `${t.resolution} | ` : ``;
      const qualStr = t.quality ? `${t.quality} | ` : ``;
      const peersStr = peers ? `${peers}x | ` : ``;
      const progressStr = progress ? `${progress.toFixed(1)}% ` : ``;
      const statusTxt = getTorrentStatusText(t, peers);
      return `\`      \`_${sizeStr}${resStr}${qualStr}${peersStr}${progressStr}${statusTxt}_`;
    });
    return `\`${statusIcon} \`${getDescription(video)}\n` + torrentStrs.join('\n');
  });

  const strs = [];
  if (monitoredStr) {
    strs.push(`\`MONITORING\`\n${monitoredStr}`);
  }
  if (downloadingStr) {
    strs.push(`\`DOWNLOADING\`\n${downloadingStr}`);
  }
  const str = strs.join('\n');
  return {
    data: str || "Nothing to report",
    final: true
  };
}

function getVideoStatusIcon(video: TVideo) {
  const isDownloading = video.torrents.some(t => t.status === 'downloading');
  const isUploading = video.status === 'uploading';
  return isDownloading ? DOWN_ARROW : (isUploading ? UP_ARROW : HOURGLASS);
}

function getTorrentStatusText(torrent: DBTorrent, peers: number) {
  const isPaused = torrent.status === 'paused';
  const hasPeers = peers > 0;
  return isPaused ? PAUSED : (!hasPeers ? NO_PEERS : '');
}
