import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Bold, Italic, List, ListOrdered } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  /** Initial HTML; when `remountKey` changes, editor reloads from this value. */
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  /** Bump when a new template is loaded from the server so the editor picks it up. */
  remountKey: string | number;
  className?: string;
  /** Tailwind max-height class for the scroll area (default: max-h-[280px]). */
  contentMaxHeightClass?: string;
};

/**
 * Minimal WYSIWYG for non-technical users. Still outputs HTML for email delivery.
 */
export function SimpleEmailBodyEditor({
  value,
  onChange,
  placeholder,
  remountKey,
  className,
  contentMaxHeightClass = "max-h-[280px]",
}: Props) {
  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          heading: false,
          codeBlock: false,
          horizontalRule: false,
        }),
        Placeholder.configure({
          placeholder: placeholder ?? "Write your email here…",
        }),
      ],
      content: value?.trim() ? value : "<p></p>",
      editorProps: {
        attributes: {
          class: "tiptap-email-prose focus:outline-none",
        },
      },
      onUpdate: ({ editor: ed }) => {
        onChange(ed.getHTML());
      },
    },
    [remountKey],
  );

  if (!editor) {
    return <div className={cn("min-h-[200px] rounded-md border border-input bg-muted/40 animate-pulse", className)} />;
  }

  return (
    <div className={cn("rounded-md border border-input bg-background overflow-hidden", className)}>
      <div className="flex flex-wrap gap-0.5 border-b border-border bg-muted/40 px-2 py-1.5">
        <Button
          type="button"
          variant={editor.isActive("bold") ? "secondary" : "ghost"}
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => editor.chain().focus().toggleBold().run()}
          aria-label="Bold"
        >
          <Bold className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant={editor.isActive("italic") ? "secondary" : "ghost"}
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          aria-label="Italic"
        >
          <Italic className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant={editor.isActive("bulletList") ? "secondary" : "ghost"}
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          aria-label="Bullet list"
        >
          <List className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant={editor.isActive("orderedList") ? "secondary" : "ghost"}
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          aria-label="Numbered list"
        >
          <ListOrdered className="h-4 w-4" />
        </Button>
      </div>
      <EditorContent
        editor={editor}
        className={cn("tiptap-email-editor overflow-y-auto", contentMaxHeightClass)}
      />
    </div>
  );
}
