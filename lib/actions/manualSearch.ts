import ptn from 'parse-torrent-name';
import * as crypto from 'crypto';
import db from '../db/index.js';
import * as matchUtil from './helpers/matchUtil.js';
import logger from '../util/logger.js';
import Swiper from '../Swiper.js';
import TorrentSearch from '../functions/search/TorrentSearch.js';
import { formatSelection, compareHashes, PER_PAGE } from './search.js';
import Movie from '../db/models/Movie.js';
import Episode from '../db/models/Episode.js';
import Show from '../db/models/Show.js';

export async function manualSearch(this: Swiper, convo: Conversation): Promise<SwiperReply> {
  logger.debug(`Swiper: manualSearch`);
  const f = this.getTextFormatter(convo);

  // Get the search term from input - use it exactly as provided
  // Handle both "manual search <term>" and "manualsearch <term>" formats
  let searchTerm = convo.input?.trim() || '';
  if (searchTerm.toLowerCase().startsWith('search ')) {
    searchTerm = searchTerm.substring(7).trim();
  }
  
  if (!searchTerm) {
    return {
      data: 'Please provide a search term. Usage: manual search <search term>',
      final: true
    };
  }

  // Perform the search with the raw term - no media identification
  if (!convo.torrents) {
    await this.notifyClient(convo.id, `Searching for "${searchTerm}" torrents`);
    const results = await TorrentSearch.searchByTerm(searchTerm);
    convo.torrents = results;
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
    convo.pageNum += 1;
    return showPage();
  } else if (match === 'prev') {
    convo.pageNum -= 1;
    return showPage();
  } else if (match === null) {
    return showPage();
  }

  // Matched a number - user selected a torrent
  const torrentNum = parseInt(convo.input || '', 10);
  if (!torrentNum || torrentNum <= 0 || torrentNum > convo.torrents.length) {
    return showPage();
  }
  const torrent = convo.torrents[torrentNum - 1];

  // Parse torrent title to get basic info (no TMDB/TVDB lookup)
  const parsed = ptn(torrent.title);
  const title = parsed.title || torrent.title.split(/[\.\-_]/)[0].trim() || 'Unknown';
  const season = parsed.season;
  const episode = parsed.episode;
  const year = parsed.year ? String(parsed.year) : null;

  // Create minimal media object directly from parsed torrent (no TMDB/TVDB lookup)
  const episodes: EpisodesDescriptor | null = (season && episode) ? { [season]: [episode] } : null;
  const type: 'movie'|'tv'|null = episodes ? 'tv' : 'movie';
  const media = createMinimalMedia(title, type, season, episode, year);
  convo.media = media;
  const video = media.isShow() ? media.episodes[0] : media as IMovie;
  const active = await db.torrents.getForVideo(video.id);

  if (active.some(at => compareHashes(torrent.hash, at.hash))) {
    return {
      data: 'This torrent is already added',
      final: true
    };
  }

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

// Create a minimal media object from parsed torrent title (when TMDB/TVDB lookup fails)
function createMinimalMedia(
  title: string,
  type: 'movie'|'tv'|null,
  season: number|undefined,
  episode: number|undefined,
  year: string|null
): IMedia {
  if (type === 'tv' && season && episode) {
    // Create a minimal show/episode
    const showId = hashTitleToId(title);
    const episodeId = (showId * 1000 * 1000) + (season * 1000) + episode;
    const episodeObj = new Episode({
      id: episodeId,
      seasonNum: season,
      episodeNum: episode,
      showId: showId,
      showTitle: title,
      airDate: undefined,
      status: 'identified',
      queueIndex: -1,
    });
    const show = new Show({
      id: showId,
      title: title,
      episodes: [episodeObj],
    });
    return show;
  } else {
    // Create a minimal movie
    const movieId = hashTitleToId(title + (year || ''));
    const movie = new Movie({
      id: movieId,
      title: title,
      year: year || new Date().getFullYear().toString(),
      releases: {},
      status: 'identified',
      queueIndex: -1,
    });
    return movie;
  }
}

// Generate a unique numeric ID from a title string (for manual entries when TMDB/TVDB fails)
function hashTitleToId(title: string): number {
  const hash = crypto.createHash('md5').update(title.toLowerCase().trim()).digest('hex');
  // Convert first 8 hex chars to a number, ensuring it's positive and reasonably sized
  // Use a large base number to avoid collisions with real IMDB IDs (which are typically 7-8 digits)
  const num = parseInt(hash.substring(0, 8), 16);
  // Let's use a high range to avoid conflicts - IMDB IDs are typically < 10^8
  // So we'll use numbers starting from 10^9 (1 billion)
  return 1000000000 + (num % 1000000000);
}
