import db from '../db';
import * as util from '../util';
import Swiper from '../Swiper';

const UP_ARROW = '\u2191';
const DOWN_ARROW = '\u2913';
const HOURGLASS = '\u29D6';
const X = '\u2A09';

const UPLOADING = '(uploading)';

export async function queued(this: Swiper, convo: Conversation): Promise<SwiperReply> {
  const f = this.getTextFormatter(convo);

  const downloading = await db.videos.getWithStatus('searching', 'downloading', 'uploading');
  const completed = await db.media.getWithStatus('completed');
  const downloadingWithTorrents = await Promise.all(downloading.map(d => db.videos.addTorrents(d)));
  const sorted = util.sortByPriority(downloadingWithTorrents, getSortPriority);

  const downloadRows = await Promise.all(sorted.map(async video => {
    const torrentRows = video.torrents.map(t => {
      const { progress, peers } = this.downloadManager.getProgress(t);
      return `${f.sp(2)}${t.format(f, peers, progress)}`;
    });
    const searchTxt = await getSearchTxt(video);
    const rows = [`${getIcon(video)} ${video.format(f)}`];
    if (video.status === 'downloading' && torrentRows.length > 0) {
      rows.push(torrentRows.join('\n'));
    }
    if (searchTxt) {
      rows.push(`${f.sp(2)}${searchTxt}`);
    }
    if (video.status === 'uploading') {
      rows.push(`${f.sp(2)}${UPLOADING}`);
    }
    return rows.join('\n');
  }));
  const completedRows = completed.map(media => {
      return `${X} ${formatCompleted(media, f)}`;
  });
  const rows = [...downloadRows, ...completedRows];

  this.downloadManager.memoryManager.log(); // TODO: Remove
  return {
    data: rows.length > 0 ? rows.join('\n') : 'No downloads',
    final: true
  };
}

async function getSearchTxt(video: IVideo): Promise<string|null> {
  const jobTypes: JobType[] = ['AddTorrent', 'CheckForRelease', 'StartSearching'];
  const nextRun = await db.jobs.getNextRun(video.id, jobTypes);
  if (!nextRun) {
    return null;
  } else if (nextRun.getTime() < Date.now()) {
    return '(searching)';
  }
  return `(searching in ${util.formatWaitTime(nextRun)})`;
}

function formatCompleted(media: IMedia, f: TextFormatter) {
  return f.s(media.format(f));
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
  const queueIndex = video.status === 'downloading' ? video.queueIndex! : -1;
  const season = video.isEpisode() ? video.seasonNum : 0;
  const episode = video.isEpisode() ? video.episodeNum : 0;
  return [
    video.status === 'uploading',
    video.status === 'downloading',
    video.status === 'searching',
    queueIndex >= 0,
    -queueIndex,
    -season,
    -episode
  ];
}
