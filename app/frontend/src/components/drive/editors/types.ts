import type { DriveSourceFile } from '../../../lib/api';
import type { DriveDocumentViewModel } from '../DriveDocumentView';

export interface DrivePatientContext {
  id: string;
  displayName: string;
  rutMasked: string;
}

export interface SourceWorkspaceDocument {
  kind: 'source';
  source: DriveSourceFile;
  content: string;
  baseline: string;
}

export type WorkspaceDocument =
  | SourceWorkspaceDocument
  | {
      kind: 'managed';
      document: DriveDocumentViewModel;
    };
