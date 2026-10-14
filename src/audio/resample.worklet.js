/**
 * Resample AudioWorklet — downsamples the captured tab audio to 16 kHz mono
 * and emits fixed 100 ms frames for the fallback VAD path.
 *
 * This file is loaded raw by the browser (AudioWorklet.addModule, served via
 * Vite's ?url asset passthrough) — it must stay plain JavaScript with NO
 * imports. The frame constants mirror AUDIO in src/lib/constants.js.
 *
 * Message protocol (this.port):
 *   sends:     { type: 'frame', samples: Float32Array(1600), timestamp: number }
 *              — the samples buffer is TRANSFERRED (zero-copy) each frame
 *   receives:  { type: 'reset' } — drops the carry buffer (new session)
 *
 * WHY phase-carrying linear interpolation: render quanta are only 128
 * samples at the context rate (usually 48 kHz, ratio 3:1). Keeping the
 * fractional resampler phase across quanta prevents discontinuities that
 * would otherwise show up as broadband noise for the ASR model.
 */
class ResamplerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.targetRate = 16000;
    this.frameSamples = 1600; // 100 ms at 16 kHz
    this.step = sampleRate / this.targetRate; // input samples per output sample
    /** Input carry buffer: previous quanta tail + current quantum. */
    this.buf = new Float32Array(512);
    this.bufLen = 0;
    /** Fractional position of the next output sample inside buf. */
    this.phase = 0;
    this.port.onmessage = (event) => {
      if (event.data && event.data.type === 'reset') {
        this.bufLen = 0;
        this.phase = 0;
      }
    };
  }

  /**
   * @param {Float32Array[][]} inputs - [input][channel] samples
   * @returns {boolean} true to keep the processor alive
   */
  process(inputs) {
    const channels = inputs[0];
    if (!channels || channels.length === 0) return true;
    const left = channels[0];
    const right = channels.length > 1 ? channels[1] : null;

    // Append the mono mix of this quantum to the carry buffer.
    for (let i = 0; i < left.length; i += 1) {
      const mono = right ? (left[i] + right[i]) * 0.5 : left[i];
      this.buf[this.bufLen + i] = mono;
    }
    const total = this.bufLen + left.length;
    this.bufLen = total;

    // Emit resampled samples with linear interpolation between neighbours.
    while (this.phase + 1 < total) {
      const i0 = Math.floor(this.phase);
      const frac = this.phase - i0;
      const sample = this.buf[i0] * (1 - frac) + this.buf[i0 + 1] * frac;
      this.#emit(sample);
      this.phase += this.step;
    }

    // Keep the un-consumed tail for the next quantum.
    const consumed = Math.floor(this.phase);
    this.buf.copyWithin(0, consumed);
    this.bufLen = total - consumed;
    this.phase -= consumed;
    return true;
  }

  /**
   * Accumulate one output sample; flush a frame when full.
   *
   * @param {number} sample - resampled 16 kHz sample
   */
  #emit(sample) {
    this.pending = this.pending ?? new Float32Array(this.frameSamples);
    this.pending[this.pendingLen ?? 0] = sample;
    this.pendingLen = (this.pendingLen ?? 0) + 1;
    if (this.pendingLen === this.frameSamples) {
      // Transfer ownership: the main thread receives the buffer, we allocate
      // a fresh one for the next frame (transfer detaches the old buffer).
      const frame = this.pending;
      this.pending = new Float32Array(this.frameSamples);
      this.pendingLen = 0;
      this.port.postMessage({ type: 'frame', samples: frame, timestamp: currentTime }, [
        frame.buffer,
      ]);
    }
  }
}

registerProcessor('livevox-resampler', ResamplerProcessor);
