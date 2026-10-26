import { useId, useRef, useState } from 'react';
import {
  Bold,
  Code,
  Heading2,
  ImageIcon,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Eye,
  Quote,
  Table,
} from 'lucide-react';
import { renderRichText } from '../lib/richText';

type WrapKind = 'wrap' | 'prefix' | 'insert';

interface ToolbarAction {
  label: string;
  kind: WrapKind;
  /** For `wrap`: the marker pair. For `prefix`/`insert`: the text inserted. */
  value: string;
  /** For `insert` only: what the inserted block replaces, if anything. */
  sample?: string;
  icon: typeof Bold;
}

const ACTIONS: ToolbarAction[] = [
  { label: 'Bold', kind: 'wrap', value: '**', icon: Bold },
  { label: 'Italic', kind: 'wrap', value: '*', icon: Italic },
  { label: 'Heading', kind: 'prefix', value: '## ', icon: Heading2 },
  { label: 'Bulleted list', kind: 'prefix', value: '- ', icon: List },
  { label: 'Numbered list', kind: 'prefix', value: '1. ', icon: ListOrdered },
  { label: 'Quote', kind: 'prefix', value: '> ', icon: Quote },
  {
    label: 'Table',
    kind: 'insert',
    value:
      '| Item | Value |\n| --- | --- |\n| Row 1 |  |\n| Row 2 |  |',
    icon: Table,
  },
  { label: 'Code block', kind: 'wrap', value: '```', icon: Code },
  { label: 'Link', kind: 'insert', value: '[link text](https://example.com)', icon: Link2 },
  { label: 'Image', kind: 'insert', value: '![describe the image](https://…)', icon: ImageIcon },
  { label: 'Divider', kind: 'insert', value: '---', icon: Minus },
];

/** Apply one toolbar action to the current value/selection. */
function applyAction(
  value: string,
  start: number,
  end: number,
  action: ToolbarAction,
): { value: string; caret: number } {
  const selected = value.slice(start, end);

  if (action.kind === 'wrap') {
    const marker = action.value;
    const middle = selected || 'text';
    const next = `${value.slice(0, start)}${marker}${middle}${marker}${value.slice(end)}`;
    return { value: next, caret: start + marker.length + middle.length + marker.length };
  }

  if (action.kind === 'prefix') {
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const lineEnd = value.indexOf('\n', end);
    const stop = lineEnd === -1 ? value.length : lineEnd;
    const block = value
      .slice(lineStart, stop)
      .split('\n')
      .map((line) => `${action.value}${line}`)
      .join('\n');
    const next = `${value.slice(0, lineStart)}${block}${value.slice(stop)}`;
    return { value: next, caret: lineStart + block.length };
  }

  // insert
  const next = `${value.slice(0, start)}${action.value}${value.slice(end)}`;
  return { value: next, caret: start + action.value.length };
}

/**
 * Plain-textarea editor with a markdown-lite formatting toolbar and a live
 * preview, used for reading passages (which may carry tables, headings, lists
 * and images that the question refers to). The stored value stays plain text —
 * `renderRichText` turns it into sanitised HTML everywhere it is displayed.
 */
export function RichTextEditor({
  value,
  onChange,
  rows = 6,
  placeholder,
  ariaLabel,
  testId,
}: {
  value: string;
  onChange: (next: string) => void;
  rows?: number;
  placeholder?: string;
  ariaLabel?: string;
  testId?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showPreview, setShowPreview] = useState(false);
  const previewId = useId();

  const run = (action: ToolbarAction) => {
    const el = textareaRef.current;
    if (!el) return;
    const result = applyAction(value, el.selectionStart, el.selectionEnd, action);
    onChange(result.value);
    // Keep focus and put the caret where the edit landed.
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(result.caret, result.caret);
    });
  };

  return (
    <div className="rte" data-testid={testId ? `${testId}-rte` : undefined}>
      <div className="rte-toolbar" role="toolbar" aria-label="Formatting">
        {ACTIONS.map((action) => (
          <button
            key={action.label}
            type="button"
            className="rte-button"
            title={action.label}
            aria-label={action.label}
            onClick={() => run(action)}
          >
            <action.icon size={14} />
          </button>
        ))}
        <button
          type="button"
          className={`rte-button rte-preview-toggle${showPreview ? ' is-active' : ''}`}
          aria-pressed={showPreview}
          onClick={() => setShowPreview((previous) => !previous)}
          data-testid={testId ? `${testId}-preview-toggle` : undefined}
        >
          <Eye size={14} /> {showPreview ? 'Edit' : 'Preview'}
        </button>
      </div>

      <textarea
        ref={textareaRef}
        className="rte-input"
        rows={rows}
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.value)}
        data-testid={testId}
      />

      {showPreview && (
        <div className="rte-preview" aria-live="polite">
          {value.trim() ? (
            <div
              className="passage-body passage-rich"
              dangerouslySetInnerHTML={{ __html: renderRichText(value) }}
            />
          ) : (
            <small className="text-muted">Nothing to preview yet.</small>
          )}
        </div>
      )}

      <small className="field-hint">
        Headings (#), bold (**text**), lists (- item), quotes (&gt;), tables (| a | b |) and
        links are supported.
      </small>
    </div>
  );
}
