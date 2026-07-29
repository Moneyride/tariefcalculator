import { generateKeyPairSync } from "node:crypto";

const { publicKey, privateKey } = generateKeyPairSync("ec", {
  namedCurve: "prime256v1"
});
const publicJwk = publicKey.export({ format: "jwk" });
const privateJwk = privateKey.export({ format: "jwk" });

const toBuffer = (value) => Buffer.from(value, "base64url");
const applicationServerKey = Buffer.concat([
  Buffer.from([4]),
  toBuffer(publicJwk.x),
  toBuffer(publicJwk.y)
]).toString("base64url");

console.log(`VAPID_PUBLIC_KEY=${applicationServerKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateJwk.d}`);

