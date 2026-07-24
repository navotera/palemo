declare module "@toast-ui/editor" {
  export default class Editor {
    constructor(options: Record<string, unknown>);
    on(event: string, listener: () => void): void;
    getMarkdown(): string;
    setMarkdown(markdown: string, cursorToEnd?: boolean): void;
    insertText(text: string): void;
    exec(name: string, payload?: Record<string, unknown>): void;
    addCommand(type: string, name: string, command: (...args: any[]) => boolean): void;
    focus(): void;
    destroy(): void;
  }
}
