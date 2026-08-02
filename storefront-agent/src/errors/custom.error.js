class CustomError extends Error {
  constructor(statusCode, message, errors) {
    super(message);
    // Error's own `message` is created non-enumerable per the JS spec, and a
    // plain re-assignment doesn't change that attribute - so JSON.stringify
    // (and therefore res.json()/res.send() on this instance directly) would
    // silently omit it. Redefine it explicitly so error responses actually
    // include the message.
    Object.defineProperty(this, 'message', {
      value: message,
      enumerable: true,
      writable: true,
      configurable: true,
    });
    this.statusCode = statusCode;
    if (errors) {
      this.errors = errors;
    }
  }
}
export default CustomError;
