import TMDB from './libs/TMDB';
import TVDB from './libs/TVDB';
import * as log from '../log';
import * as util from '../util';
import PublicError from '../util/errors/PublicError'

export default class MediaSearch {
  public static async search(info: MediaQuery): Promise<IMedia> {
    log.debug(`MediaSearch.search(${JSON.stringify(info)})`);
    const error = new PublicError('Media search timed out');
    const tmdbMedia = await util.awaitWithTimeout(TMDB.search(info), 20000, error);
    if (tmdbMedia.media_type === 'movie') {
      return TMDB.toMovie(tmdbMedia);
    }
    const imdbId = await TMDB.getImdbId(tmdbMedia);
    const tvdbShow = await TVDB.search(imdbId);
    return TVDB.toShow(tvdbShow, imdbId);
  }
}
