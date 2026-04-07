declare module "pdf-parse" {
  interface PDFParseOptions {
    data: Buffer | Uint8Array;
    verbosity?: number;
  }

  interface PDFInfo {
    [key: string]: unknown;
  }

  class PDFParse {
    constructor(options: PDFParseOptions);
    getText(): Promise<string>;
    getInfo(): Promise<PDFInfo>;
    destroy(): void;
  }

  export { PDFParse };
}
