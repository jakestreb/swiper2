import TextFormatter from '../io/formatters/TextFormatter';
import MediaParser from './MediaParser';

type ActionFn = (convo: Conversation, f: TextFormatter) => Promise<SwiperReply|void>;

// Decorator to attach mediaQuery to the command function converation arg passed in.
export function reqMediaQuery(target: any, name: string, descriptor: PropertyDescriptor) {
  const fn: ActionFn = new MediaParser().addMediaQuery;
  createDecorator(target, descriptor, fn);
}

// Decorator to attach mediaQuery for a single video to the command function converation arg passed in.
export function reqVideoQuery(target: any, name: string, descriptor: PropertyDescriptor) {
  const fn: ActionFn = new MediaParser({ requireVideo: true }).addMediaQuery;
  createDecorator(target, descriptor, fn);
}

// Decorator to attach media to the command function converation arg passed in.
export function reqMedia(target: any, name: string, descriptor: PropertyDescriptor) {
  const fn: ActionFn = new MediaParser().addMedia;
  createDecorator(target, descriptor, fn);
}

export function reqFullMedia(target: any, name: string, descriptor: PropertyDescriptor) {
  const fn: ActionFn = new MediaParser({ forceEpisodes: 'all' }).addMedia;
  createDecorator(target, descriptor, fn);
}

export function reqVideo(target: any, name: string, descriptor: PropertyDescriptor) {
  const fn: ActionFn = new MediaParser({ requireVideo: true }).addMedia;
  createDecorator(target, descriptor, fn);
}

function createDecorator(
  target: any,
  descriptor: PropertyDescriptor,
  modifier: ActionFn
): void {
  // Saving a reference to the original method so we can call it after updating the conversation.
  const origFn = descriptor.value;
  descriptor.value = async function(convo: Conversation, f: TextFormatter, ...args: any) {
    const reply = await modifier(convo, f);
    if (reply) {
      return reply;
    }
    return origFn.call(this, convo, ...args);
  };
}
