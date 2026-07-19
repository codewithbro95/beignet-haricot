import DOMPurify from "dompurify";
import { marked } from "marked";

export function Markdown({ children }: { children: string }) {
  const html = DOMPurify.sanitize(marked.parse(children, { async: false }), {
    USE_PROFILES: { html: true },
  });

  return <div class="markdown" dangerouslySetInnerHTML={{ __html: html }} />;
}
