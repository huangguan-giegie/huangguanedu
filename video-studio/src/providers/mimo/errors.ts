export class MimoAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MimoAdapterError";
  }
}
