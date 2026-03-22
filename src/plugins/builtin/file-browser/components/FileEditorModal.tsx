import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Save, X, FileText, Loader2, ShieldAlert } from 'lucide-react';
import { ThemeType } from '@/utils/types';
import { useT } from '../i18n';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, rectangularSelection, crosshairCursor, highlightSpecialChars } from '@codemirror/view';
import { EditorState, Extension } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { syntaxHighlighting, defaultHighlightStyle, indentOnInput, bracketMatching, foldGutter, foldKeymap, LanguageSupport } from '@codemirror/language';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { oneDark } from '@codemirror/theme-one-dark';


interface FileEditorModalProps {
  remotePath: string;
  initialContent: string;
  theme: ThemeType;
  onClose: () => void;
  onSave: (content: string) => Promise<void>;
  onSudoSave?: (content: string, password: string) => Promise<void>;
}

async function getLanguageExtension(filePath: string): Promise<LanguageSupport | null> {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  try {
    switch (ext) {
      case 'js':
        return (await import('@codemirror/lang-javascript')).javascript();
      case 'jsx':
        return (await import('@codemirror/lang-javascript')).javascript({ jsx: true });
      case 'ts':
        return (await import('@codemirror/lang-javascript')).javascript({ typescript: true });
      case 'tsx':
        return (await import('@codemirror/lang-javascript')).javascript({ jsx: true, typescript: true });
      case 'json': case 'json5':
        return (await import('@codemirror/lang-json')).json();
      case 'py': case 'pyw':
        return (await import('@codemirror/lang-python')).python();
      case 'html': case 'htm': case 'vue': case 'svelte':
        return (await import('@codemirror/lang-html')).html();
      case 'css': case 'scss': case 'less':
        return (await import('@codemirror/lang-css')).css();
      case 'xml': case 'svg': case 'xsl': case 'xsd': case 'plist':
        return (await import('@codemirror/lang-xml')).xml();
      case 'md': case 'markdown': case 'mdx':
        return (await import('@codemirror/lang-markdown')).markdown();
      case 'yaml': case 'yml':
        return (await import('@codemirror/lang-yaml')).yaml();
      case 'sql':
        return (await import('@codemirror/lang-sql')).sql();
      case 'java': case 'kt': case 'kts': case 'groovy': case 'gradle':
        return (await import('@codemirror/lang-java')).java();
      case 'c': case 'h': case 'cpp': case 'cc': case 'cxx': case 'hpp': case 'hh':
        return (await import('@codemirror/lang-cpp')).cpp();
      case 'php':
        return (await import('@codemirror/lang-php')).php();
      case 'rs':
        return (await import('@codemirror/lang-rust')).rust();
      case 'go':
        return (await import('@codemirror/lang-go')).go();
      case 'sh': case 'bash': case 'zsh':
      case 'conf': case 'ini': case 'toml':
      case 'env': case 'dockerfile':
        return (await import('@codemirror/lang-javascript')).javascript();
      default:
        return null;
    }
  } catch {
    return null;
  }
}

// Light theme styling
const lightTheme = EditorView.theme({
  '&': { backgroundColor: 'var(--bg-main)', color: 'var(--text-main)' },
  '.cm-gutters': { backgroundColor: 'var(--bg-tab)', color: 'var(--text-dim)', borderRight: '1px solid var(--border-color)' },
  '.cm-activeLineGutter': { backgroundColor: 'rgba(99,102,241,0.1)' },
  '.cm-activeLine': { backgroundColor: 'rgba(99,102,241,0.05)' },
  '.cm-selectionMatch': { backgroundColor: 'rgba(99,102,241,0.15)' },
  '.cm-cursor': { borderLeftColor: 'var(--primary)' },
  '&.cm-focused .cm-selectionBackground, ::selection': { backgroundColor: 'rgba(99,102,241,0.2)' },
});

export const FileEditorModal: React.FC<FileEditorModalProps> = ({
  remotePath, initialContent, theme, onClose, onSave, onSudoSave
}) => {
  const t = useT();
  const et = t.editor;
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const editorViewRef = useRef<EditorView | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');
  const [isModified, setIsModified] = useState(false);
  const [cursorInfo, setCursorInfo] = useState({ line: 1, col: 1 });
  const [sudoMode, setSudoMode] = useState(false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [sudoPassword, setSudoPassword] = useState('');

  const fileName = remotePath.split('/').pop() || remotePath;

  const doSave = useCallback(async (content: string, password?: string) => {
    setIsSaving(true);
    setSaveStatus('idle');
    try {
      if (password && onSudoSave) {
        await onSudoSave(content, password);
        setSaveStatus('saved');
      } else {
        await onSave(content);
        setSaveStatus('saved');
      }
      setIsModified(false);
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      // Error is handled by the parent
    } finally {
      setIsSaving(false);
    }
  }, [onSave, onSudoSave]);

  const handleSave = useCallback(async () => {
    if (!editorViewRef.current || isSaving) return;
    if (sudoMode && onSudoSave) {
      setShowPasswordDialog(true);
      return;
    }
    const content = editorViewRef.current.state.doc.toString();
    await doSave(content);
  }, [isSaving, sudoMode, onSudoSave, doSave]);

  const handlePasswordSubmit = useCallback(async () => {
    if (!editorViewRef.current || !sudoPassword.trim()) return;
    setShowPasswordDialog(false);
    const content = editorViewRef.current.state.doc.toString();
    await doSave(content, sudoPassword);
    setSudoPassword('');
  }, [sudoPassword, doSave]);

  const handlePasswordCancel = useCallback(() => {
    setShowPasswordDialog(false);
    setSudoPassword('');
  }, []);

  // Store handleSave in ref for stable access in CodeMirror keymap
  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;

  // Initialize CodeMirror
  useEffect(() => {
    if (!editorContainerRef.current) return;

    let cancelled = false;
    let view: EditorView | null = null;

    const initEditor = async () => {
      const langExt = await getLanguageExtension(remotePath);
      if (cancelled || !editorContainerRef.current) return;

      const extensions: Extension[] = [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        foldGutter(),
        drawSelection(),
        EditorState.allowMultipleSelections.of(true),
        indentOnInput(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        bracketMatching(),
        closeBrackets(),
        rectangularSelection(),
        crosshairCursor(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...searchKeymap,
          ...historyKeymap,
          ...foldKeymap,
          indentWithTab,
          { key: 'Mod-s', run: () => { handleSaveRef.current(); return true; } },
        ]),
        EditorView.updateListener.of(update => {
          if (update.docChanged) {
            setIsModified(true);
          }
          if (update.selectionSet || update.docChanged) {
            const pos = update.state.selection.main.head;
            const line = update.state.doc.lineAt(pos);
            setCursorInfo({ line: line.number, col: pos - line.from + 1 });
          }
        }),
        EditorView.lineWrapping,
        theme === 'dark' ? oneDark : lightTheme,
      ];
      if (langExt) extensions.push(langExt);

      const state = EditorState.create({ doc: initialContent, extensions });
      view = new EditorView({ state, parent: editorContainerRef.current });
      editorViewRef.current = view;

      // Focus the editor
      requestAnimationFrame(() => view?.focus());
    };

    initEditor();

    return () => {
      cancelled = true;
      if (view) {
        view.destroy();
        editorViewRef.current = null;
      }
    };
  }, [remotePath, initialContent, theme]);

  // Global Ctrl+S handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleSaveRef.current();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleClose = () => {
    if (isModified) {
      if (!window.confirm(et.unsavedChanges)) return;
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-5xl h-[85vh] bg-[var(--bg-card)] border rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col"
        style={{ borderColor: 'var(--border-color)' }}
      >
        {/* Title bar */}
        <div className="h-10 px-4 flex items-center justify-between border-b shrink-0" style={{ backgroundColor: 'var(--bg-tab)', borderColor: 'var(--border-color)' }}>
          <div className="flex gap-2 items-center">
            <div onClick={handleClose} className="w-3 h-3 rounded-full bg-[#ff5f56] hover:shadow-[0_0_8px_rgba(255,95,86,0.5)] cursor-pointer" />
            <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
            <div className="w-3 h-3 rounded-full bg-[#27c93f]" />
          </div>
          <div className="flex items-center gap-2">
            <FileText className="w-3.5 h-3.5 text-primary" />
            <span className="text-[11px] font-bold truncate max-w-[300px]" style={{ color: 'var(--text-main)' }}>
              {fileName}
              {isModified && <span className="text-primary ml-1">*</span>}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {onSudoSave && (
              <label className="flex items-center gap-1.5 cursor-pointer group select-none">
                <input
                  type="checkbox"
                  checked={sudoMode}
                  onChange={(e) => setSudoMode(e.target.checked)}
                  className="w-3 h-3 rounded border-white/20 bg-black/30 text-amber-500 focus:ring-amber-500/50 cursor-pointer"
                />
                <ShieldAlert className="w-3 h-3 text-amber-500/70 group-hover:text-amber-500 transition-colors" />
                <span className="text-[10px] group-hover:text-[var(--text-main)] transition-colors" style={{ color: 'var(--text-dim)' }}>
                  {et.sudoSave}
                </span>
              </label>
            )}
            <button
              onClick={handleSave}
              disabled={isSaving || !isModified}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
                isSaving
                  ? 'bg-primary/20 text-primary cursor-wait'
                  : !isModified
                    ? 'opacity-30 cursor-not-allowed text-[var(--text-dim)]'
                    : 'bg-primary hover:bg-primary/80 text-white shadow-lg shadow-primary/20 active:scale-95'
              }`}
            >
              {isSaving ? (
                <><Loader2 className="w-3 h-3 animate-spin" />{et.saving}</>
              ) : saveStatus === 'saved' ? (
                <>{et.saved}</>
              ) : (
                <><Save className="w-3 h-3" />{et.save}</>
              )}
            </button>
            <button
              onClick={handleClose}
              className="p-1 hover:bg-[var(--bg-tab)] rounded-lg transition"
              title={et.close}
            >
              <X className="w-3.5 h-3.5" style={{ color: 'var(--text-dim)' }} />
            </button>
          </div>
        </div>

        {/* Remote path bar */}
        <div className="px-4 py-1.5 border-b flex items-center gap-2 shrink-0" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-tab)' }}>
          <span className="text-[10px] font-mono truncate" style={{ color: 'var(--text-dim)' }}>
            {remotePath}
          </span>
        </div>

        {/* Editor area */}
        <div ref={editorContainerRef} className="flex-1 overflow-hidden [&_.cm-editor]:h-full [&_.cm-scroller]:!overflow-auto" />

        {/* Status bar */}
        <div className="h-6 px-4 flex items-center justify-between border-t shrink-0" style={{ backgroundColor: 'var(--bg-tab)', borderColor: 'var(--border-color)' }}>
          <div className="flex items-center gap-4">
            <span className="text-[10px] font-mono" style={{ color: 'var(--text-dim)' }}>
              {et.line} {cursorInfo.line}, {et.column} {cursorInfo.col}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {saveStatus === 'saved' && (
              <span className="text-[10px] font-bold text-emerald-500 animate-in fade-in duration-200">
                {sudoMode ? et.sudoSaveSuccess : et.saved}
              </span>
            )}
            <span className="text-[10px] font-mono uppercase" style={{ color: 'var(--text-dim)' }}>
              UTF-8
            </span>
          </div>
        </div>

        {/* Sudo password dialog */}
        {showPasswordDialog && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200 rounded-2xl">
            <div className="bg-[var(--bg-main)] border border-amber-500/30 rounded-2xl p-6 w-80 shadow-2xl shadow-amber-500/20 animate-in zoom-in-95 duration-200">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-amber-500/20 rounded-lg">
                  <ShieldAlert className="w-5 h-5 text-amber-400" />
                </div>
                <h3 className="text-base font-bold" style={{ color: 'var(--text-main)' }}>
                  {et.sudoPasswordTitle}
                </h3>
              </div>
              <input
                type="password"
                value={sudoPassword}
                onChange={(e) => setSudoPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); handlePasswordSubmit(); }
                  else if (e.key === 'Escape') { e.preventDefault(); handlePasswordCancel(); }
                }}
                placeholder={et.sudoPasswordPlaceholder}
                className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-amber-500/50 transition-all mb-4"
                style={{ color: 'var(--text-main)' }}
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={handlePasswordSubmit}
                  disabled={!sudoPassword.trim()}
                  className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-600/30 disabled:cursor-not-allowed text-white rounded-xl text-sm font-medium transition-all"
                >
                  {t.confirm}
                </button>
                <button
                  onClick={handlePasswordCancel}
                  className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 rounded-xl text-sm font-medium transition-all"
                  style={{ color: 'var(--text-main)' }}
                >
                  {t.cancel}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
