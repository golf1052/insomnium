declare module 'tinykeys' {
  export interface KeyBindingMap {
    [keybinding: string]: (event: KeyboardEvent) => void;
  }

  export interface KeyBindingHandlerOptions {
    timeout?: number;
  }

  export interface KeyBindingOptions extends KeyBindingHandlerOptions {
    event?: 'keydown' | 'keyup';
  }

  export function createKeybindingsHandler(
    keyBindingMap: KeyBindingMap,
    options?: KeyBindingHandlerOptions,
  ): EventListener;

  export default function tinykeys(
    target: Window | HTMLElement,
    keyBindingMap: KeyBindingMap,
    options?: KeyBindingOptions,
  ): () => void;
}
