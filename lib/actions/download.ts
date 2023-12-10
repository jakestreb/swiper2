import db from '../db';
import Swiper from '../Swiper';

export async function download(this: Swiper, convo: Conversation): Promise<SwiperReply> {
  const f = this.getTextFormatter(convo);

  let isAnyReleased = false;

  const media = convo.media as IMedia;
  const video: IVideo|null = media.getVideo();
  if (video) {
    const existing = await db.videos.getOne(video.id);
    const wt = existing ? await db.videos.addTorrents(existing) : null;
    if (wt && wt.status === 'downloading' && wt.torrents.length > 0) {
      // For videos that already have torrents, add another
      await this.worker.addJob({
        type: 'AddTorrent',
        videoId: video.id,
        startAt: new Date(),
      });
      return {
        data: `Added new search for ${video.format(f)}`,
        final: true
      };
    }
    isAnyReleased = isReleased(video);
    try {
      await db.media.insert(media, {
        addedBy: convo.id,
        status: isAnyReleased ? 'searching' : 'unreleased',
      });
    } catch (err: any) {
      if (err.code !== 'SQLITE_CONSTRAINT') {
        throw err;
      }
      return {
        data: 'Video must be removed before re-downloading',
        final: true
      };
    }
    await checkOrAwaitRelease(this, video);
  } else {
    const show = media as IShow;
    isAnyReleased = show.episodes.some(e => isReleased(e));
    try {
      await db.shows.insert(show, { addedBy: convo.id, status: 'searching' });
    } catch (err: any) {
      if (err.code !== 'SQLITE_CONSTRAINT') {
        throw err;
      }
      return {
        data: 'Show must be removed before re-downloading',
        final: true
      };
    }
    await Promise.all(show.episodes.map(async (e, i) => {
      if (!isReleased(e)) {
        await db.episodes.setStatus(e, 'unreleased');
      }
      // Add a small delay for each additional search to preserve order
      await checkOrAwaitRelease(this, e, i * 10);
    }));
  }

  return {
    data: f.multiMessage(
      `${isAnyReleased ? 'Queued' : 'Scheduled'} ${media.format(f)} for download`,
      isAnyReleased ? f.commands('queue') : f.commands('scheduled')
    ),
    final: true
  };
}

function getDefinitiveRelease(video: IVideo): Date|undefined {
  const releases = (video as IMovie).releases;
  let definitive = releases ? releases.digital : (video as IEpisode).airDate;
  const expected = video.isMovie() && video.getExpectedRelease();
  if (!definitive && expected) {
    // If there's no definitive release, but it's 4 months after expected, assume its released
    expected.setDate(expected.getDate() + 120);
    definitive = expected;
  }
  return definitive;
}

function isReleased(video: IVideo) {
  const definitiveRelease = getDefinitiveRelease(video);
  return Boolean(definitiveRelease && new Date() >= definitiveRelease);
}

function checkOrAwaitRelease(swiper: Swiper, video: IVideo, delayS: number = 0) {
  const hasAirDate = (video.isEpisode() && video.airDate) || (video.isMovie() && video.releases.digital);
  const hasAired = video.getSearchDate() < new Date();
  return swiper.worker.addJob({
    type: hasAirDate ? 'StartSearching' : 'CheckForRelease',
    videoId: video.id,
    startAt: hasAired ? new Date(Date.now() + delayS * 1000) : video.getSearchDate(),
  });
}
