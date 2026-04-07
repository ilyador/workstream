import {
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  codeBlockPlugin,
  codeMirrorPlugin,
  CreateLink,
  diffSourcePlugin,
  DiffSourceToggleWrapper,
  headingsPlugin,
  InsertCodeBlock,
  InsertTable,
  linkDialogPlugin,
  linkPlugin,
  listsPlugin,
  ListsToggle,
  markdownShortcutPlugin,
  MDXEditor,
  quotePlugin,
  Separator,
  tablePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
  UndoRedo,
} from '@mdxeditor/editor';
import '@mdxeditor/editor/style.css';
import s from './FilePreview.module.css';

interface MarkdownArtifactEditorProps {
  markdown: string;
  onChange: (markdown: string) => void;
}

export function MarkdownArtifactEditor({ markdown, onChange }: MarkdownArtifactEditorProps) {
  return (
    <div className={s.markdownEditorShell}>
      <MDXEditor
        className={s.markdownEditor}
        contentEditableClassName={s.markdownEditorContent}
        markdown={markdown}
        onChange={(nextMarkdown, initialMarkdownNormalize) => {
          if (initialMarkdownNormalize) return;
          onChange(nextMarkdown);
        }}
        plugins={[
          headingsPlugin(),
          listsPlugin(),
          quotePlugin(),
          thematicBreakPlugin(),
          linkPlugin(),
          linkDialogPlugin(),
          tablePlugin(),
          codeBlockPlugin({ defaultCodeBlockLanguage: 'txt' }),
          codeMirrorPlugin({
            autoLoadLanguageSupport: false,
            codeBlockLanguages: {
              txt: 'Text',
              js: 'JavaScript',
              jsx: 'JSX',
              ts: 'TypeScript',
              tsx: 'TSX',
              css: 'CSS',
              html: 'HTML',
              json: 'JSON',
              md: 'Markdown',
              sh: 'Shell',
              bash: 'Bash',
              python: 'Python',
            },
          }),
          diffSourcePlugin({ viewMode: 'rich-text' }),
          markdownShortcutPlugin(),
          toolbarPlugin({
            toolbarContents: () => (
              <DiffSourceToggleWrapper>
                <UndoRedo />
                <Separator />
                <BlockTypeSelect />
                <BoldItalicUnderlineToggles />
                <ListsToggle />
                <Separator />
                <CreateLink />
                <InsertTable />
                <InsertCodeBlock />
              </DiffSourceToggleWrapper>
            ),
          }),
        ]}
      />
    </div>
  );
}
