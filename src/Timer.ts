export class Timer {
  private _name: string;
  private _start: number | null;
  private _end: number | null;
  private _elapsed: number | null;
  constructor(name: string) {
    this._name = name;
    this._start = null;
    this._end = null;
    this._elapsed = null;
  }

  start() {
    this._start = Date.now();
  }

  end() {
    this._end = Date.now();
    if (this._start) {
      this._elapsed = this._end - this._start;
    }
  }

  print() {
    if (this._elapsed !== null) {
      console.log(`${this._name}: ${this._elapsed} ms`);
    }
  }
}
