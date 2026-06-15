let silentModeEnabled = false;

type AudioContextConstructor = typeof AudioContext;

const blockAudioContext = (contextName: 'AudioContext' | 'webkitAudioContext') => {
  const win = window as Window & typeof globalThis & { webkitAudioContext?: AudioContextConstructor };
  const OriginalAudioContext = win[contextName];
  if (!OriginalAudioContext) return;

  win[contextName] = class SilentAudioContext extends OriginalAudioContext {
    constructor(...args: ConstructorParameters<AudioContextConstructor>) {
      super(...args);
      this.suspend().catch(() => undefined);
    }

    resume() {
      return this.suspend();
    }

    createOscillator() {
      const oscillator = super.createOscillator();
      oscillator.start = () => undefined;
      return oscillator;
    }
  } as AudioContextConstructor;
};

const isAllowed = (element: HTMLMediaElement) =>
  element.dataset?.allowSound === 'true' || element.getAttribute('data-allow-sound') === 'true';

const muteMediaElement = (element: HTMLMediaElement) => {
  if (isAllowed(element)) return;
  element.muted = true;
  element.volume = 0;
  element.setAttribute('muted', '');
};

export const enableGlobalSilentMode = () => {
  if (silentModeEnabled || typeof window === 'undefined' || typeof document === 'undefined') return;
  silentModeEnabled = true;

  blockAudioContext('AudioContext');
  blockAudioContext('webkitAudioContext');

  document.querySelectorAll<HTMLMediaElement>('audio, video').forEach(muteMediaElement);

  const originalPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function playSilently() {
    muteMediaElement(this);
    return originalPlay.call(this);
  };

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        if (node instanceof HTMLMediaElement) muteMediaElement(node);
        node.querySelectorAll<HTMLMediaElement>('audio, video').forEach(muteMediaElement);
      });
    });
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });

  try {
    Object.defineProperty(window.navigator, 'vibrate', {
      configurable: true,
      value: () => false,
    });
  } catch {
    // Some browsers expose navigator.vibrate as read-only.
  }

  try {
    window.speechSynthesis?.cancel();
    Object.defineProperty(window.speechSynthesis, 'speak', {
      configurable: true,
      value: () => undefined,
    });
  } catch {
    // Speech synthesis may not be configurable in every browser.
  }
};