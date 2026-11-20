import { hash, verify, type Options } from "@node-rs/argon2";

const argon2idOptions: Options = {
  algorithm: 2,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 4,
  outputLen: 32,
};

export const hashPassword = (password: string) => hash(password, argon2idOptions);

export const verifyPassword = ({ password, hash: encodedHash }: { password: string; hash: string }) =>
  verify(encodedHash, password, argon2idOptions);
