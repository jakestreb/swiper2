import db from '../db';
import * as util from '../util';
import Swiper from '../Swiper';

const CIRCLE_ARROW = '\u21BB'
const HOURGLASS = '\u29D6';

export async function scheduled(this: Swiper, convo: Conversation): Promise<SwiperReply> {
  const f = this.getTextFormatter(convo);

  const unreleased = await db.media.getWithStatus('unreleased');

  const movies: string[] = unreleased
    .filter(media => media.type === 'movie')
    .map(movie => formatMovieRow(movie as IMovie, f));
  const shows: string[] = unreleased
    .filter(media => media.type === 'tv')
    .map(show => formatShowRow(show as IShow, f));

  let rows: string[] = [];
  if (shows.length > 0 && movies.length > 0) {
    rows = [f.u('TV'), ...shows, f.u('Movies'), ...movies];
  } else {
    rows = [...shows, ...movies];
  }

  return {
    data: rows.join('\n') || 'No scheduled downloads',
    final: true
  };
}

function formatMovieRow(movie: IMovie, f: TextFormatter) {
  // TODO: Calculate expected release
  const expected = movie.getExpectedRelease();
  const items = [getIcon(movie.getSearchDate()), movie.format(f)];
  if (expected) {
    const airedStr = util.getAiredStr(expected);
    items.push(f.i(airedStr));
  }
  return items.join(' ');
}

function formatShowRow(show: IShow, f: TextFormatter) {
  const { episodes } = show;
  const next = util.getNextToAir(episodes);
  const last = util.getLastAired(episodes);
  const release = next ? next.airDate : (last ? last.airDate : undefined);
  const items = [getIcon(release), show.format(f)];
  if (release) {
    const airedStr = util.getAiredStr(new Date(release));
    items.push(f.i(airedStr));
  }
  return items.join(' ');
}

function getIcon(searchDate?: Date) {
  const isChecking = !searchDate || (searchDate <= new Date());
  return isChecking ? CIRCLE_ARROW : HOURGLASS;
}
