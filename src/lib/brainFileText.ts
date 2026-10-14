import * as pdfjs from 'pdfjs-dist';
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';

pdfjs.GlobalWorkerOptions.workerSrc = PdfWorker;

export async function brainFileText(file: File): Promise<string | null> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') {
    const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    try {
      const pages: string[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        pages.push(content.items.map(item => 'str' in item ? item.str : '').join(' '));
      }
      return pages.join('\n');
    } finally { await pdf.destroy(); }
  }
  if (ext === 'docx') {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const xml = await zip.file('word/document.xml')?.async('text');
    if (!xml) throw new Error('לא ניתן לקרוא את מסמך Word');
    return new DOMParser().parseFromString(xml, 'text/xml').documentElement.textContent ?? '';
  }
  if (ext === 'xlsx' || ext === 'xls') {
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    return workbook.SheetNames.map(name => `${name}\n${XLSX.utils.sheet_to_csv(workbook.Sheets[name])}`).join('\n\n');
  }
  if (file.type.startsWith('text/') || ['txt', 'csv', 'md', 'json'].includes(ext ?? '')) return file.text();
  if (['image/', 'video/', 'audio/'].some(type => file.type.startsWith(type))) return null;
  throw new Error('סוג הקובץ אינו נתמך. למסמכי Word יש להשתמש ב-DOCX');
}