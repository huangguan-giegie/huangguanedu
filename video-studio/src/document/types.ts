export type DocumentKind = "text" | "image" | "doc" | "docx" | "pdf";

export interface DocumentAsset {
  kind: "image" | "attachment";
  path: string;
  mimeType: string;
  dataUrl?: string;
}

export interface DocumentPage {
  pageNumber: number;
  text: string;
  assets: DocumentAsset[];
}

export interface DocumentSource {
  id: string;
  path: string;
  extension: string;
  kind: DocumentKind;
  pages: DocumentPage[];
  assets: DocumentAsset[];
}
