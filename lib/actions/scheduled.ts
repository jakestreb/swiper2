import db from '../db';
import * as util from '../util';
import Swiper from '../Swiper';

const CIRCLE_ARROW = '\u21BB'
const HOURGLASS = '\u29D6';

export async function scheduled(this: Swiper, convo: Conversation): Promise<SwiperReply> {
  const f = this.getTextFormatter(convo);

  const unreleased = await db.media.getWithStatus('unreleased');

  const movies: string[] = (unreleased as IMovie[])
    .filter(media => media.isMovie())
    .sort((a, b) => {
      const timeA = a.getExpectedRelease()?.getTime() || 0;
      const timeB = b.getExpectedRelease()?.getTime() || 0;
      return timeA - timeB;
    })
    .map(movie => formatMovieRow(movie as IMovie, f));

  const shows: string[] = (unreleased as IShow[])
    .filter(media => media.isShow())
    .sort((a, b) => {
      const timeA = (a.getNextToAir() || a.getLastAired())?.airDate?.getTime() || 0;
      const timeB = (b.getNextToAir() || b.getLastAired())?.airDate?.getTime() || 0;
      return timeA - timeB;
    })
    .map(show => formatShowRow(show as IShow, f));

  let rows: string[] = [];
  if (shows.length > 0 && movies.length > 0) {
    rows = [
      [f.i('M O V I E S'), ...movies].join('\n'),
      [f.i('T V'), ...shows].join('\n'),
    ];
  } else {
    rows = [...movies, ...shows];
  }

  return {
    data: f.multiMessage(...rows) || 'No scheduled downloads',
    final: true
  };
}

function formatMovieRow(movie: IMovie, f: TextFormatter) {
  const expected = movie.getExpectedRelease();
  const titleStr = [getIcon(movie.getSearchDate()), movie.format(f)].join(' ');
  if (expected) {
    const approxStr = `${f.sp(2)}${util.getApproximateDate(expected)}`;
    return [titleStr, f.i(approxStr)].join('\n');
  }
  return titleStr;
}

function formatShowRow(show: IShow, f: TextFormatter) {
  const { episodes } = show;
  const next = util.getNextToAir(episodes);
  const last = util.getLastAired(episodes);
  const release = next ? next.airDate : (last ? last.airDate : undefined);
  const titleStr = [getIcon(release), `${f.b(show.title)}`].join(' ');
  const episodesStr = f.i(`(${show.episodesToString()})`);
  if (release) {
    const airedStr = f.i(util.getAiredStr(new Date(release)));
    return [titleStr, `${f.sp(2)}${airedStr} ${episodesStr}`].join('\n');
  }
    return [titleStr, `${f.sp(2)}${episodesStr}`].join('\n');
}

function getIcon(searchDate?: Date) {
  const isChecking = !searchDate || (searchDate <= new Date());
  return isChecking ? CIRCLE_ARROW : HOURGLASS;
}
