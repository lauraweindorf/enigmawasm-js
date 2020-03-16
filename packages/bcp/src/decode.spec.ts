/* eslint-disable @typescript-eslint/camelcase */
import { IndexedTx, types } from "@lcw-enigmawasm/sdk";
import { Address, Algorithm, isSendTransaction, SendTransaction, TokenTicker } from "@iov/bcp";
import { Encoding } from "@iov/encoding";
import { assert } from "@iov/utils";

import {
  decodeAmount,
  decodeFullSignature,
  decodePubkey,
  decodeSignature,
  parseFee,
  parseMsg,
  parseSignedTx,
  parseTxsResponseSigned,
  parseTxsResponseUnsigned,
  parseUnsignedTx,
} from "./decode";
import * as testdata from "./testdata.spec";
import enigmachain from "./testdata/enigmachain.json";
import { BankTokens, Erc20Token } from "./types";

const { fromBase64, fromHex } = Encoding;

describe("decode", () => {
  const defaultPubkey = {
    algo: Algorithm.Secp256k1,
    data: fromBase64("AtQaCqFnshaZQp6rIkvAPyzThvCvXSDO+9AzbxVErqJP"),
  };
  const defaultSignature = fromBase64(
    "1nUcIH0CLT0/nQ0mBTDrT6kMG20NY/PsH7P2gc4bpYNGLEYjBmdWevXUJouSE/9A/60QG9cYeqyTe5kFDeIPxQ==",
  );
  const defaultFullSignature = {
    nonce: testdata.nonce,
    pubkey: defaultPubkey,
    signature: defaultSignature,
  };
  const defaultAmount = {
    fractionalDigits: 6,
    quantity: "11657995",
    tokenTicker: "SCRT" as TokenTicker,
  };
  const defaultMemo = "Best greetings";
  const defaultSendTransaction: SendTransaction = {
    kind: "bcp/send",
    chainId: testdata.chainId,
    sender: "enigma1h806c7khnvmjlywdrkdgk2vrayy2mmvf9rxk2r" as Address,
    recipient: "enigma1z7g5w84ynmjyg0kqpahdjqpj7yq34v3suckp0e" as Address,
    amount: defaultAmount,
    memo: defaultMemo,
  };
  const defaultFee = {
    tokens: {
      fractionalDigits: 6,
      quantity: "5000",
      tokenTicker: "SCRT" as TokenTicker,
    },
    gasLimit: "200000",
  };
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

  describe("decodePubkey", () => {
    it("works for secp256k1", () => {
      const pubkey: types.PubKey = {
        type: "tendermint/PubKeySecp256k1",
        value: "AtQaCqFnshaZQp6rIkvAPyzThvCvXSDO+9AzbxVErqJP",
      };
      expect(decodePubkey(pubkey)).toEqual(defaultPubkey);
    });

    it("works for ed25519", () => {
      const pubkey: types.PubKey = {
        type: "tendermint/PubKeyEd25519",
        value: "s69CnMgLTpuRyEfecjws3mWssBrOICUx8C2O1DkKSto=",
      };
      expect(decodePubkey(pubkey)).toEqual({
        algo: Algorithm.Ed25519,
        data: fromHex("b3af429cc80b4e9b91c847de723c2cde65acb01ace202531f02d8ed4390a4ada"),
      });
    });

    it("throws for unsupported types", () => {
      // https://github.com/tendermint/tendermint/blob/v0.33.0/crypto/sr25519/codec.go#L12
      const pubkey: types.PubKey = {
        type: "tendermint/PubKeySr25519",
        value: "N4FJNPE5r/Twz55kO1QEIxyaGF5/HTXH6WgLQJWsy1o=",
      };
      expect(() => decodePubkey(pubkey)).toThrowError(/unsupported pubkey type/i);
    });
  });

  describe("decodeSignature", () => {
    it("works", () => {
      const signature =
        "1nUcIH0CLT0/nQ0mBTDrT6kMG20NY/PsH7P2gc4bpYNGLEYjBmdWevXUJouSE/9A/60QG9cYeqyTe5kFDeIPxQ==";
      expect(decodeSignature(signature)).toEqual(defaultSignature);
    });
  });

  describe("decodeFullSignature", () => {
    it("works", () => {
      const fullSignature: types.StdSignature = {
        pub_key: {
          type: "tendermint/PubKeySecp256k1",
          value: "AtQaCqFnshaZQp6rIkvAPyzThvCvXSDO+9AzbxVErqJP",
        },
        signature: "1nUcIH0CLT0/nQ0mBTDrT6kMG20NY/PsH7P2gc4bpYNGLEYjBmdWevXUJouSE/9A/60QG9cYeqyTe5kFDeIPxQ==",
      };
      expect(decodeFullSignature(fullSignature, testdata.nonce)).toEqual(defaultFullSignature);
    });
  });

  describe("decodeAmount", () => {
    it("works", () => {
      const amount: types.Coin = {
        denom: "uscrt",
        amount: "11657995",
      };
      expect(decodeAmount(defaultTokens, amount)).toEqual(defaultAmount);
    });
  });

  describe("parseMsg", () => {
    it("works for bank send transaction", () => {
      const msg: types.Msg = {
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
      };
      expect(parseMsg(msg, defaultMemo, testdata.chainId, defaultTokens, defaultErc20Tokens)).toEqual(
        defaultSendTransaction,
      );
    });

    it("works for ERC20 send transaction", () => {
      const msg: types.MsgExecuteContract = {
        type: "compute/execute",
        value: {
          sender: "enigma1h806c7khnvmjlywdrkdgk2vrayy2mmvf9rxk2r",
          contract: defaultErc20Tokens[0].contractAddress,
          msg: {
            transfer: {
              amount: "887878484",
              recipient: "enigma1z7g5w84ynmjyg0kqpahdjqpj7yq34v3suckp0e",
            },
          },
          sent_funds: [],
        },
      };
      const transaction = parseMsg(msg, defaultMemo, testdata.chainId, defaultTokens, defaultErc20Tokens);
      assert(isSendTransaction(transaction));
      expect(transaction).toEqual({
        kind: "bcp/send",
        chainId: testdata.chainId,
        sender: "enigma1h806c7khnvmjlywdrkdgk2vrayy2mmvf9rxk2r" as Address,
        recipient: "enigma1z7g5w84ynmjyg0kqpahdjqpj7yq34v3suckp0e" as Address,
        amount: {
          quantity: "887878484",
          tokenTicker: "HASH" as TokenTicker,
          fractionalDigits: 5,
        },
        memo: defaultMemo,
      });
    });
  });

  describe("parseFee", () => {
    it("works", () => {
      const fee = {
        amount: [
          {
            denom: "uscrt",
            amount: "5000",
          },
        ],
        gas: "200000",
      };
      expect(parseFee(fee, defaultTokens)).toEqual(defaultFee);
    });
  });

  describe("parseUnsignedTx", () => {
    it("works for bank send transaction", () => {
      expect(
        parseUnsignedTx(enigmachain.tx.value, testdata.chainId, defaultTokens, defaultErc20Tokens),
      ).toEqual(testdata.sendTxJson);
    });

    it("works for ERC20 send transaction", () => {
      const msg: types.MsgExecuteContract = {
        type: "compute/execute",
        value: {
          sender: "enigma1h806c7khnvmjlywdrkdgk2vrayy2mmvf9rxk2r",
          contract: defaultErc20Tokens[0].contractAddress,
          msg: {
            transfer: {
              amount: "887878484",
              recipient: "enigma1z7g5w84ynmjyg0kqpahdjqpj7yq34v3suckp0e",
            },
          },
          sent_funds: [],
        },
      };
      const tx: types.StdTx = {
        msg: [msg],
        memo: defaultMemo,
        fee: {
          amount: [
            {
              denom: "uscrt",
              amount: "5000",
            },
          ],
          gas: "200000",
        },
        signatures: [],
      };
      const unsigned = parseUnsignedTx(tx, testdata.chainId, defaultTokens, defaultErc20Tokens);
      assert(isSendTransaction(unsigned));
      expect(unsigned).toEqual({
        kind: "bcp/send",
        chainId: testdata.chainId,
        sender: "enigma1h806c7khnvmjlywdrkdgk2vrayy2mmvf9rxk2r" as Address,
        recipient: "enigma1z7g5w84ynmjyg0kqpahdjqpj7yq34v3suckp0e" as Address,
        amount: {
          quantity: "887878484",
          tokenTicker: "HASH" as TokenTicker,
          fractionalDigits: 5,
        },
        memo: defaultMemo,
        fee: defaultFee,
      });
    });
  });

  describe("parseSignedTx", () => {
    it("works", () => {
      expect(
        parseSignedTx(
          enigmachain.tx.value,
          testdata.chainId,
          testdata.nonce,
          defaultTokens,
          defaultErc20Tokens,
        ),
      ).toEqual(testdata.signedTxJson);
    });
  });

  describe("parseTxsResponseUnsigned", () => {
    it("works", () => {
      const currentHeight = 2923;
      const txsResponse: IndexedTx = {
        height: 2823,
        hash: testdata.txId,
        rawLog: '[{"msg_index":0,"success":true,"log":""}]',
        logs: [],
        tx: enigmachain.tx,
        timestamp: "2020-02-14T11:35:41Z",
      };
      const expected = {
        transaction: testdata.sendTxJson,
        height: 2823,
        confirmations: 101,
        transactionId: testdata.txId,
        log: '[{"msg_index":0,"success":true,"log":""}]',
      };
      expect(
        parseTxsResponseUnsigned(
          testdata.chainId,
          currentHeight,
          txsResponse,
          defaultTokens,
          defaultErc20Tokens,
        ),
      ).toEqual(expected);
    });
  });

  describe("parseTxsResponseSigned", () => {
    it("works", () => {
      const currentHeight = 2923;
      const txsResponse: IndexedTx = {
        height: 2823,
        hash: testdata.txId,
        rawLog: '[{"msg_index":0,"success":true,"log":""}]',
        logs: [],
        tx: enigmachain.tx,
        timestamp: "2020-02-14T11:35:41Z",
      };
      const expected = {
        ...testdata.signedTxJson,
        height: 2823,
        confirmations: 101,
        transactionId: testdata.txId,
        log: '[{"msg_index":0,"success":true,"log":""}]',
      };
      expect(
        parseTxsResponseSigned(
          testdata.chainId,
          currentHeight,
          testdata.nonce,
          txsResponse,
          defaultTokens,
          defaultErc20Tokens,
        ),
      ).toEqual(expected);
    });
  });
});

/*

Some output from sample rest queries:

$ enigmacli tx send $(enigmacli keys show validator -a) $(enigmacli keys show fred -a) 98765uscrt -y
{
  "height": "4",
  "txhash": "8A4613D62884EF8BB9BCCDDA3833D560701908BF17FE82A570EECCBACEF94A91",
  "raw_log": "[{\"msg_index\":0,\"log\":\"\",\"events\":[{\"type\":\"message\",\"attributes\":[{\"key\":\"action\",\"value\":\"send\"},{\"key\":\"sender\",\"value\":\"enigma16qu479grzwanyzav6xvtzncgdjkwhqw7vy2pje\"},{\"key\":\"module\",\"value\":\"bank\"}]},{\"type\":\"transfer\",\"attributes\":[{\"key\":\"recipient\",\"value\":\"enigma1ltkhnmdcqemmd2tkhnx7qx66tq7e0wykw2j85k\"},{\"key\":\"amount\",\"value\":\"98765uscrt\"}]}]}]",
  "logs": [
    {
      "msg_index": 0,
      "log": "",
      "events": [
        {
          "type": "message",
          "attributes": [
            {
              "key": "action",
              "value": "send"
            },
            {
              "key": "sender",
              "value": "enigma16qu479grzwanyzav6xvtzncgdjkwhqw7vy2pje"
            },
            {
              "key": "module",
              "value": "bank"
            }
          ]
        },
        {
          "type": "transfer",
          "attributes": [
            {
              "key": "recipient",
              "value": "enigma1ltkhnmdcqemmd2tkhnx7qx66tq7e0wykw2j85k"
            },
            {
              "key": "amount",
              "value": "98765uscrt"
            }
          ]
        }
      ]
    }
  ],
  "gas_wanted": "200000",
  "gas_used": "53254"
}


$ enigmacli query tx 8A4613D62884EF8BB9BCCDDA3833D560701908BF17FE82A570EECCBACEF94A91
{
  "height": "4",
  "txhash": "8A4613D62884EF8BB9BCCDDA3833D560701908BF17FE82A570EECCBACEF94A91",
  "raw_log": "[{\"msg_index\":0,\"log\":\"\",\"events\":[{\"type\":\"message\",\"attributes\":[{\"key\":\"action\",\"value\":\"send\"},{\"key\":\"sender\",\"value\":\"enigma16qu479grzwanyzav6xvtzncgdjkwhqw7vy2pje\"},{\"key\":\"module\",\"value\":\"bank\"}]},{\"type\":\"transfer\",\"attributes\":[{\"key\":\"recipient\",\"value\":\"enigma1ltkhnmdcqemmd2tkhnx7qx66tq7e0wykw2j85k\"},{\"key\":\"amount\",\"value\":\"98765uscrt\"}]}]}]",
  "logs": [
    {
      "msg_index": 0,
      "log": "",
      "events": [
        {
          "type": "message",
          "attributes": [
            {
              "key": "action",
              "value": "send"
            },
            {
              "key": "sender",
              "value": "enigma16qu479grzwanyzav6xvtzncgdjkwhqw7vy2pje"
            },
            {
              "key": "module",
              "value": "bank"
            }
          ]
        },
        {
          "type": "transfer",
          "attributes": [
            {
              "key": "recipient",
              "value": "enigma1ltkhnmdcqemmd2tkhnx7qx66tq7e0wykw2j85k"
            },
            {
              "key": "amount",
              "value": "98765uscrt"
            }
          ]
        }
      ]
    }
  ],
  "gas_wanted": "200000",
  "gas_used": "53254",
  "tx": {
    "type": "cosmos-sdk/StdTx",
    "value": {
      "msg": [
        {
          "type": "cosmos-sdk/MsgSend",
          "value": {
            "from_address": "enigma16qu479grzwanyzav6xvtzncgdjkwhqw7vy2pje",
            "to_address": "enigma1ltkhnmdcqemmd2tkhnx7qx66tq7e0wykw2j85k",
            "amount": [
              {
                "denom": "uscrt",
                "amount": "98765"
              }
            ]
          }
        }
      ],
      "fee": {
        "amount": [],
        "gas": "200000"
      },
      "signatures": [
        {
          "pub_key": {
            "type": "tendermint/PubKeySecp256k1",
            "value": "A11L8EitFnA6YsZ2QSnbMNmK+qI2kxyevDtSfhPqOwcp"
          },
          "signature": "qCeKoqZeaL0LThKrUXHLgu72jwTiF+DseSBjcKHtcONE0kIdybwYJpuYg3Jj71hmfync+daHNdqgJlPRma0pPA=="
        }
      ],
      "memo": ""
    }
  },
  "timestamp": "2020-02-03T17:06:58Z"
}


$ enigmacli query account $(enigmacli keys show fred -a)
{
  "type": "cosmos-sdk/Account",
  "value": {
    "address": "enigma1ltkhnmdcqemmd2tkhnx7qx66tq7e0wykw2j85k",
    "coins": [
      {
        "denom": "uscrt",
        "amount": "98765"
      }
    ],
    "public_key": "",
    "account_number": 7,
    "sequence": 0
  }
}


$ enigmacli query account $(enigmacli keys show validator -a)
{
  "type": "cosmos-sdk/Account",
  "value": {
    "address": "enigma16qu479grzwanyzav6xvtzncgdjkwhqw7vy2pje",
    "coins": [
      {
        "denom": "uscrt",
        "amount": "899901235"
      },
      {
        "denom": "validatortoken",
        "amount": "1000000000"
      }
    ],
    "public_key": "enigmapub1addwnpepqdw5huzg45t8qwnzcemyz2wmxrvc474zx6f3e84u8df8uyl28vrjjnp9v4p",
    "account_number": 3,
    "sequence": 2
  }
}

 */
