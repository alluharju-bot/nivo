import type { Project } from '../model/project';
export type CloudHead = {
  id: string;
  name: string;
  revision: number;
  hash: string;
  object_path: string;
  updated_at: string;
  parts: number;
};
export type CloudBinding = {
  scope: string;
  localId: string;
  remoteId: string;
  baseHash?: string;
  baseRevision?: number;
};
export interface CloudRemote {
  head(id: string): Promise<CloudHead | undefined>;
  list(): Promise<CloudHead[]>;
  read(head: CloudHead): Promise<Project>;
  write(
    project: Project,
    hash: string,
    expected: number | undefined,
  ): Promise<CloudHead | undefined>;
}
export type SyncResult =
  | { kind: 'synced'; head: CloudHead }
  | { kind: 'remote' | 'conflict'; head: CloudHead }
  | { kind: 'missing' }
  | { kind: 'disabled' | 'pending' };
