import db from '../db';
import * as matchUtil from './helpers/matchUtil';
import * as log from '../log';
import * as util from '../util';
import Swiper from '../Swiper';
import TorrentSearch from '../apis/TorrentSearch';

// Number of torrents to show per page
const PER_PAGE = 3;

const STAR = '\u2605';

const REMOVED = '(removed)';

export async function search(this: Swiper, convo: Conversation): Promise<SwiperReply> {
  log.debug(`Swiper: search`);
  const f = this.getTextFormatter(convo);

  const media = convo.media as IMedia;
  const video = media.isShow() ? media.episodes[0] : media as IMovie;
  const activeTorrents = await db.torrents.getForVideo(video.id);

  // Perform the search and add the torrents to the conversation.
  if (!convo.torrents) {
    log.info(`Searching for ${video} downloads`);
    convo.torrents = await TorrentSearch.search(video);
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
      data: await formatSelection(torrents!, pageNum!, activeTorrents, f),
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

  try {
    await db.media.insert(media, { addedBy: convo.id, status: 'identified' });
  } catch (err) {
    if (err.code !== 'SQLITE_CONSTRAINT') {
      throw err;
    }
    const existing = await db.videos.getOne(video.id);
    if (!existing) {
      throw err;
    }
    if (existing.status !== 'downloading') {
      return {
        data: 'Video must be removed before re-downloading',
        final: true
      };
    }
  }

  await db.torrents.insert({ ...torrent, videoId: video.id, status: 'paused' });

  await this.downloadManager.addToQueue(video);

  return {
    data: `Queued ${video.format(f)} for download`,
    final: true
  };
}

// Show a subset of the torrents decided by the pageNum.
async function formatSelection(
  torrents: TorrentResult[],
  pageNum: number,
  active: ITorrent[],
  f: TextFormatter,
): Promise<string> {
  log.debug('search: Formatting page');
  const removed = await db.torrents.getWithStatus('removed');
  const startIndex = PER_PAGE * pageNum;
  const endIndex = startIndex + PER_PAGE - 1;
  const filteredTorrents = torrents.filter(t => !active.some(at => t.hash === at.hash));
  const someTorrents = filteredTorrents.slice(startIndex, startIndex + PER_PAGE);
  const torrentRows = someTorrents.map((t, i) => {
    const isRemoved = removed.some(r => t.hash === r.hash);
    const numberRow = [f.b(`${startIndex + i + 1}`)];
    if (isRemoved) {
      numberRow.push(REMOVED);
    }
    return [numberRow.join(f.sp(1)), formatTorrent(t, f)].join('\n');
  });
  const commands = formatCommands([startIndex + 1, endIndex + 1], filteredTorrents.length, f);
  return [torrentRows.join('\n\n'), commands].join('\n\n');
}

function formatTorrent(torrent: TorrentResult, f: TextFormatter): string {
  const peers = `${torrent.seeders} peers`;
  const size = util.formatSize(torrent.sizeMb);
  const parsedDate = util.parseDate(torrent.uploadTime);
  const date = parsedDate ? util.formatDateSimple(parsedDate) : torrent.uploadTime;
  const rating = STAR.repeat(torrent.starRating);

  const data = f.dataRow(rating, peers, size, date);
  const title = torrent.title.replace(/\./g, ' ');

  return [data, title].join('\n');
}

function formatCommands(range: number[], total: number, f: TextFormatter): string {
  const prev = range[0] === 0 ? '' : 'prev';
  const next = range[1] === total - 1 ? '' : 'next';
  const rangeTotal = (range[1] - range[0]) + 1;
  const spread = [...Array(rangeTotal).keys()]
    .map(n => n + range[0])
    .join('/');
  return f.commands(f.b(spread), f.b(prev), f.b(next));
}
