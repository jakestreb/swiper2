export default class PublicError extends Error {
  public name: string = 'PublicError';
  // A PublicError's message is shared with the client
}
