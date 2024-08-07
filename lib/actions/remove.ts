import * as matchUtil from './helpers/matchUtil.js';
import db from '../db/index.js';
import Swiper from '../Swiper.js';

export async function remove(this: Swiper, convo: Conversation): Promise<SwiperReply> {
  const f = this.getTextFormatter(convo);

  // Add media from request string if it was not already added
  if (!convo.storedMedia && !convo.storedVideos) {
    await addStoredMediaIfFound(convo);
  }

  if (!convo.storedMedia && !convo.storedVideos) {
    return {
      data: `Nothing matching ${convo.mediaQuery!.title} was found`,
      final: true,
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

  // Perform the user's request regarding torrent deletion.
  if (convo.input && storedVideos.length > 0) {
    const match = matchUtil.matchYesNo(convo.input);
    if (match) {
      // If yes or no, shift the task to 'complete' it, then remove it from the database.
      const video: TVideo = storedVideos[0];
      const torrent = video.torrents.shift()!;
      if (match === 'yes') {
        await doRemoveTorrent(swiper, video, torrent);
      }
      if (video.torrents.length === 0) {
        storedVideos.shift();
      }
    }
  }

  // If there are still videos or the match failed, send a confirm string.
  if (storedVideos.length > 0) {
    const video = storedVideos[0];
    const torrent = storedVideos[0].torrents[0];
    const { progress, peers } = await swiper.downloadManager.getProgress(torrent, 2000);
    return {
      data: formatConfirmTorrent(torrent.addVideo(video), f, peers, progress),
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
// Remove any DB torrents
async function doRemoveMedia(swiper: Swiper, media: IMedia): Promise<void> {
  const promises = media.getVideos().map(async video => {
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
// If that was the last torrent, remove the video
async function doRemoveTorrent(swiper: Swiper, video: TVideo, torrent: ITorrent): Promise<void> {
  await swiper.downloadManager.destroyAndDeleteTorrent(torrent.addVideo(video));
  await db.torrents.setStatus(torrent, 'removed');

  // Re-add torrents to the video from the storedVideos array to check if there are any left
  const remainingTorrents = await db.torrents.getForVideo(video.id);
  if (remainingTorrents.length === 0) {
    await db.videos.delete(video.id);
  }

  swiper.downloadManager.ping();
}

// Requires mediaQuery to be set.
async function addStoredMediaIfFound(convo: Conversation): Promise<void> {
  const mediaQuery = convo.mediaQuery;
  if (!mediaQuery) {
    throw new Error(`addStoredMediaIfFound requires mediaQuery`);
  }
  // Search the database for all matching Movies/Shows.
  if (!convo.storedMedia) {
    const searchType = mediaQuery.type || undefined;
    let mediaItems = await db.media.search(mediaQuery.title || '*', { type: searchType });
    mediaItems = filterMediaEpisodes(mediaItems, mediaQuery.episodes || 'all');
    if (mediaItems.length > 0) {
      // If a single video with multiple torrents was queried, add to storedVideos to
      // ask about removing each torrent individually
      const singleVideo = mediaItems[0].getVideo();
      if (mediaItems.length === 1 && singleVideo) {
        const withTorrents = await db.videos.addTorrents(singleVideo);
        if (withTorrents.torrents.length > 1) {
          convo.storedVideos = [withTorrents];
          return;
        }
      }
      // Otherwise, add to stored media to ask about removing entire media items
      convo.storedMedia = mediaItems;
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

function formatConfirmTorrent(t: VTorrent, f: TextFormatter, peers?: number, progress?: number): string {
  return [
    `Remove torrent from ${t.video.format(f)}`,
    `${t.format(f, peers, progress)}?`,
  ].join('\n');
}
