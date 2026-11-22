import { constants, createCipheriv, createHash, publicEncrypt, randomBytes } from "node:crypto";
import { once } from "node:events";

const MAGIC = Buffer.from("TFBKUP02", "ascii");
const CHUNK_SIZE = 64 * 1024;
const TAG_BYTES = 16;

function nonceFor(prefix, index) {
  const nonce = Buffer.alloc(12);
  prefix.copy(nonce, 0);
  nonce.writeUInt32BE(index, 8);
  return nonce;
}

function frameHeader(index, final, cipherLength) {
  const header = Buffer.alloc(9);
  header.writeUInt32BE(index, 0);
  header.writeUInt8(final ? 1 : 0, 4);
  header.writeUInt32BE(cipherLength, 5);
  return header;
}

async function write(output, buffer) {
  if (!output.write(buffer)) await once(output, "drain");
}

function createEnvelope(publicKey) {
  const contentKey = randomBytes(32);
  const noncePrefix = randomBytes(8);
  const wrappedKey = publicEncrypt(
    { key: publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
    contentKey,
  );
  const header = Buffer.from(JSON.stringify({
    version: 2,
    keyWrap: "RSA-OAEP-SHA256",
    contentCipher: "AES-256-GCM-CHUNKED",
    chunkSize: CHUNK_SIZE,
    noncePrefix: noncePrefix.toString("base64"),
    wrappedKey: wrappedKey.toString("base64"),
    createdAt: new Date().toISOString(),
  }));
  const prefix = Buffer.alloc(MAGIC.length + 4);
  MAGIC.copy(prefix, 0);
  prefix.writeUInt32BE(header.length, MAGIC.length);
  const headerDigest = createHash("sha256").update(prefix).update(header).digest();
  return { contentKey, noncePrefix, header, prefix, headerDigest };
}

async function writeEncryptedFrame(envelope, output, index, final, plain) {
  if (index > 0xffffffff) throw new Error("Too many backup frames");
  const header = frameHeader(index, final, plain.length + TAG_BYTES);
  const cipher = createCipheriv("aes-256-gcm", envelope.contentKey, nonceFor(envelope.noncePrefix, index));
  cipher.setAAD(Buffer.concat([envelope.headerDigest, header]));
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]);
  await write(output, header);
  await write(output, encrypted);
}

export async function encryptDump({ input, output, publicKey, maxBytes, signal }) {
  const envelope = createEnvelope(publicKey);
  let total = 0;
  let index = 0;
  let pending = Buffer.alloc(0);
  try {
    await write(output, envelope.prefix);
    await write(output, envelope.header);
    for await (const incoming of input) {
      if (signal?.aborted) throw new Error("Backup cancelled");
      total += incoming.length;
      if (total > maxBytes) throw new Error("Backup exceeded configured byte limit");
      pending = pending.length ? Buffer.concat([pending, incoming]) : Buffer.from(incoming);
      while (pending.length >= CHUNK_SIZE) {
        const plain = pending.subarray(0, CHUNK_SIZE);
        pending = pending.subarray(CHUNK_SIZE);
        await writeEncryptedFrame(envelope, output, index++, false, plain);
      }
    }
    if (pending.length) await writeEncryptedFrame(envelope, output, index++, false, pending);
    await writeEncryptedFrame(envelope, output, index, true, Buffer.alloc(0));
  } finally {
    envelope.contentKey.fill(0);
    pending.fill(0);
  }
}
