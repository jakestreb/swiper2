// import {getLastAired, getNextToAir} from '../common/media';
// import {getAiredStr, padZeros} from '../common/util';
// import {Conversation, Swiper, SwiperReply} from '../Swiper';

// export async function info(this: Swiper, convo: Conversation): Promise<SwiperReply> {
//   const media = convo.media as Media;
//   if (media.type === 'movie') {
//     // For movies, give release and DVD release.
//     const movie = media as Movie;
//     return {
//       data: `${movie.title}\n` +
//         `Release: ${movie.release || 'N/A'} | DVD Release: ${movie.dvd || 'N/A'}`,
//       final: true
//     };
//   } else {
//     // For shows, give how many seasons and episodes per season. Also give last and next air date.
//     const show = media as Show;
//     const leastOld = getLastAired(show.episodes);
//     const leastNew = getNextToAir(show.episodes);
//     const lastAired = leastOld ? getAiredStr(leastOld.airDate!) : '';
//     const nextAirs = leastNew ? getAiredStr(leastNew.airDate!) : '';
//     return {
//       data: `${show.title}\n` +
//         `${getEpisodesPerSeasonStr(show.episodes)}\n` +
//         `${lastAired}${(lastAired && nextAirs) ? ' | ' : ''}${nextAirs}`,
//       final: true
//     };
//   }
// }

// // Returns a string of the form: "S01 - S04: 6 episodes, S05: 8 episodes"
// function getEpisodesPerSeasonStr(episodes: Episode[]): string {
//   if (episodes.length === 0) {
//     return 'No episodes';
//   }
//   const counts: {[seasonNum: string]: number} = {};
//   episodes.forEach(ep => { counts[ep.seasonNum] = counts[ep.seasonNum] ? counts[ep.seasonNum] + 1 : 1; });
//   const order = Object.keys(counts).map(seasonStr => parseInt(seasonStr, 10)).sort((a, b) => a - b);
//   let streakStart: number = order[0];
//   let str = '';
//   order.forEach((s: number, i: number) => {
//     if (i > 0 && counts[s] !== counts[s - 1]) {
//       const eachStr = streakStart === s - 1 ? '' : ' each';
//       str += _getStreakStr('S', streakStart, s - 1) + `: ${counts[s - 1]} episodes${eachStr}, \n`;
//       streakStart = s;
//     }
//     if (i === order.length - 1) {
//       const eachStr = streakStart === s ? '' : ' each';
//       str += _getStreakStr('S', streakStart, s) + `: ${counts[s]} episodes${eachStr}, \n`;
//     }
//   });
//   // Remove ending comma.
//   return str.slice(0, str.length - 3);
// }

// // Helper for getEpisodesStr and getSeasonEpisodesStr to give a streak string.
// function _getStreakStr(prefix: 'S'|'E', start: number, end: number, suffix: string = ''): string {
//   return start < 0 ? '' : (start < end ? `${prefix}${padZeros(start)} - ` : '') +
//     prefix + padZeros(end) + suffix;
// }
