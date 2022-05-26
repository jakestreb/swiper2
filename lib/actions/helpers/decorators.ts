import TextFormatter from '../../io/formatters/TextFormatter';
import MediaParser from './MediaParser';
import Swiper from '../../Swiper';

type ActionFn = (convo: Conversation, f: TextFormatter) => Promise<SwiperReply|void>;

// Decorator to attach mediaQuery to the command function converation arg passed in.
export function reqMediaQuery(target: any, name: string, descriptor: PropertyDescriptor) {
  const fn: ActionFn = (...args) => new MediaParser().addMediaQuery(...args);
  createDecorator(target, descriptor, fn);
}

// Decorator to attach mediaQuery for a single video to the command function converation arg passed in.
export function reqVideoQuery(target: any, name: string, descriptor: PropertyDescriptor) {
  const fn: ActionFn = (...args) => new MediaParser({ requireVideo: true }).addMediaQuery(...args);
  createDecorator(target, descriptor, fn);
}

// Decorator to attach media to the command function converation arg passed in.
export function reqMedia(target: any, name: string, descriptor: PropertyDescriptor) {
  const fn: ActionFn = (...args) => new MediaParser().addMedia(...args);
  createDecorator(target, descriptor, fn);
}

export function reqFullMedia(target: any, name: string, descriptor: PropertyDescriptor) {
  const fn: ActionFn = (...args) => new MediaParser({ forceEpisodes: 'all' }).addMedia(...args);
  createDecorator(target, descriptor, fn);
}

export function reqVideo(target: any, name: string, descriptor: PropertyDescriptor) {
  const fn: ActionFn = (...args) => new MediaParser({ requireVideo: true }).addMedia(...args);
  createDecorator(target, descriptor, fn);
}

function createDecorator(
  target: any,
  descriptor: PropertyDescriptor,
  modifier: ActionFn
): void {
  // Saving a reference to the original method so we can call it after updating the conversation.
  const origFn = descriptor.value;
  descriptor.value = async function(convo: Conversation, ...args: any) {
    const f = (this as Swiper).getTextFormatter(convo);
    const reply = await modifier(convo, f);
    if (reply) {
      return reply;
    }
    return origFn.call(this, convo, ...args);
  };
}
