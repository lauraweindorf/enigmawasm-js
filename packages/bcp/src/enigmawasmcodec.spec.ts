import { Address, PostableBytes, PrehashType, SendTransaction, TokenTicker } from "@iov/bcp";
import { Encoding } from "@iov/encoding";

import { EnigmaWasmCodec } from "./enigmawasmcodec";
import { chainId, nonce, sendTxJson, signedTxBin, signedTxEncodedJson, signedTxJson } from "./testdata.spec";
import { BankToken, Erc20Token } from "./types";

const { toUtf8 } = Encoding;

const defaultPrefix = "enigma";

const defaultBankTokens: readonly BankToken[] = [
  {
    fractionalDigits: 6,
    ticker: "SCRT",
    denom: "uscrt",
  },
];

const defaultErc20Tokens: readonly Erc20Token[] = [
  {
    contractAddress: "enigma18vd8fpwxzck93qlwghaj6arh4p7c5n89uzcee5",
    fractionalDigits: 5,
    ticker: "HASH",
  },
  {
    contractAddress: "enigma1hqrdl6wstt8qzshwc6mrumpjk9338k0lr4dqxd",
    fractionalDigits: 0,
    ticker: "ISA",
  },
  {
    contractAddress: "enigma18r5szma8hm93pvx6lwpjwyxruw27e0k5uw835c",
    fractionalDigits: 18,
    ticker: "JADE",
  },
];

describe("EnigmaWasmCodec", () => {
  const codec = new EnigmaWasmCodec(defaultPrefix, defaultBankTokens, defaultErc20Tokens);

  describe("isValidAddress", () => {
    it("accepts valid addresses", () => {
      expect(codec.isValidAddress("enigma1pkptre7fdkl6gfrzlesjjvhxhlc3r4gmmk8rs6")).toEqual(true);
    });

    it("rejects invalid addresses", () => {
      // Bad size
      expect(codec.isValidAddress("enigma10q82zkzzmaku5lazhsvxv7hsg4ntpuhh8289f")).toEqual(false);
      // Bad checksum
      expect(codec.isValidAddress("enigma1pkptre7fdkl6gfrzlesjjvhxhlc3r4gmmk8rs7")).toEqual(false);
      // Bad prefix
      expect(codec.isValidAddress("enigmt10q82zkzzmaku5lazhsvxv7hsg4ntpuhd8j5266")).toEqual(false);
      expect(codec.isValidAddress("enigmavalcons10q82zkzzmaku5lazhsvxv7hsg4ntpuhdwadmss")).toEqual(false);
      expect(codec.isValidAddress("enigmavaloper17mggn4znyeyg25wd7498qxl7r2jhgue8u4qjcq")).toEqual(false);
    });
  });

  describe("bytesToSign", () => {
    it("works for SendTransaction via bank module", () => {
      const expected = {
        bytes: toUtf8(
          '{"account_number":"0","chain_id":"enigma-testnet","fee":{"amount":[{"amount":"2500","denom":"uscrt"}],"gas":"100000"},"memo":"","msgs":[{"type":"cosmos-sdk/MsgSend","value":{"amount":[{"amount":"35997500","denom":"uscrt"}],"from_address":"enigma1txqfn5jmcts0x0q7krdxj8tgf98tj0965vqlmq","to_address":"enigma1nynns8ex9fq6sjjfj8k79ymkdz4sqth06xexae"}}],"sequence":"99"}',
        ),
        prehashType: PrehashType.Sha256,
      };
      expect(codec.bytesToSign(sendTxJson, nonce)).toEqual(expected);
    });

    it("works for ERC20 send", () => {
      const bashSendTx: SendTransaction = {
        kind: "bcp/send",
        chainId: chainId,
        sender: "enigma1txqfn5jmcts0x0q7krdxj8tgf98tj0965vqlmq" as Address,
        recipient: "enigma1dddd" as Address,
        memo: "My first ISA payment",
        amount: {
          fractionalDigits: 0,
          quantity: "345",
          tokenTicker: "ISA" as TokenTicker,
        },
        fee: {
          tokens: {
            fractionalDigits: 6,
            quantity: "2500",
            tokenTicker: "SCRT" as TokenTicker,
          },
          gasLimit: "100000",
        },
      };

      const expected = {
        bytes: toUtf8(
          '{"account_number":"0","chain_id":"enigma-testnet","fee":{"amount":[{"amount":"2500","denom":"uscrt"}],"gas":"100000"},"memo":"My first ISA payment","msgs":[{"type":"compute/execute","value":{"contract":"enigma1hqrdl6wstt8qzshwc6mrumpjk9338k0lr4dqxd","msg":{"transfer":{"amount":"345","recipient":"enigma1dddd"}},"sender":"enigma1txqfn5jmcts0x0q7krdxj8tgf98tj0965vqlmq","sent_funds":[]}}],"sequence":"99"}',
        ),
        prehashType: PrehashType.Sha256,
      };

      expect(codec.bytesToSign(bashSendTx, nonce)).toEqual(expected);
    });
  });

  describe("bytesToPost", () => {
    it("works for SendTransaction via bank module", () => {
      const encoded = codec.bytesToPost(signedTxJson);
      expect(encoded).toEqual(signedTxEncodedJson);
    });
  });

  describe("parseBytes", () => {
    it("throws when trying to decode a transaction without a nonce", () => {
      expect(() => codec.parseBytes(signedTxBin as PostableBytes, chainId)).toThrowError(
        /nonce is required/i,
      );
    });

    it("properly decodes transactions", () => {
      const decoded = codec.parseBytes(signedTxEncodedJson as PostableBytes, chainId, nonce);
      expect(decoded).toEqual(signedTxJson);
    });

    it("round trip works", () => {
      const encoded = codec.bytesToPost(signedTxJson);
      const decoded = codec.parseBytes(encoded, chainId, nonce);
      expect(decoded).toEqual(signedTxJson);
    });
  });
});
