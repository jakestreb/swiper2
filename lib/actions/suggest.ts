import {DBManager} from '../DBManager';
import {getDescription, Movie} from '../media';
import {getPopularReleasedBetween} from '../request';
import {Conversation, Swiper, SwiperReply} from '../Swiper';
import {getMorning, matchYesNo} from '../util';

export async function suggest(this: Swiper, convo: Conversation): Promise<SwiperReply> {
  if (convo.media && convo.input) {
    const match = matchYesNo(convo.input);
    if (match) {
      await this.dbManager.setSuggested(convo.media, convo.id);
      if (match === 'yes') {
        await this.dbManager.addToMonitored(convo.media, convo.id);
      }
    } else {
      return { data: `Add ${getDescription(convo.media)} to monitored?` };
    }
  }
  const movie = await getNextSuggestion(this.dbManager);
  if (movie) {
    convo.media = movie;
    return { data: `Add ${getDescription(movie)} to monitored?` };
  }
  return {
    data: `Out of suggestions`,
    final: true
  };
}

async function getNextSuggestion(dbManager: DBManager): Promise<Movie|null> {
  const week = 7 * 24 * 60 * 60 * 1000;
  let windowEnd = getMorning().getTime();
  let windowStart = windowEnd - week;
  const min = windowStart - (52 * week);
  while (windowStart >= min) {
    const movies = await getPopularReleasedBetween(new Date(windowStart), new Date(windowEnd));
    while (movies.length > 0) {
      const m = movies.pop()!;
      if (await isUnsuggested(dbManager, m)) {
        return m;
      }
    }
    windowStart -= week;
    windowEnd -= week;
  }
  return null;
}

async function isUnsuggested(dbManager: DBManager, movie: Movie): Promise<boolean> {
  const videoMeta = await dbManager.addMetadata(movie)
  return !videoMeta.isPredictive;
}
