import Swiper from '../Swiper';
import TextFormatter from '../io/formatters/TextFormatter';

export function unknown(this: Swiper, convo: Conversation, f: TextFormatter): SwiperReply {
  const data = [
    'A few options',
    f.commands(
      'download home alone',
      'download batman 1989',
      'download the sopranos e4e5-8',
      'queued',
      'remove the sopranos',
    ),
    f.commands('help'),
  ].join('\n\n');

  return {
    data,
    final: true
  };
}
