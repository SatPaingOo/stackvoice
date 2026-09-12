/**
 * A scripted stand-in for the browser's Web Speech API, installed before any
 * page script runs.
 *
 * Real recognition needs a microphone and a person. This lets a test decide
 * exactly which result events arrive and when — which is where browsers differ
 * in practice: Edge splits one sentence into several result events a few hundred
 * milliseconds apart, and Chrome on Android repeats a final result.
 *
 * Passed to page.addInitScript, so it must be self-contained: no imports, and
 * nothing referenced from outside the function body.
 */
export function installFakeSpeech(): void {
  const state = {
    startCalls: 0,
    /** start() while the fake synthesizer was talking: the assistant hearing itself. */
    startedWhileSpeaking: 0,
    spoken: [] as string[],
    speaking: false,
    speakMs: 150,
    timer: 0 as unknown as ReturnType<typeof setTimeout>,
    recognitions: [] as EventTarget[],
  };

  function fire(target: EventTarget, type: string, extra: Record<string, unknown> = {}): void {
    const event = Object.assign(new Event(type), extra);
    const handler = (target as unknown as Record<string, unknown>)[`on${type}`];
    if (typeof handler === 'function') (handler as (e: Event) => void).call(target, event);
    target.dispatchEvent(event);
  }

  class FakeRecognition extends EventTarget {
    lang = 'en-US';
    continuous = false;
    interimResults = false;
    maxAlternatives = 1;
    onstart: unknown = null;
    onresult: unknown = null;
    onend: unknown = null;
    onerror: unknown = null;
    onspeechend: unknown = null;
    active = false;

    constructor() {
      super();
      state.recognitions.push(this);
    }

    start(): void {
      state.startCalls += 1;
      if (state.speaking) state.startedWhileSpeaking += 1;
      if (this.active) throw new DOMException('recognition has already started', 'InvalidStateError');
      this.active = true;
      setTimeout(() => fire(this, 'start'), 0);
    }

    stop(): void {
      if (!this.active) return;
      this.active = false;
      setTimeout(() => fire(this, 'end'), 0);
    }

    abort(): void {
      this.stop();
    }
  }

  class FakeUtterance extends EventTarget {
    text: string;
    lang = 'en-US';
    rate = 1;
    pitch = 1;
    volume = 1;
    voice: unknown = null;
    onstart: unknown = null;
    onend: unknown = null;
    onerror: unknown = null;

    constructor(text = '') {
      super();
      this.text = text;
    }
  }

  let current: FakeUtterance | null = null;

  const synth = {
    get speaking(): boolean {
      return state.speaking;
    },
    pending: false,
    paused: false,
    speak(utterance: FakeUtterance): void {
      state.spoken.push(utterance.text);
      state.speaking = true;
      current = utterance;
      setTimeout(() => fire(utterance, 'start'), 0);
      state.timer = setTimeout(() => {
        state.speaking = false;
        current = null;
        fire(utterance, 'end');
      }, state.speakMs);
    },
    cancel(): void {
      if (!state.speaking || current === null) return;
      clearTimeout(state.timer);
      const interrupted = current;
      state.speaking = false;
      current = null;
      // Chrome reports a cancelled utterance as an error, not an end.
      fire(interrupted, 'error', { error: 'interrupted' });
    },
    getVoices: () => [],
    pause: () => undefined,
    resume: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };

  const w = window as unknown as Record<string, unknown>;
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  w['SpeechSynthesisUtterance'] = FakeUtterance;
  w['SpeechRecognition'] = FakeRecognition;
  w['webkitSpeechRecognition'] = FakeRecognition;

  function latest(): FakeRecognition {
    const recognition = state.recognitions[state.recognitions.length - 1] as FakeRecognition | undefined;
    if (recognition === undefined) throw new Error('the page never created a recognizer');
    return recognition;
  }

  /** Each phrase becomes one final result; `resultIndex` is where the new ones start. */
  function results(phrases: string[]): unknown[] {
    return phrases.map((transcript) => Object.assign([{ transcript, confidence: 0.92 }], { isFinal: true }));
  }

  w['__speech'] = {
    state,
    result(phrases: string[], resultIndex = 0): void {
      fire(latest(), 'result', { results: results(phrases), resultIndex });
    },
    end(): void {
      const recognition = latest();
      recognition.active = false;
      fire(recognition, 'end');
    },
    noSpeech(): void {
      const recognition = latest();
      recognition.active = false;
      fire(recognition, 'error', { error: 'no-speech' });
      fire(recognition, 'end');
    },
  };
}
