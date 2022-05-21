import db from '../db';
import * as util from '../util';
import Swiper from '../Swiper';

const UP_ARROW = '\u2191';
const DOWN_ARROW = '\u2913';
const HOURGLASS = '\u29D6';

const UPLOADING = '(uploading)';

export async function queued(this: Swiper, convo: Conversation): Promise<SwiperReply> {
  const f = this.getTextFormatter(convo);

  const downloading = await db.videos.getWithStatus('searching', 'downloading', 'uploading', 'completed');
  const downloadingWithTorrents = await Promise.all(downloading.map(d => db.videos.addTorrents(d)));
  const sorted = util.sortByPriority(downloadingWithTorrents, getSortPriority);

  const downloadRows = await Promise.all(sorted.map(async video => {
    if (video.status === 'completed') {
      return `${f.sp(2)}${formatCompleted(video, f)}`;
    }
    const torrentRows = video.torrents.map(t => {
      const { progress, peers } = this.downloadManager.getProgress(t);
      return `${f.sp(2)}${t.format(f, peers, progress)}`;
    });
    const searchTxt = await getSearchTxt(video);
    const rows = [`${getIcon(video)}${f.sp(1)}${video.format(f)}`];
    if (torrentRows.length > 0) {
      rows.push(torrentRows.join('\n'));
    }
    if (searchTxt) {
      rows.push(searchTxt);
    }
    if (video.status === 'uploading') {
      rows.push(UPLOADING);
    }
    return rows.join('\n');
  }));

  this.downloadManager.memoryManager.log(); // TODO: Remove
  this.downloadManager.downloadClient.logTorrents(); // TODO: Remove
  return {
    data: downloadRows.length > 0 ? downloadRows.join('\n') : 'No downloads',
    final: true
  };
}

async function getSearchTxt(video: IVideo): Promise<string|null> {
  const nextRunDate = await db.jobs.getNextRun(video.id, 'AddTorrent');
  if (!nextRunDate) {
    return null;
  } else if (nextRunDate.getTime() < Date.now()) {
    return '(searching)';
  }
  return `(searching in ${util.formatWaitTime(nextRunDate)})`;
}

function formatCompleted(video: IVideo, f: TextFormatter) {
  return f.s(video.format(f));
}

function getIcon(video: TVideo) {
  if (video.status === 'completed') {
    return '';
  }
  const isDownloading = video.torrents.some(t => t.status === 'downloading');
  const isUploading = video.status === 'uploading';
  return isDownloading ? DOWN_ARROW : (isUploading ? UP_ARROW : HOURGLASS);
}

function getSortPriority(video: IVideo) {
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
