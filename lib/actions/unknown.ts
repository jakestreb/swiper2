import Swiper from '../Swiper';

export function unknown(this: Swiper, convo: Conversation): SwiperReply {
  const f = this.getTextFormatter(convo);
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
