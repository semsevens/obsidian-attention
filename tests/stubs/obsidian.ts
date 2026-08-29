// Enough of the Obsidian API for the store to run under vitest.
// Aliased in place of the real module by vitest.config.ts.

export class TFile {
  constructor(public path: string) {}
}

export class Notice {
  constructor(public message: string) {}
}

export interface App {
  vault: {
    getAbstractFileByPath(path: string): TFile | null;
    read(file: TFile): Promise<string>;
    cachedRead(file: TFile): Promise<string>;
    modify(file: TFile, data: string): Promise<void>;
    create(path: string, data: string): Promise<TFile>;
    getFiles(): TFile[];
  };
  fileManager: {
    trashFile(file: TFile): Promise<void>;
  };
}
