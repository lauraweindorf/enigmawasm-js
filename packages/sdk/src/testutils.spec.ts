import { Random } from "@iov/crypto";
import { Bech32, Encoding } from "@iov/encoding";

import hackatom from "./testdata/contract.json";

export function getHackatom(): Uint8Array {
  return Encoding.fromBase64(hackatom.data);
}

export function makeRandomAddress(): string {
  return Bech32.encode("enigma", Random.getBytes(20));
}

export const tendermintHeightMatcher = /^[0-9]+$/;
export const tendermintIdMatcher = /^[0-9A-F]{64}$/;
export const tendermintOptionalIdMatcher = /^([0-9A-F]{64}|)$/;
export const tendermintAddressMatcher = /^[0-9A-F]{40}$/;
export const tendermintShortHashMatcher = /^[0-9a-f]{40}$/;
export const semverMatcher = /^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$/;

// https://github.com/bitcoin/bips/blob/master/bip-0173.mediawiki#bech32
export const bech32AddressMatcher = /^[\x21-\x7e]{1,83}1[02-9ac-hj-np-z]{38}$/;

/** Deployed as part of scripts/enigmad/init.sh */
export const deployedErc20 = {
  codeId: 1,
  source: "https://crates.io/api/v1/crates/cw-erc20/0.3.0/download",
  builder: "confio/cosmwasm-opt:0.7.3",
  checksum: "3dfa55f790a636c11ae2936473734a4d271d441f32d0cfcd7ac19c17b162f85b",
  instances: [
    "enigma18vd8fpwxzck93qlwghaj6arh4p7c5n89uzcee5", // HASH
    "enigma1hqrdl6wstt8qzshwc6mrumpjk9338k0lr4dqxd", // ISA
    "enigma18r5szma8hm93pvx6lwpjwyxruw27e0k5uw835c", // JADE
  ],
};

export const wasmd = {
  endpoint: "http://localhost:1317",
  expectedChainId: "testing",
};

export const faucet = {
  mnemonic:
    "economy stock theory fatal elder harbor betray wasp final emotion task crumble siren bottom lizard educate guess current outdoor pair theory focus wife stone",
  pubkey: {
    type: "tendermint/PubKeySecp256k1",
    value: "A08EGB7ro1ORuFhjOnZcSgwYlpe0DSFjVNUIkNNQxwKQ",
  },
  address: "enigma1pkptre7fdkl6gfrzlesjjvhxhlc3r4gmmk8rs6",
};

export function enigmadEnabled(): boolean {
  return !!process.env.ENIGMAD_ENABLED;
}

export function pendingWithoutEnigmad(): void {
  if (!enigmadEnabled()) {
    return pending("Set ENIGMAD_ENABLED to enable Enigmad based tests");
  }
}

/** Returns first element. Throws if array has a different length than 1. */
export function fromOneElementArray<T>(elements: ArrayLike<T>): T {
  if (elements.length !== 1) throw new Error(`Expected exactly one element but got ${elements.length}`);
  return elements[0];
}
