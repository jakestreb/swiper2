import * as matchUtil from './helpers/matchUtil';
import db from '../db';
import Swiper from '../Swiper';

export async function remove(this: Swiper, convo: Conversation): Promise<SwiperReply> {
  const f = this.getTextFormatter(convo);

  await addStoredMediaIfFound(convo);

  const storedMedia = convo.storedMedia;
  if (!storedMedia) {
    return {
      data: `Nothing matching ${convo.input} was found`,
    };
  }

  if (convo.storedVideos) {
    return removeTorrent(this, convo, f);
  }
  return removeMedia(this, convo, f);
}

export async function removeMedia(swiper: Swiper, convo: Conversation, f: TextFormatter): Promise<SwiperReply> {
  const storedMedia = convo.storedMedia!;

  // Ask the user about a media item if they are not all dealt with.
  if (storedMedia.length > 0 && convo.input) {
    const match = matchUtil.matchYesNo(convo.input);
    if (match) {
      // If yes or no, shift the task to 'complete' it, then remove it from the database.
      const media: IMedia = storedMedia.shift()!;
      if (match === 'yes') {
        await doRemoveMedia(swiper, media);
      }
    }
  }

  // If there are still items or the match failed, send a confirm string.
  if (storedMedia.length > 0) {
    return {
      data: formatConfirmMedia(storedMedia[0], f),
    };
  }

  return {
    data: `Ok`,
    final: true
  };
}

export async function removeTorrent(swiper: Swiper, convo: Conversation, f: TextFormatter): Promise<SwiperReply> {
  const storedVideos = convo.storedVideos!;
  // Ask the user about a media item if they are not all dealt with.
  if (storedVideos.length > 0 && convo.input) {
    const match = matchUtil.matchYesNo(convo.input);
    if (match) {
      // If yes or no, shift the task to 'complete' it, then remove it from the database.
      const video: TVideo = storedVideos[0];
      const torrent = video.torrents.shift()!;
      if (video.torrents.length === 0) {
        storedVideos.shift();
      }
      if (match === 'yes') {
        await doRemoveTorrent(swiper, video, torrent);
      }
    }
  }

  // If there are still items or the match failed, send a confirm string.
  if (storedVideos.length > 0) {
    const video = storedVideos[0];
    const torrent = storedVideos[0].torrents[0];
    const { progress, peers } = swiper.downloadManager.getProgress(torrent);
    return {
      data: formatConfirmTorrent({ ...torrent, video }, peers, progress, f),
    };
  }

  return {
    data: `Ok`,
    final: true
  };
}

// Fully remove the specified media
// Destroy any active downloads of the media
// Remove any download files
// Remove any DB jobs
// Remove any DB torrents
async function doRemoveMedia(swiper: Swiper, media: IMedia): Promise<void> {
  const promises = media.getVideos().map(async video => {
    await swiper.worker.removeJobs(video.id);
    const withTorrents = await db.videos.addTorrents(video);
    if (withTorrents.torrents.length > 0) {
      await swiper.downloadManager.destroyAndDeleteVideo(withTorrents);
      await db.torrents.delete(...withTorrents.torrents.map(t => t.id));
    }
  });
  await Promise.all(promises);
  await db.media.delete(media);
  swiper.downloadManager.ping();
}

// Remove DB torrent
// Destroy active download of the torrent
// Remove download files
// If that was the last torrent, start searching for a new one
async function doRemoveTorrent(swiper: Swiper, video: TVideo, torrent: ITorrent): Promise<void> {
    const t = { ...torrent, video };
    await swiper.downloadManager.destroyAndDeleteTorrent(t);
    await db.torrents.setStatus(t, 'removed');
    if (video.torrents.length <= 1) {
      await swiper.worker.addJob({
        type: 'StartSearching',
        videoId: video.id,
        startAt: new Date(),
      });
    }
}

  // Requires mediaQuery to be set.
async function addStoredMediaIfFound(convo: Conversation): Promise<void> {
  const mediaQuery = convo.mediaQuery;
  if (!mediaQuery) {
    throw new Error(`addStoredMediaIfFound requires mediaQuery`);
  }
  // Search the database for all matching Movies/Shows.
  if (!convo.storedMedia) {
    const searchType = mediaQuery.type === 'torrent' ? null : mediaQuery.type;
    let mediaItems = await db.media.search(mediaQuery.title || '*', { type: searchType || undefined });
    mediaItems = filterMediaEpisodes(mediaItems, mediaQuery.episodes || 'all');
    if (mediaItems.length > 0) {
      convo.storedMedia = mediaItems;
      if (mediaQuery.type === 'torrent') {
        // Remove torrent must ask video-by-video
        const videoArrays = convo.storedMedia.map(m => m.getVideos());
        const videos = ([] as IVideo[]).concat(...videoArrays)
          .filter(v => v.status === 'downloading');
        const withTorrents = await Promise.all(videos.map(v => db.videos.addTorrents(v)));
        convo.storedVideos = withTorrents.filter(v => v.torrents.length > 0);
      }
    }
  }
}

function filterMediaEpisodes(media: IMedia[], desc: EpisodesDescriptor) {
  return media.filter(m => {
    if (m.isMovie()) {
      return true;
    } else if (m.isShow()) {
      m.filterEpisodes(desc)
      return m.episodes.length > 0;
    }
    throw new Error('Invalid media type');
  });
}

function formatConfirmMedia(media: IMedia, f: TextFormatter): string {
  return `Remove ${media.format(f)}?`;
}

function formatConfirmTorrent(t: VTorrent, peers: number, progress: number, f: TextFormatter): string {
  return [
    `Remove torrent from ${t.video.format(f)}`,
    `${t.format(f, peers, progress)}?`,
  ].join('\n');
}
