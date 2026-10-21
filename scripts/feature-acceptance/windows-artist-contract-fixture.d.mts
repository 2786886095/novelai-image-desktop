import type {Buffer} from 'node:buffer';
import type {WindowsArtistBindings, WindowsArtistControllerHash} from './windows-artist-contract.mjs';

/** UNIT ONLY: this fixture is never actual native acceptance or formal import input. */
export interface WindowsArtistUnitFixture {
  unitOnly: true;
  proof: unknown;
  bindings: WindowsArtistBindings & {controllerHashes: WindowsArtistControllerHash[]};
  artifactBytes: Record<string, Buffer | string>;
}
export function createWindowsArtistUnitProof(options?: {profileSha256?: string}): WindowsArtistUnitFixture;
