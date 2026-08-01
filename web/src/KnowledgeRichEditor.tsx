import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Color } from "@tiptap/extension-color";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Placeholder from "@tiptap/extension-placeholder";
import Image from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { TextStyle } from "@tiptap/extension-text-style";
import { Extension, InputRule, markInputRule, markPasteRule } from "@tiptap/core";
import {
  Italic as TiptapItalic,
  starPasteRegex,
  underscorePasteRegex,
} from "@tiptap/extension-italic";
import { Markdown } from "@tiptap/markdown";
import { Plugin, TextSelection } from "@tiptap/pm/state";
import { CellSelection } from "@tiptap/pm/tables";
import {
  EditorContent,
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
  useEditor,
} from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Check,
  Code2,
  Eraser,
  FlaskConical,
  Heading,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  Table2,
  Underline as UnderlineIcon,
  Undo2,
} from "lucide-react";
import bash from "highlight.js/lib/languages/bash";
import csharp from "highlight.js/lib/languages/csharp";
import css from "highlight.js/lib/languages/css";
import go from "highlight.js/lib/languages/go";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import php from "highlight.js/lib/languages/php";
import python from "highlight.js/lib/languages/python";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import { createLowlight } from "lowlight";
import { countMarkdownWords } from "./markdownMetrics";
import "./knowledge-rich-editor.css";

const WORD_LIMIT = 50000;
const CHANGE_DEBOUNCE_MS = 600;
const CODE_DETECTION_DEBOUNCE_MS = 450;
const CODE_DETECTION_LIMIT = 20000;
const CODE_LANGUAGES = [
  ["plaintext", "Plain text"],
  ["xml", "HTML / XML"],
  ["css", "CSS"],
  ["javascript", "JavaScript"],
  ["typescript", "TypeScript"],
  ["json", "JSON"],
  ["php", "PHP"],
  ["sql", "SQL"],
  ["bash", "Bash / Shell"],
  ["python", "Python"],
  ["go", "Go"],
  ["java", "Java"],
  ["csharp", "C#"],
] as const;

const TEXT_COLOR_PALETTE = [
  ["#dc2626", "Red"],
  ["#eab308", "Yellow"],
  ["#16a34a", "Green"],
  ["#111827", "Black"],
  ["#6b7280", "Grey"],
  ["#2563eb", "Blue"],
  ["#7c3aed", "Purple"],
] as const;

function safeHttpUrl(value: string): string | null {
  if (!value || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function getActiveHeadingLevel(editor: { isActive: (name: string, attributes?: Record<string, unknown>) => boolean }): number | null {
  for (const level of [1, 2, 3]) {
    if (editor.isActive("heading", { level })) return level;
  }
  return null;
}

function getActiveTextColor(editor: { getAttributes: (name: string) => Record<string, unknown> }): string {
  const color = editor.getAttributes("textStyle").color;
  return typeof color === "string" ? color.toLowerCase() : "";
}

async function uploadKnowledgeImage(file: File): Promise<string> {
  const form = new FormData();
  form.append("image", file);
  const response = await fetch("/api/v1/knowledge/media", {
    method: "POST",
    credentials: "include",
    headers: { Accept: "application/json", "Idempotency-Key": crypto.randomUUID() },
    body: form,
  });
  const body = await response.json() as {
    data: { url: string } | null;
    errors: Array<{ message: string }> | null;
  };
  if (!response.ok || !body.data?.url) {
    throw new Error(body.errors?.[0]?.message || "Image upload failed.");
  }
  return body.data.url;
}

const lowlight = createLowlight();
lowlight.register({
  bash,
  csharp,
  css,
  go,
  java,
  javascript,
  json,
  php,
  python,
  sql,
  typescript,
  xml,
});

function normalizeLegacyMarkdown(markdown: string): string {
  return markdown.replace(/<u>([\s\S]*?)<\/u>/gi, "++$1++");
}

function looksLikeMarkdownDocument(value: string): boolean {
  const text = value.trim();
  if (!text || text.length > 1_000_000) return false;
  const blockMarkers = [
    /^#{1,6}\s+\S/m,
    /^(?:[-*+]\s+|\d+\.\s+)\S/m,
    /^>{1,3}\s+\S/m,
    /^(?:-{3,}|_{3,}|\*{3,})\s*$/m,
    /^```[\w-]*\s*$/m,
  ].filter((pattern) => pattern.test(text)).length;
  const inlineMarkers = [
    /\*\*[^*\n]+\*\*/,
    /(?:^|\s)\*[^*\n]+\*(?:\s|[.,!?]|$)/,
    /~~[^~\n]+~~/,
    /\[[^\]\n]+\]\(https?:\/\/[^)\s]+\)/,
  ].filter((pattern) => pattern.test(text)).length;
  return blockMarkers >= 2 || (blockMarkers >= 1 && inlineMarkers >= 1);
}

const MarkdownPaste = Extension.create({
  name: "knowledgeMarkdownPaste",
  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        props: {
          handlePaste(_view, event) {
            if (event.clipboardData?.files.length) return false;
            const text = event.clipboardData?.getData("text/plain") || "";
            if (!looksLikeMarkdownDocument(text)) return false;
            event.preventDefault();
            return editor.commands.insertContent(normalizeLegacyMarkdown(text), {
              contentType: "markdown",
            });
          },
        },
      }),
    ];
  },
});

const MarkdownTextStyle = TextStyle.extend({
  markdownTokenName: "coloredText",
  parseMarkdown(token: any, helpers: any) {
    return helpers.applyMark(
      "textStyle",
      helpers.parseInline(token.tokens || []),
      { color: token.color },
    );
  },
  renderMarkdown(node: any, helpers: any) {
    const content = helpers.renderChildren(node);
    const color = node.attrs?.color;
    return color
      ? `<span style="color: ${color}">${content}</span>`
      : content;
  },
  markdownTokenizer: {
    name: "coloredText",
    level: "inline",
    start(source: string) {
      const match = source.match(/<span\s+style=["']color\s*:/i);
      return match?.index ?? -1;
    },
    tokenize(source: string, _tokens: unknown, lexer: any) {
      const match =
        /^<span\s+style=["']color\s*:\s*([^;"']+)\s*;?["']>([\s\S]+?)<\/span>/i.exec(
          source,
        );
      if (!match) return undefined;
      return {
        type: "coloredText",
        raw: match[0],
        color: match[1].trim(),
        tokens: lexer.inlineTokens(match[2]),
      };
    },
  },
});

const ReliableItalic = TiptapItalic.extend({
  addInputRules() {
    return [
      markInputRule({
        find: /(?:^|\s)(\*([^*\n]+)\*)$/,
        type: this.type,
      }),
      markInputRule({
        find: /(?:^|\s)(_([^_\n]+)_)$/,
        type: this.type,
      }),
    ];
  },
  addPasteRules() {
    return [
      markPasteRule({ find: starPasteRegex, type: this.type }),
      markPasteRule({ find: underscorePasteRegex, type: this.type }),
    ];
  },
}).configure({ HTMLAttributes: { class: "knowledge-italic" } });

const ReliableItalicFallback = Extension.create({
  name: "knowledgeReliableItalicFallback",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction: (transactions, _oldState, newState) => {
          if (!transactions.some((transaction) => transaction.docChanged)) return null;
          const { $from } = newState.selection;
          if (!$from.parent.isTextblock || $from.parent.type.name === "codeBlock") return null;
          const paragraphText = $from.parent.textContent;
          const match = /(^|\s)\*([^*\n]+)\*$/.exec(paragraphText);
          if (!match) return null;
          const italic = newState.schema.marks.italic;
          if (!italic) return null;
          const content = match[2];
          const prefixLength = match[1].length;
          const from = $from.start() + (match.index ?? 0) + prefixLength;
          const to = from + content.length + 2;
          const transaction = newState.tr.replaceWith(
            from,
            to,
            newState.schema.text(content, [italic.create()]),
          );
          transaction.setSelection(TextSelection.create(transaction.doc, from + content.length));
          return transaction;
        },
      }),
    ];
  },
});

function detectCodeLanguage(source: string): string | null {
  const code = source.slice(0, CODE_DETECTION_LIMIT).trim();
  if (code.length < 3) return null;
  try {
    JSON.parse(code);
    return "json";
  } catch {
    // Continue with bounded pattern matching.
  }
  if (/^<\?php|\$[A-Za-z_]\w*\s*=|->\w+\s*\(/m.test(code)) return "php";
  if (
    /^\s*(?:<!doctype\s+html|<\/?(?:html|body|div|span|section|main|script|style)\b)/i.test(
      code,
    )
  )
    return "xml";
  if (
    /\b(?:SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|CREATE\s+TABLE)\b[\s\S]*\b(?:FROM|VALUES|SET|TABLE)\b/i.test(
      code,
    )
  )
    return "sql";
  if (/^\s*(?:package\s+main|func\s+\w+\s*\()/m.test(code)) return "go";
  if (/\busing\s+System\s*;|Console\.WriteLine\s*\(/.test(code)) return "csharp";
  if (/\bpublic\s+(?:static\s+)?class\s+\w+|System\.out\.print/.test(code))
    return "java";
  if (
    /^\s*(?:#!.*\b(?:bash|sh)\b|(?:export\s+)?[A-Z_][A-Z0-9_]*=|(?:echo|printf|sudo|chmod|curl)\s+)/m.test(
      code,
    )
  )
    return "bash";
  if (
    /^\s*(?:def\s+\w+\s*\(|from\s+\w+(?:\.\w+)*\s+import\s+|import\s+\w+|class\s+\w+.*:)|\bself\.\w+|print\s*\(/m.test(
      code,
    )
  )
    return "python";
  if (
    /\b(?:interface|type)\s+\w+\s*[={]|\b(?:const|let|var)\s+\w+\s*:\s*(?:string|number|boolean|unknown|Record)\b/.test(
      code,
    )
  )
    return "typescript";
  if (
    /\b(?:const|let|var)\s+\w+|=>|\bfunction\s+\w*\s*\(|console\.\w+\s*\(/.test(
      code,
    )
  )
    return "javascript";
  if (/(?:^|})\s*[.#]?[\w\s,:>+~\[\]="'-]+\s*\{\s*[\w-]+\s*:/m.test(code))
    return "css";
  return null;
}

function CodeBlockNodeView({ node, updateAttributes }: NodeViewProps) {
  const language = node.attrs.language || "plaintext";
  const [copied, setCopied] = useState(false);
  async function copyCode() {
    try {
      await navigator.clipboard.writeText(node.textContent);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }
  return (
    <NodeViewWrapper className="tiptap-code-block" data-language={language}>
      <div className="tiptap-code-actions" contentEditable={false}>
        <select
          aria-label="Code language"
          value={language}
          onChange={(event) => updateAttributes({ language: event.target.value })}
        >
          {CODE_LANGUAGES.map(([value, label]) => (
            <option value={value} key={value}>{label}</option>
          ))}
        </select>
        <button
          type="button"
          className={copied ? "copied" : ""}
          title={copied ? "Copied" : "Copy code"}
          aria-label={copied ? "Code copied" : "Copy code"}
          onClick={() => void copyCode()}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="8" y="8" width="11" height="11" rx="2" />
            <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
          </svg>
        </button>
      </div>
      <pre><NodeViewContent as={"code" as "div"} /></pre>
    </NodeViewWrapper>
  );
}

const VisualCodeBlock = CodeBlockLowlight.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockNodeView);
  },
  addInputRules() {
    return [
      new InputRule({
        find: /^```$/,
        handler: ({ range, commands }) => {
          commands.command(({ tr }) => {
            tr.delete(range.from, range.to);
            tr.setBlockType(range.from, range.from, this.type);
            tr.setSelection(TextSelection.create(tr.doc, range.from));
            return true;
          });
        },
      }),
    ];
  },
}).configure({
  lowlight,
  defaultLanguage: null,
  enableTabIndentation: true,
  tabSize: 2,
});

const TrailingParagraph = Extension.create({
  name: "knowledgeTrailingParagraph",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction: (_transactions, _oldState, newState) => {
          const lastNode = newState.doc.lastChild;
          if (!lastNode || lastNode.type.name !== "codeBlock") return null;
          return newState.tr.insert(
            newState.doc.content.size,
            newState.schema.nodes.paragraph.create(),
          );
        },
      }),
    ];
  },
});

const TableDragSelection = Extension.create({
  name: "tableDragSelection",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handleDOMEvents: {
            mousedown(view, event) {
              if (event.button !== 0) return false;
              const element = event.target instanceof Element ? event.target : null;
              const startCell = element?.closest("td, th");
              if (!startCell || !view.dom.contains(startCell)) return false;
              const cellPosition = (cell: Element) => {
                const position = view.posAtDOM(cell, 0) - 1;
                const node = view.state.doc.nodeAt(position);
                return node && ["tableCell", "tableHeader"].includes(node.type.name)
                  ? position
                  : null;
              };
              const anchorCell = cellPosition(startCell);
              if (anchorCell === null) return false;
              let dragging = false;
              const onMouseMove = (moveEvent: MouseEvent) => {
                const moveElement = moveEvent.target instanceof Element ? moveEvent.target : null;
                const endCell = moveElement?.closest("td, th");
                if (!endCell || !view.dom.contains(endCell)) return;
                const headCell = cellPosition(endCell);
                if (headCell === null || headCell === anchorCell) return;
                dragging = true;
                moveEvent.preventDefault();
                view.dispatch(
                  view.state.tr.setSelection(
                    CellSelection.create(view.state.doc, anchorCell, headCell),
                  ),
                );
              };
              const onMouseUp = (upEvent: MouseEvent) => {
                document.removeEventListener("mousemove", onMouseMove, true);
                document.removeEventListener("mouseup", onMouseUp, true);
                if (dragging) upEvent.preventDefault();
              };
              document.addEventListener("mousemove", onMouseMove, true);
              document.addEventListener("mouseup", onMouseUp, true);
              return false;
            },
          },
        },
      }),
    ];
  },
});

export type KnowledgeRichEditorHandle = { getMarkdown: () => string };
export const KnowledgeRichEditor = forwardRef<
  KnowledgeRichEditorHandle,
  {
    value: string;
    onChange: (value: string) => void;
    onRecommendExternal?: () => void;
    readOnly?: boolean;
    ariaLabel?: string;
    compact?: boolean;
    changeDebounceMs?: number;
  }
>(function KnowledgeRichEditor({ value, onChange, onRecommendExternal, readOnly=false, ariaLabel="Knowledge visual editor", compact=false, changeDebounceMs=CHANGE_DEBOUNCE_MS }, ref) {
  const changeTimer = useRef<number | null>(null);
  const detectionTimer = useRef<number | null>(null);
  const colorPickerRef = useRef<HTMLDivElement>(null);
  const bubbleSelectionRef = useRef<{ from: number; to: number } | null>(null);
  const nativeColorPickerActiveRef = useRef(false);
  const colorPickerReleaseTimer = useRef<number | null>(null);
  const onChangeRef = useRef(onChange);
  const readOnlyRef = useRef(readOnly);
  const [displayValue, setDisplayValue] = useState(value);
  const [headingMenu, setHeadingMenu] = useState(false);
  const [activeHeadingLevel, setActiveHeadingLevel] = useState<number | null>(null);
  const [colorMenu, setColorMenu] = useState(false);
  const [bubbleColorMenu, setBubbleColorMenu] = useState(false);
  const [activeTextColor, setActiveTextColor] = useState("");
  const [imageMenu, setImageMenu] = useState(false);
  const [tableMenu, setTableMenu] = useState(false);
  const [tableSize, setTableSize] = useState({ rows: 3, cols: 3 });
  const [imageUrl, setImageUrl] = useState("");
  const [imageAlt, setImageAlt] = useState("");
  const [imageError, setImageError] = useState("");
  const [clipboardUpload, setClipboardUpload] = useState<"idle" | "uploading">("idle");
  const [clipboardError, setClipboardError] = useState("");
  const [showLimitWarning, setShowLimitWarning] = useState(false);
  const limitDismissed = useRef(false);
  const bubbleColorOpenRef = useRef(false);
  onChangeRef.current = onChange;
  readOnlyRef.current = readOnly;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        italic: false,
      }),
      ReliableItalic,
      ReliableItalicFallback,
      Markdown,
      MarkdownPaste,
      VisualCodeBlock,
      TaskList,
      TaskItem.configure({ nested: true }),
      TableKit.configure({ table: { resizable: true } }),
      TableDragSelection,
      MarkdownTextStyle,
      Color,
      Placeholder.configure({
        placeholder: "Write and structure your knowledge...",
      }),
      Image.configure({
        allowBase64: false,
        HTMLAttributes: {
          loading: "lazy",
          referrerpolicy: "no-referrer",
        },
      }),
      TrailingParagraph,
    ],
    content: normalizeLegacyMarkdown(value || ""),
    contentType: "markdown",
    immediatelyRender: false,
    editable: !readOnly,
    editorProps: {
      attributes: {
        class: "knowledge-tiptap-content",
        "aria-label": ariaLabel,
      },
      handlePaste: (view, event) => {
        if (readOnlyRef.current) return true;
        const image = Array.from(event.clipboardData?.files || []).find((file) =>
          ["image/jpeg", "image/png", "image/webp"].includes(file.type),
        );
        if (!image) return false;
        event.preventDefault();
        if (image.size > 5 * 1024 * 1024) {
          setClipboardError("Clipboard image must be 5 MB or smaller.");
          return true;
        }
        setClipboardError("");
        setClipboardUpload("uploading");
        void uploadKnowledgeImage(image)
          .then((url) => {
            const imageNode = view.state.schema.nodes.image.create({ src: url, alt: "Pasted image" });
            view.dispatch(view.state.tr.replaceSelectionWith(imageNode).scrollIntoView());
          })
          .catch((error: unknown) => setClipboardError(error instanceof Error ? error.message : "Image upload failed."))
          .finally(() => setClipboardUpload("idle"));
        return true;
      },
      handleDoubleClick: (view, position) => {
        const resolved = view.state.doc.resolve(position);
        const textblock = resolved.parent;
        if (!textblock.isTextblock || !textblock.textContent) return false;

        let offset = resolved.parentOffset;
        if (offset >= textblock.textContent.length) offset = textblock.textContent.length - 1;
        if (/\s/.test(textblock.textContent[offset]) && offset > 0) offset -= 1;
        let start = offset;
        let end = offset + 1;
        while (start > 0 && !/\s/.test(textblock.textContent[start - 1])) start -= 1;
        while (end < textblock.textContent.length && !/\s/.test(textblock.textContent[end])) end += 1;

        view.dispatch(view.state.tr.setSelection(TextSelection.create(
          view.state.doc,
          resolved.start() + start,
          resolved.start() + end,
        )));
        return true;
      },
    },
    onUpdate: ({ editor: activeEditor }) => {
      setActiveHeadingLevel(getActiveHeadingLevel(activeEditor));
      setActiveTextColor(getActiveTextColor(activeEditor));
      if (readOnlyRef.current) return;
      if (changeTimer.current !== null)
        window.clearTimeout(changeTimer.current);
      const publishChange = () => {
        const markdown = activeEditor.getMarkdown();
        setDisplayValue(markdown);
        onChangeRef.current(markdown);
        changeTimer.current = null;
      };
      if(changeDebounceMs<=0)publishChange();
      else changeTimer.current = window.setTimeout(publishChange,changeDebounceMs);
      if (detectionTimer.current !== null)
        window.clearTimeout(detectionTimer.current);
      detectionTimer.current = window.setTimeout(() => {
        const changes: Array<{ pos: number; language: string }> = [];
        activeEditor.state.doc.descendants((node, pos) => {
          if (node.type.name !== "codeBlock" || node.attrs.language) return;
          const language = detectCodeLanguage(node.textContent);
          if (language) changes.push({ pos, language });
        });
        if (changes.length) {
          const transaction = activeEditor.state.tr;
          for (const change of changes) {
            const node = transaction.doc.nodeAt(change.pos);
            if (node)
              transaction.setNodeMarkup(change.pos, undefined, {
                ...node.attrs,
                language: change.language,
              });
          }
          activeEditor.view.dispatch(transaction);
        }
        detectionTimer.current = null;
      }, CODE_DETECTION_DEBOUNCE_MS);
    },
    onSelectionUpdate: ({ editor: activeEditor }) => {
      setActiveHeadingLevel(getActiveHeadingLevel(activeEditor));
      setActiveTextColor(getActiveTextColor(activeEditor));
      if (!nativeColorPickerActiveRef.current) setBubbleColorMenu(false);
    },
    onTransaction: ({ editor: activeEditor }) => {
      setActiveHeadingLevel(getActiveHeadingLevel(activeEditor));
      setActiveTextColor(getActiveTextColor(activeEditor));
    },
  });

  useImperativeHandle(
    ref,
    () => ({ getMarkdown: () => editor?.getMarkdown() ?? displayValue }),
    [editor, displayValue],
  );

  useEffect(() => {
    const normalizedValue = normalizeLegacyMarkdown(value || "");
    if (!editor || editor.getMarkdown() === normalizedValue) return;
    editor.commands.setContent(normalizedValue, {
      contentType: "markdown",
      emitUpdate: false,
    });
    setDisplayValue(value);
  }, [editor, value]);

  useEffect(()=>{editor?.setEditable(!readOnly)},[editor,readOnly]);

  useEffect(() => {
    if (editor) {
      setActiveHeadingLevel(getActiveHeadingLevel(editor));
      setActiveTextColor(getActiveTextColor(editor));
    }
  }, [editor]);

  useEffect(() => {
    if (!colorMenu) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!colorPickerRef.current?.contains(event.target as Node)) setColorMenu(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setColorMenu(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer, true);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [colorMenu]);

  useEffect(() => {
    bubbleColorOpenRef.current = bubbleColorMenu;
  }, [bubbleColorMenu]);

  useEffect(() => () => {
    if (colorPickerReleaseTimer.current !== null) window.clearTimeout(colorPickerReleaseTimer.current);
  }, []);

  useEffect(
    () => () => {
      if (changeTimer.current !== null)
        window.clearTimeout(changeTimer.current);
      if (detectionTimer.current !== null)
        window.clearTimeout(detectionTimer.current);
    },
    [],
  );

  const wordCount = countMarkdownWords(displayValue);
  useEffect(() => {
    if (wordCount > WORD_LIMIT && !limitDismissed.current)
      setShowLimitWarning(true);
    if (wordCount <= WORD_LIMIT) {
      limitDismissed.current = false;
      setShowLimitWarning(false);
    }
  }, [wordCount]);

  if (!editor)
    return <div className="knowledge-editor-loading">Loading visual editor...</div>;

  const setLink = () => {
    const currentUrl = editor.getAttributes("link").href || "https://";
    const enteredUrl = window.prompt("Link URL (http/https)", currentUrl);
    if (enteredUrl === null) return;
    if (!enteredUrl.trim()) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    const url = safeHttpUrl(enteredUrl.trim());
    if (!url) {
      window.alert("Please enter a valid http or https URL.");
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  const insertImage = () => {
    const url = safeHttpUrl(imageUrl.trim());
    if (!url) {
      setImageError("Use a valid http or https image URL.");
      return;
    }
    editor.chain().focus().setImage({ src: url, alt: imageAlt.trim().slice(0, 255) }).run();
    setImageUrl("");
    setImageAlt("");
    setImageError("");
    setImageMenu(false);
  };

  const toggleItalicDirectly = () => {
    const { state, view } = editor;
    const italic = state.schema.marks.italic;
    if (!italic) return;
    const { from, to, empty, $from } = state.selection;
    const currentMarks = state.storedMarks ?? $from.marks();
    const active = Boolean(italic.isInSet(currentMarks)) || (!empty && state.doc.rangeHasMark(from, to, italic));
    const transaction = state.tr;
    if (empty) {
      if (active) transaction.removeStoredMark(italic);
      else transaction.addStoredMark(italic.create());
    } else if (active) {
      transaction.removeMark(from, to, italic);
    } else {
      transaction.addMark(from, to, italic.create());
    }
    view.dispatch(transaction.scrollIntoView());
    view.focus();
  };

  const applySelectedCode = () => {
    const { $from, $to } = editor.state.selection;
    const selectsCompleteBlocks =
      $from.parent.isTextblock &&
      $to.parent.isTextblock &&
      $from.parentOffset === 0 &&
      $to.parentOffset === $to.parent.content.size;
    const chain = editor.chain().focus();
    if (selectsCompleteBlocks) chain.toggleCodeBlock().run();
    else chain.toggleCode().run();
  };

  return (
    <div className={`knowledge-editor-shell tiptap-knowledge-editor${compact?" is-compact":""}${readOnly?" is-readonly":""}`}>
      <div className="tiptap-knowledge-toolbar" role="toolbar" aria-label="Text formatting">
        <div className="selection-heading-picker">
          <button
            type="button"
            title={activeHeadingLevel ? `Heading ${activeHeadingLevel}` : "Paragraph / heading"}
            aria-label={activeHeadingLevel ? `Heading ${activeHeadingLevel}` : "Paragraph / heading"}
            className={activeHeadingLevel ? "active" : ""}
            onClick={() => setHeadingMenu((open) => !open)}
          >
            <Heading size={16} />
            <span>{activeHeadingLevel ? `H${activeHeadingLevel}` : "Text"}</span>
          </button>
          {headingMenu && (
            <div className="selection-heading-options">
              {[1, 2, 3].map((level) => (
                <button
                  type="button"
                  key={level}
                  onClick={() => {
                    editor.chain().focus().toggleHeading({ level: level as 1 | 2 | 3 }).run();
                    setHeadingMenu(false);
                  }}
                >H{level}</button>
              ))}
              <button type="button" onClick={() => { editor.chain().focus().setParagraph().run(); setHeadingMenu(false); }}>Paragraph</button>
            </div>
          )}
        </div>
        <span className="tiptap-toolbar-separator" />
        <button type="button" title="Undo" aria-label="Undo" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}><Undo2 size={16} /></button>
        <button type="button" title="Redo" aria-label="Redo" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}><Redo2 size={16} /></button>
        <span className="tiptap-toolbar-separator" />
        <button type="button" title="Bold" aria-label="Bold" className={editor.isActive("bold") ? "active" : ""} onClick={() => editor.chain().focus().toggleBold().run()}><Bold size={16} /></button>
        <button type="button" title="Italic" aria-label="Italic" className={editor.isActive("italic") ? "active" : ""} onMouseDown={(event) => event.preventDefault()} onClick={toggleItalicDirectly}><Italic size={16} /></button>
        <button type="button" title="Underline" aria-label="Underline" className={editor.isActive("underline") ? "active" : ""} onClick={() => editor.chain().focus().toggleUnderline().run()}><UnderlineIcon size={16} /></button>
        <button type="button" title="Clear formatting" aria-label="Clear formatting" onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}><Eraser size={16} /></button>
        <span className="tiptap-toolbar-separator" />
        <button type="button" title="Bullet list" aria-label="Bullet list" className={editor.isActive("bulletList") ? "active" : ""} onClick={() => editor.chain().focus().toggleBulletList().run()}><List size={16} /></button>
        <button type="button" title="Numbered list" aria-label="Numbered list" className={editor.isActive("orderedList") ? "active" : ""} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered size={16} /></button>
        <button type="button" title="Checklist" aria-label="Checklist" className={editor.isActive("taskList") ? "active" : ""} onClick={() => editor.chain().focus().toggleTaskList().run()}><ListChecks size={16} /></button>
        <button type="button" title="Blockquote" aria-label="Blockquote" className={editor.isActive("blockquote") ? "active" : ""} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote size={16} /></button>
        <button type="button" title="Horizontal line" aria-label="Horizontal line" onClick={() => editor.chain().focus().setHorizontalRule().run()}><Minus size={16} /></button>
        <button type="button" title="Link" aria-label="Link" className={editor.isActive("link") ? "active" : ""} onClick={setLink}><Link2 size={16} /></button>
        <div className="tiptap-table-picker">
          <button type="button" title="Table" aria-label="Insert table" onClick={() => setTableMenu((open) => !open)}><Table2 size={16} /></button>
          {tableMenu && (
            <div className="tiptap-table-options">
              <strong>{tableSize.rows} × {tableSize.cols} table</strong>
              <div className="tiptap-table-grid" role="grid" aria-label="Choose table size">
                {Array.from({ length: 8 }, (_, row) =>
                  Array.from({ length: 8 }, (_, col) => (
                    <button
                      type="button"
                      key={`${row}-${col}`}
                      role="gridcell"
                      aria-label={`${row + 1} rows by ${col + 1} columns`}
                      className={row < tableSize.rows && col < tableSize.cols ? "selected" : ""}
                      onMouseEnter={() => setTableSize({ rows: row + 1, cols: col + 1 })}
                      onFocus={() => setTableSize({ rows: row + 1, cols: col + 1 })}
                      onClick={() => {
                        editor.chain().focus().insertTable({ rows: row + 1, cols: col + 1, withHeaderRow: false }).run();
                        setTableMenu(false);
                      }}
                    />
                  )),
                )}
              </div>
              <small>Move over the grid, then click to insert</small>
            </div>
          )}
        </div>
        <div className="tiptap-image-picker">
          <button type="button" title="Image" aria-label="Insert image" onClick={() => { setImageMenu((open) => !open); setImageError(""); }}><ImagePlus size={16} /></button>
          {imageMenu && (
            <div className="tiptap-image-options">
              <strong>Insert image</strong>
              <input type="url" value={imageUrl} maxLength={2048} placeholder="https://example.com/image.jpg" aria-label="Image URL" onChange={(event) => setImageUrl(event.target.value)} />
              <input type="text" value={imageAlt} maxLength={255} placeholder="Alternative text" aria-label="Image alternative text" onChange={(event) => setImageAlt(event.target.value)} />
              {imageError && <small>{imageError}</small>}
              <div><button type="button" onClick={() => setImageMenu(false)}>Cancel</button><button type="button" className="insert-image" onClick={insertImage}>Insert</button></div>
            </div>
          )}
        </div>
        <select
          aria-label="Insert code block language"
          defaultValue=""
          onChange={(event) => {
            editor.chain().focus().setCodeBlock({ language: event.target.value }).run();
            event.target.value = "";
          }}
        >
          <option value="" disabled>⌨ Code</option>
          {CODE_LANGUAGES.map(([language, label]) => (
            <option value={language} key={language}>{label}</option>
          ))}
        </select>
        <div ref={colorPickerRef} className="tiptap-color-picker">
          <button
            type="button"
            className={`tiptap-color-control${colorMenu ? " active" : ""}`}
            title="Text color"
            aria-label="Text color"
            aria-expanded={colorMenu}
            onClick={() => setColorMenu((open) => !open)}
          >
            A
            <span className="tiptap-color-swatch" style={{ backgroundColor: activeTextColor || "#285e43" }} />
          </button>
          {colorMenu && (
            <div className="tiptap-color-options" role="dialog" aria-label="Text color palette">
              <div className="tiptap-color-grid">
                {TEXT_COLOR_PALETTE.map(([color, label]) => (
                  <button
                    type="button"
                    key={color}
                    className={activeTextColor === color ? "selected" : ""}
                    style={{ backgroundColor: color }}
                    title={label}
                    aria-label={label}
                    onClick={() => {
                      editor.chain().focus().setColor(color).run();
                      setColorMenu(false);
                    }}
                  />
                ))}
              </div>
              <div className="tiptap-color-actions">
                <button type="button" title="Clear text color" aria-label="Clear text color" onClick={() => { editor.chain().focus().unsetColor().run(); setColorMenu(false); }}><Eraser size={15} /></button>
                <button type="button" title="Custom text color" aria-label="Custom text color" className="custom-color-trigger" onMouseDown={(event) => event.stopPropagation()}>
                  <FlaskConical size={16} aria-hidden="true" />
                  <input
                    type="color"
                    value={activeTextColor || "#285e43"}
                    onMouseDown={(event) => {
                      event.stopPropagation();
                      nativeColorPickerActiveRef.current = true;
                      if (colorPickerReleaseTimer.current !== null) window.clearTimeout(colorPickerReleaseTimer.current);
                      const { from, to } = editor.state.selection;
                      bubbleSelectionRef.current = { from, to };
                    }}
                    onChange={(event) => {
                      const selection = bubbleSelectionRef.current;
                      const chain = editor.chain();
                      if (selection) chain.setTextSelection(selection);
                      chain.focus().setColor(event.target.value).run();
                      if (colorPickerReleaseTimer.current !== null) window.clearTimeout(colorPickerReleaseTimer.current);
                      colorPickerReleaseTimer.current = window.setTimeout(() => { nativeColorPickerActiveRef.current = false; }, 500);
                    }}
                  />
                </button>
              </div>
              <button type="button" className="tiptap-color-confirm" onClick={() => setColorMenu(false)}><Check size={13} /> OK</button>
            </div>
          )}
        </div>
      </div>

      <BubbleMenu
        editor={editor}
        pluginKey="textBubbleMenu"
        className="tiptap-text-bubble"
        options={{ placement: "top", strategy: "fixed" }}
        shouldShow={({ editor: activeEditor }) => {
          const selection = activeEditor.state.selection;
          const colorPickerIsOpen = bubbleColorOpenRef.current && bubbleSelectionRef.current !== null;
          return selection instanceof TextSelection && (colorPickerIsOpen || !selection.empty) && !activeEditor.isActive("table");
        }}
      >
        <div className="tiptap-bubble-menu">
          <button type="button" onClick={() => editor.chain().focus().toggleBold().run()}><b>B</b></button>
          <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()}><i>I</i></button>
          <button type="button" onClick={() => editor.chain().focus().toggleUnderline().run()}><u>U</u></button>
          <button type="button" title="Inline code / code block" aria-label="Inline code or code block" className={editor.isActive("code") || editor.isActive("codeBlock") ? "active" : ""} onMouseDown={(event) => event.preventDefault()} onClick={applySelectedCode}><Code2 size={16} /></button>
          <div className="tiptap-bubble-color-picker">
            <button
              type="button"
              className={bubbleColorMenu ? "active" : ""}
              title="Text color"
              aria-label="Text color"
              aria-expanded={bubbleColorMenu}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setBubbleColorMenu((open) => !open)}
            >
              A
              <span style={{ backgroundColor: activeTextColor || "#285e43" }} />
            </button>
            {bubbleColorMenu && (
              <div className="tiptap-bubble-color-options" role="dialog" aria-label="Text color palette">
                <div className="tiptap-color-grid">
                  {TEXT_COLOR_PALETTE.map(([color, label]) => (
                    <button
                      type="button"
                      key={color}
                      className={activeTextColor === color ? "selected" : ""}
                      style={{ backgroundColor: color }}
                      title={label}
                      aria-label={label}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => { editor.chain().focus().setColor(color).run(); setBubbleColorMenu(false); }}
                    />
                  ))}
                </div>
                <div className="tiptap-color-actions">
                  <button type="button" title="Clear text color" aria-label="Clear text color" onMouseDown={(event) => event.preventDefault()} onClick={() => { editor.chain().focus().unsetColor().run(); setBubbleColorMenu(false); }}><Eraser size={15} /></button>
                  <button type="button" title="Custom text color" aria-label="Custom text color" className="custom-color-trigger" onMouseDown={(event) => event.stopPropagation()}>
                    <FlaskConical size={16} aria-hidden="true" />
                    <input
                      type="color"
                      value={activeTextColor || "#285e43"}
                      onMouseDown={(event) => {
                        event.stopPropagation();
                        nativeColorPickerActiveRef.current = true;
                        if (colorPickerReleaseTimer.current !== null) window.clearTimeout(colorPickerReleaseTimer.current);
                        const { from, to } = editor.state.selection;
                        bubbleSelectionRef.current = { from, to };
                      }}
                      onChange={(event) => {
                        const selection = bubbleSelectionRef.current;
                        const chain = editor.chain();
                        if (selection) chain.setTextSelection(selection);
                        chain.focus().setColor(event.target.value).run();
                        if (colorPickerReleaseTimer.current !== null) window.clearTimeout(colorPickerReleaseTimer.current);
                        colorPickerReleaseTimer.current = window.setTimeout(() => { nativeColorPickerActiveRef.current = false; }, 500);
                      }}
                    />
                  </button>
                </div>
                <button type="button" className="tiptap-color-confirm" onMouseDown={(event) => event.preventDefault()} onClick={() => setBubbleColorMenu(false)}><Check size={13} /> OK</button>
              </div>
            )}
          </div>
        </div>
      </BubbleMenu>

      <BubbleMenu
        editor={editor}
        pluginKey="tableBubbleMenu"
        className="tiptap-table-bubble"
        options={{ placement: "top", strategy: "fixed" }}
        shouldShow={({ editor: activeEditor }) => activeEditor.isActive("table")}
      >
        <div className="tiptap-table-menu" role="toolbar" aria-label="Table tools" onMouseDown={(event) => event.preventDefault()}>
          <div>
            <span>Rows</span>
            <button type="button" title="Add row above" onClick={() => editor.chain().focus().addRowBefore().run()}>↑+</button>
            <button type="button" title="Add row below" onClick={() => editor.chain().focus().addRowAfter().run()}>↓+</button>
            <button type="button" className="danger" title="Delete selected row or rows" disabled={!editor.can().deleteRow()} onClick={() => editor.chain().focus().deleteRow().run()}>−</button>
          </div>
          <div>
            <span>Columns</span>
            <button type="button" title="Add column left" onClick={() => editor.chain().focus().addColumnBefore().run()}>←+</button>
            <button type="button" title="Add column right" onClick={() => editor.chain().focus().addColumnAfter().run()}>→+</button>
            <button type="button" className="danger" title="Delete selected column or columns" disabled={!editor.can().deleteColumn()} onClick={() => editor.chain().focus().deleteColumn().run()}>−</button>
          </div>
          <div>
            <span>Cells</span>
            <button type="button" title="Merge selected cells" disabled={!editor.can().mergeCells()} onClick={() => editor.chain().focus().mergeCells().run()}>Merge</button>
            <button type="button" title="Split merged cell" disabled={!editor.can().splitCell()} onClick={() => editor.chain().focus().splitCell().run()}>Split</button>
            <button type="button" title="Automatically merge a selection or split the active merged cell" disabled={!editor.can().mergeOrSplit()} onClick={() => editor.chain().focus().mergeOrSplit().run()}>Auto</button>
          </div>
          <button type="button" className="delete-table" title="Delete table" onClick={() => editor.chain().focus().deleteTable().run()}>Delete table</button>
        </div>
      </BubbleMenu>

      <EditorContent editor={editor} className="knowledge-tiptap-host" />

      {(clipboardUpload === "uploading" || clipboardError) && (
        <div className={`knowledge-image-upload-status ${clipboardError ? "error" : ""}`} role="status">
          {clipboardError || "Uploading clipboard image…"}
        </div>
      )}

      {showLimitWarning && (
        <div className="knowledge-word-limit-backdrop">
          <section className="knowledge-word-limit-dialog" role="dialog" aria-modal="true">
            <span>Editor performance</span>
            <h3>This Knowledge is over 50,000 words</h3>
            <p>Large documents may become slower. Consider maintaining the content externally and linking it as a resource.</p>
            <div>
              <button type="button" onClick={() => { limitDismissed.current = true; setShowLimitWarning(false); }}>Keep editing</button>
              <button type="button" className="use-external" onClick={() => { setShowLimitWarning(false); onRecommendExternal?.(); }}>Use External Resource</button>
            </div>
          </section>
        </div>
      )}

    </div>
  );
});
