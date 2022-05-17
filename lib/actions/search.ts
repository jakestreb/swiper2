import db from '../db';
import * as matchUtil from './helpers/matchUtil';
import * as log from '../log';
import * as util from '../util';
import Swiper from '../Swiper';
import TorrentSearch from '../apis/TorrentSearch';
import TextFormatter from '../io/formatters/TextFormatter';

// Number of torrents to show per page
const PER_PAGE = 4;

const STAR = '\u2605';

const SELECTED = '(selected)';

export async function search(this: Swiper, convo: Conversation, f: TextFormatter): Promise<SwiperReply> {
  log.debug(`Swiper: search`);

  const media = convo.media as IMedia;
  const rawVideo = media.isShow() ? media.episodes[0] : media as IMovie;
  const video = await db.videos.addTorrents(rawVideo);

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

  const showPage = () => {
    const { torrents, pageNum } = convo;
    return {
      data: formatSelection(torrents!, pageNum!, video.torrents, f),
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

  await db.media.insert(media, { addedBy: convo.id, status: 'downloading' });
  // TODO: If insertion fails, skip it
  await db.torrents.insert({ ...torrent, videoId: video.id, status: 'paused' });
  this.downloadManager.ping();

  return {
    data: `Queued ${video.format(f)} for download`,
    final: true
  };
}

// Show a subset of the torrents decided by the pageNum.
function formatSelection(
  torrents: TorrentResult[],
  pageNum: number,
  active: ITorrent[],
  f: TextFormatter,
): string {
  const startIndex = PER_PAGE * pageNum;
  const endIndex = startIndex + PER_PAGE - 1;
  const someTorrents = torrents.slice(startIndex, startIndex + PER_PAGE);
  const torrentRows = someTorrents.map((t, i) => {
    const isSelected = !!active.find(at => t.magnet === at.magnet);
    return [f.b(`${i}`), formatTorrent(t, isSelected, f)].join(f.sp(1));
  });
  const commands = formatCommands([startIndex, endIndex], torrents.length, f);
  return [torrentRows.join('\n'), commands].join('\n\n');
}

function formatTorrent(torrent: TorrentResult, isSelected: boolean, f: TextFormatter): string {
  const peers = `${torrent.seeders} peers`;
  const size = util.formatSize(torrent.sizeMb);
  const rating = STAR.repeat(torrent.starRating);
  let data = f.dataRow(peers, size, rating);
  if (isSelected) {
    data = [data, SELECTED].join(' ');
  }
  const title = torrent.title.replace(/\./g, ' ');
  // TODO: Parse and format
  const date = torrent.uploadTime;
  return [data, [title, date].join(' ')].join('\n');
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
