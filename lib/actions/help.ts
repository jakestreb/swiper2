import Swiper from '../Swiper';
import TextFormatter from '../io/formatters/TextFormatter';

const COMMANDS = [{
  name: 'queued',
  description: 'shows all queued downloads',
}, {
  name: 'scheduled',
  description: 'shows all scheduled downloads',
}, {
  name: 'info',
  description: 'shows release information about a movie/show',
  examples: [
    "info the santa clause",
    "info wandavision",
  ]
}, {
  name: 'download',
  description: 'downloads a movie/show\nre-running adds the next best torrent',
  examples: [
    "download the lion king",
    "download batman 1989",
    "download stranger things s2",
    "download the office s1 e2-4 & e6"
  ]
}, {
  name: "remove",
  description: "removes a queued/scheduled movie/show, or a torrent of that movie/show",
  examples: [
    "remove pulp fiction",
    "remove severance s2",
    "remove torrent severance"
  ]
}, {
  name: "cancel",
  description: "ends the current conversation"
}, {
  name: "search",
  description: "gives a list of torrent options for a movie/episode",
  examples: [
    "search old yeller",
    "search game of thrones s1 e2"
  ]
}];

export function help(this: Swiper, convo: Conversation, f: TextFormatter): SwiperReply {
  if (!convo.input) {
    const basics = [
      f.commands(
        `${f.b('download')} [show or movie]`,
        `${f.b('remove')} [show or movie]`,
        `${f.b('remove torrent')} [show or movie]`
      ),
      f.commands(
        f.b('queued'),
        f.b('scheduled'),
        `${f.b('info')} [show or movie]`
      ),
      f.commands(
        `${f.b('help')} [command]`,
        `${f.b('cancel')} to end any conversation`,
      ),
    ].join('\n');

    return {
      data: basics,
      final: true
    };
  } else {
    const cmd = COMMANDS.find(cmd => cmd.name === convo.input);
    if (!cmd) {
      return {
        data: `Command not recognized`,
        final: true
      };
    } else {
      const items = [cmd.name, cmd.description];
      if (cmd.examples) {
        items.push(f.commands(...cmd.examples));
      }
      return {
        data: items.join('\n\n'),
        final: true
      };
    }
  }
}
