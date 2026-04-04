export interface ChunkResult { content: string; index: number; }

export function chunkText(content: string, fileType: string, chunkSize = 800, chunkOverlap = 200): ChunkResult[] {
  if (!content.trim()) return [];
  if (fileType === 'csv') return chunkCsv(content, chunkSize);
  return chunkParagraphs(content, chunkSize, chunkOverlap);
}

function chunkParagraphs(content: string, chunkSize: number, overlap: number): ChunkResult[] {
  const paragraphs = content.split(/\n\n+/).filter(p => p.trim());
  if (paragraphs.length === 0) return [];
  const chunks: ChunkResult[] = [];
  let current = '';
  let chunkIndex = 0;
  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;
    if (current && current.length + trimmed.length + 2 > chunkSize) {
      chunks.push({ content: current.trim(), index: chunkIndex++ });
      if (overlap > 0 && current.length > overlap) {
        current = current.slice(-overlap);
      } else if (overlap <= 0) {
        current = '';
      }
    }
    current += (current ? '\n\n' : '') + trimmed;
  }
  if (current.trim()) chunks.push({ content: current.trim(), index: chunkIndex });
  return chunks;
}

function chunkCsv(content: string, chunkSize: number): ChunkResult[] {
  const lines = content.split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return [];
  const header = lines[0];
  const dataRows = lines.slice(1);
  if (dataRows.length === 0) return [{ content: header, index: 0 }];
  const chunks: ChunkResult[] = [];
  let currentRows: string[] = [];
  let currentLength = header.length;
  let chunkIndex = 0;
  for (const row of dataRows) {
    if (currentRows.length > 0 && currentLength + row.length + 1 > chunkSize) {
      chunks.push({ content: header + '\n' + currentRows.join('\n'), index: chunkIndex++ });
      currentRows = [];
      currentLength = header.length;
    }
    currentRows.push(row);
    currentLength += row.length + 1;
  }
  if (currentRows.length > 0) {
    chunks.push({ content: header + '\n' + currentRows.join('\n'), index: chunkIndex });
  }
  return chunks;
}

export async function extractTextFromDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const { extractText } = await import('unpdf');
  const data = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const { text } = await extractText(data, { mergePages: true });
  return text;
}
