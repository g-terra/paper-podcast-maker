import { extractText, getDocumentProxy } from 'unpdf';

/** Extracts plain text from a PDF, with light cleanup of extraction artifacts. */
export async function extractPdfText(data: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(data);
  const { text } = await extractText(pdf, { mergePages: true });
  return cleanText(text);
}

export function cleanText(text: string): string {
  return (
    text
      // Re-join words hyphenated across line breaks: "trans-\nformer" -> "transformer".
      .replace(/(\w)-\n(\w)/g, '$1$2')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}
