import { SealClient, SessionKey } from '@mysten/seal';
import type { SuiClient } from '@mysten/sui/client';
import type { Signer } from './walmarket-client.js';

export interface SealAccessConfig {
  keyServerUrls: string[];
  walrusPublisherUrl: string;
  walrusAggregatorUrl: string;
  suiClient: SuiClient;
  packageId: string;
}

// Policy move module: approve if renter's address owns a RentAccess with matching accessId
// The access policy is encoded as an allowlist tied to renter's Sui address
// and validated by the Seal key servers using the on-chain RentAccess object.

export class SealAccess {
  private readonly config: SealAccessConfig;
  private readonly seal: SealClient;

  constructor(config: SealAccessConfig) {
    this.config = config;
    this.seal = new SealClient({
      suiClient: config.suiClient,
      serverConfigs: config.keyServerUrls.map(objectId => ({ objectId, weight: 1 })),
      verifyKeyServers: false,
    });
  }

  async encryptDelegateKey(
    privateKeyBytes: Uint8Array,
    renterAddress: string,
    accessId: string,
    expiresAtEpoch: number,
  ): Promise<string> {
    // Build the ID for the Seal encryption: tied to accessId so only the holder of
    // the RentAccess object can decrypt (enforced by the Move seal_approve function).
    const id = this.buildId(accessId);
    const threshold = Math.ceil(this.config.keyServerUrls.length / 2);

    const { encryptedObject } = await this.seal.encrypt({
      threshold,
      packageId: this.config.packageId,
      id,
      data: privateKeyBytes,
    });

    return this.storeOnWalrus(encryptedObject, expiresAtEpoch);
  }

  // Decrypts a rental delegate key for the renter. `signer` is the renter's connected
  // wallet (used to authorize the ephemeral Seal session key) and `approvalTxBytes`
  // are the BCS bytes of a transaction whose Move call lets the key servers verify
  // the renter's on-chain RentAccess object before releasing key shares.
  async decryptDelegateKey(blobId: string, signer: Signer, approvalTxBytes: Uint8Array): Promise<Uint8Array> {
    const blob = await this.fetchFromWalrus(blobId);

    const sessionKey = await SessionKey.create({
      address: signer.toSuiAddress(),
      packageId: this.config.packageId,
      ttlMin: 30,
      suiClient: this.config.suiClient,
    });
    const { signature } = await signer.signPersonalMessage(sessionKey.getPersonalMessage());
    await sessionKey.setPersonalMessageSignature(signature);

    return this.seal.decrypt({ data: blob, sessionKey, txBytes: approvalTxBytes });
  }

  // Must produce the exact bytes the Move seal_approve checks: `id ==
  // object::id_to_bytes(&object::id(access))` — the bare 32-byte RentAccess object
  // ID, not a string-prefixed encoding. Sui object IDs print as `0x`+64 hex chars;
  // stripping the prefix yields exactly those 32 raw bytes hex-encoded.
  private buildId(accessId: string): string {
    return accessId.startsWith('0x') ? accessId.slice(2) : accessId;
  }

  // Storage duration for the encrypted-delegate-key blob. This only needs to survive
  // long enough for the recipient (renter or buyer) to fetch, decrypt, and save their
  // key once — not for the lifetime of the access grant itself (which lives on-chain
  // in RentAccess.expires_at, separately). Capping avoids an absurd epoch count for
  // permanent purchases, whose expires_at is the u64::MAX sentinel — `expiresAtEpoch
  // - Date.now()` there is ~1.8e19 ms, many orders of magnitude past any real rental's
  // (≤720h ≈ 2.6e9 ms), so the cap only ever engages for that sentinel.
  private async storeOnWalrus(data: Uint8Array, expiresAtEpoch: number): Promise<string> {
    const MAX_STORAGE_EPOCHS = 30;
    const epochs = Math.min(MAX_STORAGE_EPOCHS, Math.max(1, Math.ceil((expiresAtEpoch - Date.now()) / (24 * 60 * 60 * 1000 * 2))));
    const url = `${this.config.walrusPublisherUrl}/v1/blobs?epochs=${epochs}`;

    const response = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream' },
      // Uint8Array<ArrayBufferLike> vs. lib.dom's BodyInit is a known TS/Node-types
      // friction point; fetch accepts Uint8Array as a body at runtime everywhere.
      body: data as unknown as BodyInit,
    });

    if (!response.ok) {
      throw new Error(`Walrus PUT failed: ${response.status} ${response.statusText}`);
    }

    const json = (await response.json()) as { newlyCreated?: { blobObject?: { blobId: string } } };
    const blobId = json.newlyCreated?.blobObject?.blobId;
    if (!blobId) throw new Error('No blobId in Walrus response');
    return blobId;
  }

  private async fetchFromWalrus(blobId: string): Promise<Uint8Array> {
    const url = `${this.config.walrusAggregatorUrl}/v1/${blobId}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Walrus GET failed: ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
  }
}
