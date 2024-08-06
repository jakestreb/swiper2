import db from '../db/index.js';
import * as matchUtil from './helpers/matchUtil.js';
import logger from '../util/logger.js';
import * as util from '../util/index.js';
import Swiper from '../Swiper.js';
import TorrentSearch from '../functions/search/TorrentSearch.js';

// Number of torrents to show per page
const PER_PAGE = 3;

const STAR = '\u2605';
const DOWN_ARROW = '\u2193';

const REMOVED = '(removed)';

export async function search(this: Swiper, convo: Conversation): Promise<SwiperReply> {
  logger.debug(`Swiper: search`);
  const f = this.getTextFormatter(convo);

  const media = convo.media as IMedia;
  const video = media.isShow() ? media.episodes[0] : media as IMovie;
  const active = await db.torrents.getForVideo(video.id);

  // Perform the search and add the torrents to the conversation.
  if (!convo.torrents) {
    await this.notifyClient(convo.id, `Searching for ${video} torrents`);
    const results = await TorrentSearch.search(video);
    convo.torrents = results.filter(t => !active.some(at => compareHashes(t.hash, at.hash)));
    convo.pageNum = 0;
  }

  if (convo.torrents!.length === 0) {
    return {
      data: 'No torrents found',
      final: true
    };
  }

  // Display the torrents to the user.
  convo.pageNum = convo.pageNum || 0;

  const showPage = async () => {
    const { torrents, pageNum } = convo;
    return {
      data: await formatSelection(torrents!, pageNum!, f),
    };
  };

  const startIndex = PER_PAGE * convo.pageNum;
  const navs = [];
  if (startIndex > 0) {
    navs.push({value: 'prev', regex: /\bp(rev)?(ious)?\b/gi});
  }
  if (startIndex + PER_PAGE < convo.torrents.length) {
    navs.push({value: 'next', regex: /\bn(ext)?\b/gi});
  }
  const match = matchUtil.matchNumber(convo.input, navs);
  if (match === 'next') {
    // Go forward a page.
    convo.pageNum += 1;
    return showPage();
  } else if (match === 'prev') {
    // Go back a page.
    convo.pageNum -= 1;
    return showPage();
  } else if (match === null) {
    // No match - no change.
    return showPage();
  }

  // Matched a number
  const torrentNum = parseInt(convo.input || '', 10);
  if (!torrentNum || torrentNum <= 0 && torrentNum > convo.torrents.length) {
    // Invalid number - show torrents again.
    return showPage();
  }
  const torrent = convo.torrents[torrentNum - 1];

  // Add torrent to existing video, if there is one
  const existing = await db.videos.getOne(video.id);
  if (existing && existing.status === 'downloading' && active.length > 0) {
    await db.torrents.insert({
      ...torrent,
      videoId: video.id,
      status: 'pending',
      isUserPick: true,
    });
    await this.downloadManager.ping();
    return {
      data: `Added new torrent for ${video.format(f)}`,
      final: true
    };
  }

  // Try to add video
  try {
    await db.media.insert(media, { addedBy: convo.id, status: 'identified' });
  } catch (err: any) {
    if (err.code !== 'SQLITE_CONSTRAINT') {
      throw err;
    }
    return {
      data: 'Video must be removed before re-downloading',
      final: true
    };
  }

  // Add torrent and add video to queue
  await db.torrents.insert({
    ...torrent,
    videoId: video.id,
    status: 'pending',
    isUserPick: true,
  });
  await this.downloadManager.addToQueue(video);

  return {
    data: f.multiMessage(
      `Queued ${video.format(f)} for download`,
      f.commands('queue')
    ),
    final: true
  };
}

// Show a subset of the torrents decided by the pageNum.
async function formatSelection(
  torrents: TorrentResult[],
  pageNum: number,
  f: TextFormatter,
): Promise<string> {
  logger.debug('search: Formatting page');
  const removed = await db.torrents.getWithStatus('removed');
  const startIndex = PER_PAGE * pageNum;
  const endIndex = startIndex + PER_PAGE - 1;
  const pageTorrents = torrents.slice(startIndex, startIndex + PER_PAGE);
  const torrentRows = pageTorrents.map((t, i) => {
    const isRemoved = removed.some(r => compareHashes(t.hash, r.hash));
    return [f.m(`${startIndex + i + 1} - `), formatTorrent(t, isRemoved, f)].join('');
  });
  const commands = formatCommands([startIndex + 1, endIndex + 1], torrents.length, f);
  return f.multiMessage(torrentRows.join('\n\n'), commands);
}

function formatTorrent(torrent: TorrentResult, isRemoved: boolean, f: TextFormatter): string {
  const peers = `${torrent.seeders || 0}${DOWN_ARROW}`;
  const size = util.formatSize(torrent.sizeMb);
  const parsedDate = util.parseDate(torrent.uploadTime);
  const date = parsedDate ? util.formatDateSimple(parsedDate) : torrent.uploadTime;
  const rating = STAR.repeat(torrent.starRating);

  const data = f.dataRow(peers, size, rating);
  const title = torrent.title.replace(/\./g, ' ');
  const torrentRows = [data, f.i(title)];

  if (isRemoved) {
    torrentRows.push(REMOVED);
  }

  torrentRows.push(f.i(date));

  return torrentRows.join('\n');
}

function formatCommands(range: number[], total: number, f: TextFormatter): string {
  const prev = range[0] === 1 ? '' : 'prev';
  const next = range[1] >= total ? '' : 'next';
  const rangeTotal = (Math.min(range[1], total) - range[0]) + 1;
  const spread = [...Array(rangeTotal).keys()]
    .map(n => n + range[0])
    .join('/');
  return f.commands(spread, prev, next, 'cancel');
}

function compareHashes(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}
