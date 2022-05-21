import Swiper from '../Swiper';

const movies = [
  'the lion king',
  'batman 1989',
  'the godfather 2',
  'bridesmaids',
  'austin powers 1997',
  'horrible bosses',
];

const tv = [
  'the sopranos s4 e5-8',
  'atlanta s3',
  'severance s1 e9',
  'fleabag s1 e1',
  'mr robot s2',
  'the wire s3 e1',
  'ozark s5',
  'succession s2 e1',
];

const MOVIE_COUNT = 2;
const TV_COUNT = 1;

export function unknown(this: Swiper, convo: Conversation): SwiperReply {
  const f = this.getTextFormatter(convo);

  const randomMovies = randomFromArray(movies, MOVIE_COUNT);
  const randomTv = randomFromArray(tv, TV_COUNT);
  const commands = [...randomMovies, ...randomTv].map(c => `download ${c}`);

  const data = [
    'A few options',
    f.commands(...shuffle(commands)),
    f.commands('help'),
  ].join('\n\n');

  return {
    data,
    final: true
  };
}

function randomFromArray(arr: any[], count: number): any[] {
  let remaining = arr.slice();
  let result = [];
  while (count > 0 && remaining.length > 0) {
    const pick = remaining.splice(Math.floor(Math.random() * remaining.length), 1);
    result.push(pick);
    count -= 1;
  }
  return result;
}

// Randomize array in-place using Durstenfeld shuffle algorithm
// https://stackoverflow.com/a/12646864
function shuffle(array: any[]) {
    for (var i = array.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var temp = array[i];
        array[i] = array[j];
        array[j] = temp;
    }
    return array;
}
