/* eslint-disable @typescript-eslint/camelcase */
import {
  Address,
  Algorithm,
  Amount,
  ChainId,
  Nonce,
  PubkeyBytes,
  SendTransaction,
  SignatureBytes,
  SignedTransaction,
  TokenTicker,
} from "@iov/bcp";
import { Encoding } from "@iov/encoding";

import {
  buildSignedTx,
  buildUnsignedTx,
  encodeFee,
  encodeFullSignature,
  encodePubkey,
  toBankCoin,
  toErc20Amount,
} from "./encode";
import { BankTokens, Erc20Token } from "./types";

const { fromBase64 } = Encoding;

describe("encode", () => {
  const scrt = "SCRT" as TokenTicker;
  // https://enigma-testnet.chainofsecrets.org/txs?hash=0x2268EB5AB730B45F8426078827BB5BB49819CE2B0D74B2C1D191070BADB379F1&prove=true
  const defaultPubkey = {
    algo: Algorithm.Secp256k1,
    data: fromBase64("AtQaCqFnshaZQp6rIkvAPyzThvCvXSDO+9AzbxVErqJP") as PubkeyBytes,
  };
  const defaultChainId = "not-used" as ChainId;
  const defaultSender = "enigma1h806c7khnvmjlywdrkdgk2vrayy2mmvf9rxk2r" as Address;
  const defaultRecipient = "enigma1z7g5w84ynmjyg0kqpahdjqpj7yq34v3suckp0e" as Address;
  const defaultAmount: Amount = {
    fractionalDigits: 6,
    quantity: "11657995",
    tokenTicker: scrt,
  };
  const defaultMemo = "hello enigma blockchain";
  const defaultTokens: BankTokens = [
    {
      fractionalDigits: 6,
      ticker: "SCRT",
      denom: "uscrt",
    },
  ];
  const defaultErc20Tokens: Erc20Token[] = [
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

  describe("encodePubkey", () => {
    it("works for compressed public key", () => {
      expect(encodePubkey(defaultPubkey)).toEqual({
        type: "tendermint/PubKeySecp256k1",
        value: "AtQaCqFnshaZQp6rIkvAPyzThvCvXSDO+9AzbxVErqJP",
      });
    });
  });

  describe("toErc20Amount", () => {
    const [ash, bash] = defaultErc20Tokens;

    it("encodes an amount", () => {
      const amount: Amount = {
        quantity: "789",
        fractionalDigits: 0,
        tokenTicker: "ISA" as TokenTicker,
      };
      expect(toErc20Amount(amount, bash)).toEqual("789");
    });

    it("throws on ticker mismatch", () => {
      const amount: Amount = {
        quantity: "789",
        fractionalDigits: 0,
        tokenTicker: "ISA" as TokenTicker,
      };
      expect(() => toErc20Amount(amount, ash)).toThrowError(/ticker mismatch/i);
    });

    it("throws on ticker mismatch", () => {
      const amount: Amount = {
        quantity: "789",
        fractionalDigits: 2,
        tokenTicker: "ISA" as TokenTicker,
      };
      expect(() => toErc20Amount(amount, bash)).toThrowError(/fractional digits mismatch/i);
    });
  });

  describe("toBankCoin", () => {
    it("encodes an amount", () => {
      expect(toBankCoin(defaultAmount, defaultTokens)).toEqual({
        denom: "uscrt",
        amount: "11657995",
      });
    });
  });

  describe("encodeFee", () => {
    it("throws without tokens", () => {
      const fee = {
        gasLimit: "200000",
      };
      expect(() => encodeFee(fee, defaultTokens)).toThrowError(/cannot encode fee without tokens/i);
    });

    it("throws without gas limit", () => {
      const fee = {
        tokens: {
          fractionalDigits: 6,
          quantity: "5000",
          tokenTicker: scrt,
        },
      };
      expect(() => encodeFee(fee, defaultTokens)).toThrowError(/cannot encode fee without gas limit/i);
    });

    it("encodes a fee", () => {
      const fee = {
        tokens: {
          fractionalDigits: 6,
          quantity: "5000",
          tokenTicker: scrt,
        },
        gasLimit: "200000",
      };
      expect(encodeFee(fee, defaultTokens)).toEqual({
        amount: [{ denom: "uscrt", amount: "5000" }],
        gas: "200000",
      });
    });
  });

  describe("encodeFullSignature", () => {
    it("encodes a full signature", () => {
      const signature = {
        nonce: 0 as Nonce,
        pubkey: {
          algo: Algorithm.Secp256k1,
          data: fromBase64("AtQaCqFnshaZQp6rIkvAPyzThvCvXSDO+9AzbxVErqJP") as PubkeyBytes,
        },
        signature: fromBase64(
          "1nUcIH0CLT0/nQ0mBTDrT6kMG20NY/PsH7P2gc4bpYNGLEYjBmdWevXUJouSE/9A/60QG9cYeqyTe5kFDeIPxQ==",
        ) as SignatureBytes,
      };
      expect(encodeFullSignature(signature)).toEqual({
        pub_key: {
          type: "tendermint/PubKeySecp256k1",
          value: "AtQaCqFnshaZQp6rIkvAPyzThvCvXSDO+9AzbxVErqJP",
        },
        signature: "1nUcIH0CLT0/nQ0mBTDrT6kMG20NY/PsH7P2gc4bpYNGLEYjBmdWevXUJouSE/9A/60QG9cYeqyTe5kFDeIPxQ==",
      });
    });

    it("compresses uncompressed public keys", () => {
      const signature = {
        nonce: 0 as Nonce,
        pubkey: {
          algo: Algorithm.Secp256k1,
          data: fromBase64(
            "BE8EGB7ro1ORuFhjOnZcSgwYlpe0DSFjVNUIkNNQxwKQE7WHpoHoNswYeoFkuYpYSKK4mzFzMV/dB0DVAy4lnNU=",
          ) as PubkeyBytes,
        },
        signature: fromBase64(
          "1nUcIH0CLT0/nQ0mBTDrT6kMG20NY/PsH7P2gc4bpYNGLEYjBmdWevXUJouSE/9A/60QG9cYeqyTe5kFDeIPxQ==",
        ) as SignatureBytes,
      };
      expect(encodeFullSignature(signature)).toEqual({
        pub_key: {
          type: "tendermint/PubKeySecp256k1",
          value: "A08EGB7ro1ORuFhjOnZcSgwYlpe0DSFjVNUIkNNQxwKQ",
        },
        signature: "1nUcIH0CLT0/nQ0mBTDrT6kMG20NY/PsH7P2gc4bpYNGLEYjBmdWevXUJouSE/9A/60QG9cYeqyTe5kFDeIPxQ==",
      });
    });

    it("removes recovery values from signature data", () => {
      const signature = {
        nonce: 0 as Nonce,
        pubkey: {
          algo: Algorithm.Secp256k1,
          data: fromBase64("AtQaCqFnshaZQp6rIkvAPyzThvCvXSDO+9AzbxVErqJP") as PubkeyBytes,
        },
        signature: Uint8Array.from([
          ...fromBase64(
            "1nUcIH0CLT0/nQ0mBTDrT6kMG20NY/PsH7P2gc4bpYNGLEYjBmdWevXUJouSE/9A/60QG9cYeqyTe5kFDeIPxQ==",
          ),
          99,
        ]) as SignatureBytes,
      };
      expect(encodeFullSignature(signature)).toEqual({
        pub_key: {
          type: "tendermint/PubKeySecp256k1",
          value: "AtQaCqFnshaZQp6rIkvAPyzThvCvXSDO+9AzbxVErqJP",
        },
        signature: "1nUcIH0CLT0/nQ0mBTDrT6kMG20NY/PsH7P2gc4bpYNGLEYjBmdWevXUJouSE/9A/60QG9cYeqyTe5kFDeIPxQ==",
      });
    });
  });

  describe("buildUnsignedTx", () => {
    it("throws for unsupported transaction", () => {
      const tx = {
        kind: "bns/return_escrow",
        chainId: defaultChainId,
        escrowId: "defg",
      };
      expect(() => buildUnsignedTx(tx, defaultTokens)).toThrowError(
        /received transaction of unsupported kind/i,
      );
    });

    it("throws for a send transaction without fee", () => {
      // This will be rejected by the REST server. Better throw early to avoid hard to debug errors.
      const tx = {
        kind: "bcp/send",
        chainId: defaultChainId,
        amount: defaultAmount,
        sender: defaultSender,
        recipient: defaultRecipient,
        memo: defaultMemo,
      };
      expect(() => buildUnsignedTx(tx, defaultTokens)).toThrowError(/transaction fee must be set/i);
    });

    it("builds a send transaction with fee", () => {
      const tx = {
        kind: "bcp/send",
        chainId: defaultChainId,
        amount: defaultAmount,
        sender: defaultSender,
        recipient: defaultRecipient,
        memo: defaultMemo,
        fee: {
          tokens: {
            fractionalDigits: 6,
            quantity: "5000",
            tokenTicker: scrt,
          },
          gasLimit: "200000",
        },
      };
      expect(buildUnsignedTx(tx, defaultTokens)).toEqual({
        type: "cosmos-sdk/StdTx",
        value: {
          msg: [
            {
              type: "cosmos-sdk/MsgSend",
              value: {
                from_address: "enigma1h806c7khnvmjlywdrkdgk2vrayy2mmvf9rxk2r",
                to_address: "enigma1z7g5w84ynmjyg0kqpahdjqpj7yq34v3suckp0e",
                amount: [
                  {
                    denom: "uscrt",
                    amount: "11657995",
                  },
                ],
              },
            },
          ],
          fee: {
            amount: [{ denom: "uscrt", amount: "5000" }],
            gas: "200000",
          },
          signatures: [],
          memo: defaultMemo,
        },
      });
    });

    it("works for ERC20 send", () => {
      const bashSendTx: SendTransaction = {
        kind: "bcp/send",
        chainId: defaultChainId,
        sender: "enigma1txqfn5jmcts0x0q7krdxj8tgf98tj0965vqlmq" as Address,
        recipient: "enigma1dddd" as Address,
        memo: defaultMemo,
        amount: {
          fractionalDigits: 0,
          quantity: "345",
          tokenTicker: "ISA" as TokenTicker,
        },
        fee: {
          tokens: {
            fractionalDigits: 6,
            quantity: "3333",
            tokenTicker: "SCRT" as TokenTicker,
          },
          gasLimit: "234000",
        },
      };
      expect(buildUnsignedTx(bashSendTx, defaultTokens, defaultErc20Tokens)).toEqual({
        type: "cosmos-sdk/StdTx",
        value: {
          msg: [
            {
              type: "compute/execute",
              value: {
                sender: "enigma1txqfn5jmcts0x0q7krdxj8tgf98tj0965vqlmq",
                contract: "enigma1hqrdl6wstt8qzshwc6mrumpjk9338k0lr4dqxd",
                msg: {
                  transfer: {
                    recipient: "enigma1dddd",
                    amount: "345",
                  },
                },
                sent_funds: [],
              },
            },
          ],
          fee: {
            amount: [{ denom: "uscrt", amount: "3333" }],
            gas: "234000",
          },
          signatures: [],
          memo: defaultMemo,
        },
      });
    });
  });

  describe("buildSignedTx", () => {
    it("builds a send transaction", () => {
      const tx: SignedTransaction<SendTransaction> = {
        transaction: {
          kind: "bcp/send",
          chainId: defaultChainId,
          amount: defaultAmount,
          sender: defaultSender,
          recipient: defaultRecipient,
          memo: defaultMemo,
          fee: {
            tokens: {
              fractionalDigits: 6,
              quantity: "5000",
              tokenTicker: scrt,
            },
            gasLimit: "200000",
          },
        },
        signatures: [
          {
            nonce: 0 as Nonce,
            pubkey: {
              algo: Algorithm.Secp256k1,
              data: fromBase64("AtQaCqFnshaZQp6rIkvAPyzThvCvXSDO+9AzbxVErqJP") as PubkeyBytes,
            },
            signature: fromBase64(
              "1nUcIH0CLT0/nQ0mBTDrT6kMG20NY/PsH7P2gc4bpYNGLEYjBmdWevXUJouSE/9A/60QG9cYeqyTe5kFDeIPxQ==",
            ) as SignatureBytes,
          },
        ],
      };
      expect(buildSignedTx(tx, defaultTokens)).toEqual({
        type: "cosmos-sdk/StdTx",
        value: {
          msg: [
            {
              type: "cosmos-sdk/MsgSend",
              value: {
                from_address: "enigma1h806c7khnvmjlywdrkdgk2vrayy2mmvf9rxk2r",
                to_address: "enigma1z7g5w84ynmjyg0kqpahdjqpj7yq34v3suckp0e",
                amount: [
                  {
                    denom: "uscrt",
                    amount: "11657995",
                  },
                ],
              },
            },
          ],
          fee: {
            amount: [{ denom: "uscrt", amount: "5000" }],
            gas: "200000",
          },
          signatures: [
            {
              pub_key: {
                type: "tendermint/PubKeySecp256k1",
                value: "AtQaCqFnshaZQp6rIkvAPyzThvCvXSDO+9AzbxVErqJP",
              },
              signature:
                "1nUcIH0CLT0/nQ0mBTDrT6kMG20NY/PsH7P2gc4bpYNGLEYjBmdWevXUJouSE/9A/60QG9cYeqyTe5kFDeIPxQ==",
            },
          ],
          memo: defaultMemo,
        },
      });
    });
  });
});
