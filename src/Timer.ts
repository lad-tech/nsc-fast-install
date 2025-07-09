export class Timer {
  private name: string;
  private startTime?: number;
  private endTime?: number;

  constructor(name: string) {
    this.name = name;
  }

  start(): void {
    this.startTime = Date.now();
  }

  end(): void {
    if (this.startTime === undefined) {
      console.warn(`[Timer "${this.name}"] end() called before start()`);
      return;
    }
    this.endTime = Date.now();
  }

  get elapsed(): number | null {
    if (this.startTime !== undefined && this.endTime !== undefined) {
      return this.endTime - this.startTime;
    }
    return null;
  }

  print(): void {
    const ms = this.elapsed;
    if (ms !== null) {
      const msg = ms > 1000
        ? `${this.name}: ${(ms / 1000).toFixed(2)} s`
        : `${this.name}: ${ms} ms`;
      console.log(msg);
    } else {
      console.log(`${this.name}: timer not completed`);
    }
  }
}