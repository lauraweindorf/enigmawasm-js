/* eslint-disable @typescript-eslint/camelcase */
import { Sha256 } from "@iov/crypto";
import { Encoding } from "@iov/encoding";
import { assert, sleep } from "@iov/utils";
import { ReadonlyDate } from "readonly-date";

import { makeSignBytes } from "./encoding";
import { findAttribute, parseLogs } from "./logs";
import { Pen, Secp256k1Pen } from "./pen";
import { encodeBech32Pubkey } from "./pubkey";
import { PostTxsResponse, RestClient, TxsResponse } from "./restclient";
import { SigningEnigmaWasmClient } from "./signingenigmawasmclient";
import enigmachain from "./testdata/enigmachain.json";
import {
  bech32AddressMatcher,
  deployedErc20,
  faucet,
  fromOneElementArray,
  getHackatom,
  makeRandomAddress,
  pendingWithoutWasmd,
  semverMatcher,
  tendermintAddressMatcher,
  tendermintHeightMatcher,
  tendermintIdMatcher,
  tendermintOptionalIdMatcher,
  tendermintShortHashMatcher,
  enigmad,
  enigmadEnabled,
} from "./testutils.spec";
import {
  Coin,
  isMsgInstantiateContract,
  isMsgStoreCode,
  Msg,
  MsgExecuteContract,
  MsgInstantiateContract,
  MsgSend,
  MsgStoreCode,
  StdFee,
  StdSignature,
  StdTx,
} from "./types";

const { fromAscii, fromBase64, fromHex, toAscii, toBase64, toHex } = Encoding;

const defaultNetworkId = "testing";
const emptyAddress = "enigma1ltkhnmdcqemmd2tkhnx7qx66tq7e0wykw2j85k";
const unusedAccount = {
  address: "enigma1cjsxept9rkggzxztslae9ndgpdyt2408lk850u",
};

function makeSignedTx(firstMsg: Msg, fee: StdFee, memo: string, firstSignature: StdSignature): StdTx {
  return {
    msg: [firstMsg],
    fee: fee,
    memo: memo,
    signatures: [firstSignature],
  };
}

async function uploadCustomContract(
  client: RestClient,
  pen: Pen,
  computeCode: Uint8Array,
): Promise<PostTxsResponse> {
  const memo = "My first contract on chain";
  const theMsg: MsgStoreCode = {
    type: "compute/store-code",
    value: {
      sender: faucet.address,
      compute_byte_code: toBase64(computeCode),
      source: "https://github.com/confio/cosmwasm/raw/0.7/lib/vm/testdata/contract_0.6.wasm",
      builder: "confio/cosmwasm-opt:0.6.2",
    },
  };
  const fee: StdFee = {
    amount: [
      {
        amount: "5000000",
        denom: "uscrt",
      },
    ],
    gas: "89000000",
  };

  const { account_number, sequence } = (await client.authAccounts(faucet.address)).result.value;
  const signBytes = makeSignBytes([theMsg], fee, defaultNetworkId, memo, account_number, sequence);
  const signature = await pen.sign(signBytes);
  const signedTx = makeSignedTx(theMsg, fee, memo, signature);
  return client.postTx(signedTx);
}

async function uploadContract(client: RestClient, pen: Pen): Promise<PostTxsResponse> {
  return uploadCustomContract(client, pen, getHackatom());
}

async function instantiateContract(
  client: RestClient,
  pen: Pen,
  codeId: number,
  beneficiaryAddress: string,
  transferAmount?: readonly Coin[],
): Promise<PostTxsResponse> {
  const memo = "Create an escrow instance";
  const theMsg: MsgInstantiateContract = {
    type: "compute/instantiate",
    value: {
      sender: faucet.address,
      code_id: codeId.toString(),
      label: "my escrow",
      init_msg: {
        verifier: faucet.address,
        beneficiary: beneficiaryAddress,
      },
      init_funds: transferAmount || [],
    },
  };
  const fee: StdFee = {
    amount: [
      {
        amount: "5000000",
        denom: "uscrt",
      },
    ],
    gas: "89000000",
  };

  const { account_number, sequence } = (await client.authAccounts(faucet.address)).result.value;
  const signBytes = makeSignBytes([theMsg], fee, defaultNetworkId, memo, account_number, sequence);
  const signature = await pen.sign(signBytes);
  const signedTx = makeSignedTx(theMsg, fee, memo, signature);
  return client.postTx(signedTx);
}

async function executeContract(
  client: RestClient,
  pen: Pen,
  contractAddress: string,
): Promise<PostTxsResponse> {
  const memo = "Time for action";
  const theMsg: MsgExecuteContract = {
    type: "compute/execute",
    value: {
      sender: faucet.address,
      contract: contractAddress,
      msg: { release: {} },
      sent_funds: [],
    },
  };
  const fee: StdFee = {
    amount: [
      {
        amount: "5000000",
        denom: "uscrt",
      },
    ],
    gas: "89000000",
  };

  const { account_number, sequence } = (await client.authAccounts(faucet.address)).result.value;
  const signBytes = makeSignBytes([theMsg], fee, defaultNetworkId, memo, account_number, sequence);
  const signature = await pen.sign(signBytes);
  const signedTx = makeSignedTx(theMsg, fee, memo, signature);
  return client.postTx(signedTx);
}

describe("RestClient", () => {
  it("can be constructed", () => {
    const client = new RestClient(enigmad.endpoint);
    expect(client).toBeTruthy();
  });

  // The /auth endpoints

  describe("authAccounts", () => {
    it("works for unused account without pubkey", async () => {
      pendingWithoutEnigmad();
      const client = new RestClient(enigmad.endpoint);
      const { height, result } = await client.authAccounts(unusedAccount.address);
      expect(height).toMatch(tendermintHeightMatcher);
      expect(result).toEqual({
        type: "cosmos-sdk/Account",
        value: {
          address: unusedAccount.address,
          public_key: "", // not known to the chain
          coins: [
            {
              amount: "1000000000",
              denom: "uscrt",
            },
            {
              amount: "1000000000",
              denom: "ustake",
            },
          ],
          account_number: 5,
          sequence: 0,
        },
      });
    });

    // This fails in the first test run if you forget to run `./scripts/enigmad/init.sh`
    it("has correct pubkey for faucet", async () => {
      pendingWithoutEnigmad();
      const client = new RestClient(enigmad.endpoint);
      const { result } = await client.authAccounts(faucet.address);
      expect(result.value).toEqual(
        jasmine.objectContaining({
          public_key: encodeBech32Pubkey(faucet.pubkey, "enigmapub"),
        }),
      );
    });

    // This property is used by EnigmaWasmClient.getAccount
    it("returns empty address for non-existent account", async () => {
      pendingWithoutEnigmad();
      const client = new RestClient(enigmad.endpoint);
      const nonExistentAccount = makeRandomAddress();
      const { result } = await client.authAccounts(nonExistentAccount);
      expect(result).toEqual({
        type: "cosmos-sdk/Account",
        value: jasmine.objectContaining({ address: "" }),
      });
    });
  });

  // The /blocks endpoints

  describe("blocksLatest", () => {
    it("works", async () => {
      pendingWithoutEnigmad();
      const client = new RestClient(enigmad.endpoint);
      const response = await client.blocksLatest();

      // id
      expect(response.block_id.hash).toMatch(tendermintIdMatcher);

      // header
      expect(response.block.header.version).toEqual({ block: "10", app: "0" });
      expect(parseInt(response.block.header.height, 10)).toBeGreaterThanOrEqual(1);
      expect(response.block.header.chain_id).toEqual(defaultNetworkId);
      expect(new ReadonlyDate(response.block.header.time).getTime()).toBeLessThan(ReadonlyDate.now());
      expect(new ReadonlyDate(response.block.header.time).getTime()).toBeGreaterThanOrEqual(
        ReadonlyDate.now() - 5_000,
      );
      expect(response.block.header.last_commit_hash).toMatch(tendermintIdMatcher);
      expect(response.block.header.last_block_id.hash).toMatch(tendermintIdMatcher);
      expect(response.block.header.data_hash).toMatch(tendermintOptionalIdMatcher);
      expect(response.block.header.validators_hash).toMatch(tendermintIdMatcher);
      expect(response.block.header.next_validators_hash).toMatch(tendermintIdMatcher);
      expect(response.block.header.consensus_hash).toMatch(tendermintIdMatcher);
      expect(response.block.header.app_hash).toMatch(tendermintIdMatcher);
      expect(response.block.header.last_results_hash).toMatch(tendermintOptionalIdMatcher);
      expect(response.block.header.evidence_hash).toMatch(tendermintOptionalIdMatcher);
      expect(response.block.header.proposer_address).toMatch(tendermintAddressMatcher);

      // data
      expect(response.block.data.txs === null || Array.isArray(response.block.data.txs)).toEqual(true);
    });
  });

  describe("blocks", () => {
    it("works for block by height", async () => {
      pendingWithoutEnigmad();
      const client = new RestClient(enigmad.endpoint);
      const height = parseInt((await client.blocksLatest()).block.header.height, 10);
      const response = await client.blocks(height - 1);

      // id
      expect(response.block_id.hash).toMatch(tendermintIdMatcher);

      // header
      expect(response.block.header.version).toEqual({ block: "10", app: "0" });
      expect(response.block.header.height).toEqual(`${height - 1}`);
      expect(response.block.header.chain_id).toEqual(defaultNetworkId);
      expect(new ReadonlyDate(response.block.header.time).getTime()).toBeLessThan(ReadonlyDate.now());
      expect(new ReadonlyDate(response.block.header.time).getTime()).toBeGreaterThanOrEqual(
        ReadonlyDate.now() - 5_000,
      );
      expect(response.block.header.last_commit_hash).toMatch(tendermintIdMatcher);
      expect(response.block.header.last_block_id.hash).toMatch(tendermintIdMatcher);
      expect(response.block.header.data_hash).toMatch(tendermintOptionalIdMatcher);
      expect(response.block.header.validators_hash).toMatch(tendermintIdMatcher);
      expect(response.block.header.next_validators_hash).toMatch(tendermintIdMatcher);
      expect(response.block.header.consensus_hash).toMatch(tendermintIdMatcher);
      expect(response.block.header.app_hash).toMatch(tendermintIdMatcher);
      expect(response.block.header.last_results_hash).toMatch(tendermintOptionalIdMatcher);
      expect(response.block.header.evidence_hash).toMatch(tendermintOptionalIdMatcher);
      expect(response.block.header.proposer_address).toMatch(tendermintAddressMatcher);

      // data
      expect(response.block.data.txs === null || Array.isArray(response.block.data.txs)).toEqual(true);
    });
  });

  // The /node_info endpoint

  describe("nodeInfo", () => {
    it("works", async () => {
      pendingWithoutEnigmad();
      const client = new RestClient(enigmad.endpoint);
      const { node_info, application_version } = await client.nodeInfo();

      expect(node_info).toEqual({
        protocol_version: { p2p: "7", block: "10", app: "0" },
        id: jasmine.stringMatching(tendermintShortHashMatcher),
        listen_addr: "tcp://0.0.0.0:26656",
        network: defaultNetworkId,
        version: "0.33.0",
        channels: "4020212223303800",
        moniker: defaultNetworkId,
        other: { tx_index: "on", rpc_address: "tcp://0.0.0.0:26657" },
      });
      expect(application_version).toEqual({
        name: "enigma",
        server_name: "enigmad",
        client_name: "enigmacli",
        version: jasmine.stringMatching(semverMatcher),
        commit: jasmine.stringMatching(tendermintShortHashMatcher),
        build_tags: "netgo,ledger",
        go: jasmine.stringMatching(/^go version go1\.[0-9]+\.[0-9]+ linux\/amd64$/),
      });
    });
  });

  // The /txs endpoints

  describe("txsQuery", () => {
    let posted:
      | {
          readonly sender: string;
          readonly recipient: string;
          readonly hash: string;
          readonly height: number;
          readonly tx: TxsResponse;
        }
      | undefined;

    beforeAll(async () => {
      if (enigmadEnabled()) {
        const pen = await Secp256k1Pen.fromMnemonic(faucet.mnemonic);
        const client = new SigningEnigmaWasmClient(enigmad.endpoint, faucet.address, signBytes =>
          pen.sign(signBytes),
        );

        const recipient = makeRandomAddress();
        const transferAmount = [
          {
            denom: "uscrt",
            amount: "1234567",
          },
        ];
        const result = await client.sendTokens(recipient, transferAmount);

        await sleep(50); // wait until tx is indexed
        const txDetails = await new RestClient(enigmad.endpoint).txsById(result.transactionHash);
        posted = {
          sender: faucet.address,
          recipient: recipient,
          hash: result.transactionHash,
          height: Number.parseInt(txDetails.height, 10),
          tx: txDetails,
        };
      }
    });

    it("can query transactions by height", async () => {
      pendingWithoutEnigmad();
      assert(posted);
      const client = new RestClient(enigmad.endpoint);
      const result = await client.txsQuery(`tx.height=${posted.height}&limit=26`);
      expect(parseInt(result.count, 10)).toEqual(1);
      expect(parseInt(result.limit, 10)).toEqual(26);
      expect(parseInt(result.page_number, 10)).toEqual(1);
      expect(parseInt(result.page_total, 10)).toEqual(1);
      expect(parseInt(result.total_count, 10)).toEqual(1);
      expect(result.txs).toEqual([posted.tx]);
    });

    it("can query transactions by ID", async () => {
      pendingWithoutEnigmad();
      assert(posted);
      const client = new RestClient(enigmad.endpoint);
      const result = await client.txsQuery(`tx.hash=${posted.hash}&limit=26`);
      expect(parseInt(result.count, 10)).toEqual(1);
      expect(parseInt(result.limit, 10)).toEqual(26);
      expect(parseInt(result.page_number, 10)).toEqual(1);
      expect(parseInt(result.page_total, 10)).toEqual(1);
      expect(parseInt(result.total_count, 10)).toEqual(1);
      expect(result.txs).toEqual([posted.tx]);
    });

    it("can query transactions by sender", async () => {
      pendingWithoutEnigmad();
      assert(posted);
      const client = new RestClient(enigmad.endpoint);
      const result = await client.txsQuery(`message.sender=${posted.sender}&limit=200`);
      expect(parseInt(result.count, 10)).toBeGreaterThanOrEqual(1);
      expect(parseInt(result.limit, 10)).toEqual(200);
      expect(parseInt(result.page_number, 10)).toEqual(1);
      expect(parseInt(result.page_total, 10)).toEqual(1);
      expect(parseInt(result.total_count, 10)).toBeGreaterThanOrEqual(1);
      expect(result.txs.length).toBeGreaterThanOrEqual(1);
      expect(result.txs[result.txs.length - 1]).toEqual(posted.tx);
    });

    it("can query transactions by recipient", async () => {
      pendingWithoutEnigmad();
      assert(posted);
      const client = new RestClient(enigmd.endpoint);
      const result = await client.txsQuery(`transfer.recipient=${posted.recipient}&limit=200`);
      expect(parseInt(result.count, 10)).toEqual(1);
      expect(parseInt(result.limit, 10)).toEqual(200);
      expect(parseInt(result.page_number, 10)).toEqual(1);
      expect(parseInt(result.page_total, 10)).toEqual(1);
      expect(parseInt(result.total_count, 10)).toEqual(1);
      expect(result.txs.length).toBeGreaterThanOrEqual(1);
      expect(result.txs[result.txs.length - 1]).toEqual(posted.tx);
    });

    it("can filter by tx.hash and tx.minheight", async () => {
      pending("This combination is broken 🤷‍♂️. Handle client-side at higher level.");
      pendingWithoutEnigmad();
      assert(posted);
      const client = new RestClient(enigmad.endpoint);
      const hashQuery = `tx.hash=${posted.hash}`;

      {
        const { count } = await client.txsQuery(`${hashQuery}&tx.minheight=0`);
        expect(count).toEqual("1");
      }

      {
        const { count } = await client.txsQuery(`${hashQuery}&tx.minheight=${posted.height - 1}`);
        expect(count).toEqual("1");
      }

      {
        const { count } = await client.txsQuery(`${hashQuery}&tx.minheight=${posted.height}`);
        expect(count).toEqual("1");
      }

      {
        const { count } = await client.txsQuery(`${hashQuery}&tx.minheight=${posted.height + 1}`);
        expect(count).toEqual("0");
      }
    });

    it("can filter by recipient and tx.minheight", async () => {
      pendingWithoutEnigmad();
      assert(posted);
      const client = new RestClient(enigmad.endpoint);
      const recipientQuery = `transfer.recipient=${posted.recipient}`;

      {
        const { count } = await client.txsQuery(`${recipientQuery}&tx.minheight=0`);
        expect(count).toEqual("1");
      }

      {
        const { count } = await client.txsQuery(`${recipientQuery}&tx.minheight=${posted.height - 1}`);
        expect(count).toEqual("1");
      }

      {
        const { count } = await client.txsQuery(`${recipientQuery}&tx.minheight=${posted.height}`);
        expect(count).toEqual("1");
      }

      {
        const { count } = await client.txsQuery(`${recipientQuery}&tx.minheight=${posted.height + 1}`);
        expect(count).toEqual("0");
      }
    });

    it("can filter by recipient and tx.maxheight", async () => {
      pendingWithoutEnigmad();
      assert(posted);
      const client = new RestClient(enigmad.endpoint);
      const recipientQuery = `transfer.recipient=${posted.recipient}`;

      {
        const { count } = await client.txsQuery(`${recipientQuery}&tx.maxheight=9999999999999`);
        expect(count).toEqual("1");
      }

      {
        const { count } = await client.txsQuery(`${recipientQuery}&tx.maxheight=${posted.height + 1}`);
        expect(count).toEqual("1");
      }

      {
        const { count } = await client.txsQuery(`${recipientQuery}&tx.maxheight=${posted.height}`);
        expect(count).toEqual("1");
      }

      {
        const { count } = await client.txsQuery(`${recipientQuery}&tx.maxheight=${posted.height - 1}`);
        expect(count).toEqual("0");
      }
    });

    it("can query by tags (module + code_id)", async () => {
      pendingWithoutEnigmad();
      assert(posted);
      const client = new RestClient(enigmad.endpoint);
      const result = await client.txsQuery(`message.module=compute&message.code_id=${deployedErc20.codeId}`);
      expect(parseInt(result.count, 10)).toBeGreaterThanOrEqual(4);

      // Check first 4 results
      const [store, hash, isa, jade] = result.txs.map(tx => fromOneElementArray(tx.tx.value.msg));
      assert(isMsgStoreCode(store));
      assert(isMsgInstantiateContract(hash));
      assert(isMsgInstantiateContract(isa));
      assert(isMsgInstantiateContract(jade));
      expect(store.value).toEqual(
        jasmine.objectContaining({
          sender: faucet.address,
          source: deployedErc20.source,
          builder: deployedErc20.builder,
        }),
      );
      expect(hash.value).toEqual({
        code_id: deployedErc20.codeId.toString(),
        init_funds: [],
        init_msg: jasmine.objectContaining({
          symbol: "HASH",
        }),
        label: "HASH",
        sender: faucet.address,
      });
      expect(isa.value).toEqual({
        code_id: deployedErc20.codeId.toString(),
        init_funds: [],
        init_msg: jasmine.objectContaining({ symbol: "ISA" }),
        label: "ISA",
        sender: faucet.address,
      });
      expect(jade.value).toEqual({
        code_id: deployedErc20.codeId.toString(),
        init_funds: [],
        init_msg: jasmine.objectContaining({ symbol: "JADE" }),
        label: "JADE",
        sender: faucet.address,
      });
    });

    // Like previous test but filtered by message.action=store-code and message.action=instantiate
    it("can query by tags (module + code_id + action)", async () => {
      pendingWithoutEnigmad();
      assert(posted);
      const client = new RestClient(enigmad.endpoint);

      {
        const uploads = await client.txsQuery(
          `message.module=compute&message.code_id=${deployedErc20.codeId}&message.action=store-code`,
        );
        expect(parseInt(uploads.count, 10)).toEqual(1);
        const store = fromOneElementArray(uploads.txs[0].tx.value.msg);
        assert(isMsgStoreCode(store));
        expect(store.value).toEqual(
          jasmine.objectContaining({
            sender: faucet.address,
            source: deployedErc20.source,
            builder: deployedErc20.builder,
          }),
        );
      }

      {
        const instantiations = await client.txsQuery(
          `message.module=compute&message.code_id=${deployedErc20.codeId}&message.action=instantiate`,
        );
        expect(parseInt(instantiations.count, 10)).toBeGreaterThanOrEqual(3);
        const [hash, isa, jade] = instantiations.txs.map(tx => fromOneElementArray(tx.tx.value.msg));
        assert(isMsgInstantiateContract(hash));
        assert(isMsgInstantiateContract(isa));
        assert(isMsgInstantiateContract(jade));
        expect(hash.value).toEqual({
          code_id: deployedErc20.codeId.toString(),
          init_funds: [],
          init_msg: jasmine.objectContaining({
            symbol: "HASH",
          }),
          label: "HASH",
          sender: faucet.address,
        });
        expect(isa.value).toEqual({
          code_id: deployedErc20.codeId.toString(),
          init_funds: [],
          init_msg: jasmine.objectContaining({ symbol: "ISA" }),
          label: "ISA",
          sender: faucet.address,
        });
        expect(jade.value).toEqual({
          code_id: deployedErc20.codeId.toString(),
          init_funds: [],
          init_msg: jasmine.objectContaining({ symbol: "JADE" }),
          label: "JADE",
          sender: faucet.address,
        });
      }
    });
  });

  describe("encodeTx", () => {
    it("works for enigmachain example", async () => {
      pendingWithoutEnigmad();
      const client = new RestClient(enigmad.endpoint);
      expect(await client.encodeTx(enigmachain.tx)).toEqual(fromBase64(enigmachain.tx_data));
    });
  });

  describe("postTx", () => {
    it("can send tokens", async () => {
      pendingWithoutEnigmad();
      const pen = await Secp256k1Pen.fromMnemonic(faucet.mnemonic);

      const memo = "My first contract on chain";
      const theMsg: MsgSend = {
        type: "cosmos-sdk/MsgSend",
        value: {
          from_address: faucet.address,
          to_address: emptyAddress,
          amount: [
            {
              denom: "uscrt",
              amount: "1234567",
            },
          ],
        },
      };

      const fee: StdFee = {
        amount: [
          {
            amount: "5000",
            denom: "uscrt",
          },
        ],
        gas: "890000",
      };

      const client = new RestClient(enigmad.endpoint);
      const { account_number, sequence } = (await client.authAccounts(faucet.address)).result.value;

      const signBytes = makeSignBytes([theMsg], fee, defaultNetworkId, memo, account_number, sequence);
      const signature = await pen.sign(signBytes);
      const signedTx = makeSignedTx(theMsg, fee, memo, signature);
      const result = await client.postTx(signedTx);
      // console.log("Raw log:", result.raw_log);
      expect(result.code).toBeFalsy();
    });

    it("can upload, instantiate and execute wasm", async () => {
      pendingWithoutEnigmad();
      const pen = await Secp256k1Pen.fromMnemonic(faucet.mnemonic);
      const client = new RestClient(enigmad.endpoint);

      const transferAmount: readonly Coin[] = [
        {
          amount: "1234",
          denom: "ucosm",
        },
        {
          amount: "321",
          denom: "uscrt",
        },
      ];
      const beneficiaryAddress = makeRandomAddress();

      let codeId: number;

      // upload
      {
        // console.log("Raw log:", result.raw_log);
        const result = await uploadContract(client, pen);
        expect(result.code).toBeFalsy();
        const logs = parseLogs(result.logs);
        const codeIdAttr = findAttribute(logs, "message", "code_id");
        codeId = Number.parseInt(codeIdAttr.value, 10);
        expect(codeId).toBeGreaterThanOrEqual(1);
        expect(codeId).toBeLessThanOrEqual(200);
      }

      let contractAddress: string;

      // instantiate
      {
        const result = await instantiateContract(client, pen, codeId, beneficiaryAddress, transferAmount);
        expect(result.code).toBeFalsy();
        // console.log("Raw log:", result.raw_log);
        const logs = parseLogs(result.logs);
        const contractAddressAttr = findAttribute(logs, "message", "contract_address");
        contractAddress = contractAddressAttr.value;
        const amountAttr = findAttribute(logs, "transfer", "amount");
        expect(amountAttr.value).toEqual("1234ucosm,321uscrt");

        const balance = (await client.authAccounts(contractAddress)).result.value.coins;
        expect(balance).toEqual(transferAmount);
      }

      // execute
      {
        const result = await executeContract(client, pen, contractAddress);
        expect(result.code).toBeFalsy();
        // console.log("Raw log:", result.logs);
        const logs = parseLogs(result.logs);
        const computeEvent = logs.find(() => true)?.events.find(e => e.type === "compute");
        assert(computeEvent, "Event of type compute expected");
        expect(computeEvent.attributes).toContain({ key: "action", value: "release" });
        expect(computeEvent.attributes).toContain({
          key: "destination",
          value: beneficiaryAddress,
        });

        // Verify token transfer from contract to beneficiary
        const beneficiaryBalance = (await client.authAccounts(beneficiaryAddress)).result.value.coins;
        expect(beneficiaryBalance).toEqual(transferAmount);
        const contractBalance = (await client.authAccounts(contractAddress)).result.value.coins;
        expect(contractBalance).toEqual([]);
      }
    });
  });

  // The /compute endpoints

  describe("query", () => {
    it("can list upload code", async () => {
      pendingWithoutEnigmad();
      const pen = await Secp256k1Pen.fromMnemonic(faucet.mnemonic);
      const client = new RestClient(enigmad.endpoint);

      // check with contracts were here first to compare
      const existingInfos = await client.listCodeInfo();
      existingInfos.forEach((val, idx) => expect(val.id).toEqual(idx + 1));
      const numExisting = existingInfos.length;

      // upload data
      const computeCode = getHackatom();
      const result = await uploadCustomContract(client, pen, computeCode);
      expect(result.code).toBeFalsy();
      const logs = parseLogs(result.logs);
      const codeIdAttr = findAttribute(logs, "message", "code_id");
      const codeId = Number.parseInt(codeIdAttr.value, 10);

      // ensure we were added to the end of the list
      const newInfos = await client.listCodeInfo();
      expect(newInfos.length).toEqual(numExisting + 1);
      const lastInfo = newInfos[newInfos.length - 1];
      expect(lastInfo.id).toEqual(codeId);
      expect(lastInfo.creator).toEqual(faucet.address);

      // ensure metadata is present
      expect(lastInfo.source).toEqual(
        "https://github.com/confio/cosmwasm/raw/0.7/lib/vm/testdata/contract_0.6.wasm",
      );
      expect(lastInfo.builder).toEqual("confio/cosmwasm-opt:0.6.2");

      // check code hash matches expectation
      const computeHash = new Sha256(computeCode).digest();
      expect(lastInfo.data_hash.toLowerCase()).toEqual(toHex(computeHash));

      // download code and check against auto-gen
      const { data } = await client.getCode(codeId);
      expect(fromBase64(data)).toEqual(computeCode);
    });

    it("can list contracts and get info", async () => {
      pendingWithoutEnigmad();
      const pen = await Secp256k1Pen.fromMnemonic(faucet.mnemonic);
      const client = new RestClient(enigmad.endpoint);
      const beneficiaryAddress = makeRandomAddress();
      const transferAmount: readonly Coin[] = [
        {
          amount: "707707",
          denom: "uscrt",
        },
      ];

      // reuse an existing contract, or upload if needed
      let codeId: number;
      const existingInfos = await client.listCodeInfo();
      if (existingInfos.length > 0) {
        codeId = existingInfos[existingInfos.length - 1].id;
      } else {
        const uploadResult = await uploadContract(client, pen);
        expect(uploadResult.code).toBeFalsy();
        const uploadLogs = parseLogs(uploadResult.logs);
        const codeIdAttr = findAttribute(uploadLogs, "message", "code_id");
        codeId = Number.parseInt(codeIdAttr.value, 10);
      }

      // create new instance and compare before and after
      const existingContractsByCode = await client.listContractsByCodeId(codeId);
      for (const contract of existingContractsByCode) {
        expect(contract.address).toMatch(bech32AddressMatcher);
        expect(contract.code_id).toEqual(codeId);
        expect(contract.creator).toMatch(bech32AddressMatcher);
        expect(contract.label).toMatch(/^.+$/);
      }

      const result = await instantiateContract(client, pen, codeId, beneficiaryAddress, transferAmount);
      expect(result.code).toBeFalsy();
      const logs = parseLogs(result.logs);
      const contractAddressAttr = findAttribute(logs, "message", "contract_address");
      const myAddress = contractAddressAttr.value;

      const newContractsByCode = await client.listContractsByCodeId(codeId);
      expect(newContractsByCode.length).toEqual(existingContractsByCode.length + 1);
      const newContract = newContractsByCode[newContractsByCode.length - 1];
      expect(newContract).toEqual(
        jasmine.objectContaining({
          code_id: codeId,
          creator: faucet.address,
          label: "my escrow",
        }),
      );

      // check out info
      const myInfo = await client.getContractInfo(myAddress);
      assert(myInfo);
      expect(myInfo.code_id).toEqual(codeId);
      expect(myInfo.creator).toEqual(faucet.address);
      expect((myInfo.init_msg as any).beneficiary).toEqual(beneficiaryAddress);

      // make sure random addresses don't give useful info
      const nonExistentAddress = makeRandomAddress();
      expect(await client.getContractInfo(nonExistentAddress)).toBeNull();
    });

    describe("contract state", () => {
      const client = new RestClient(enigmad.endpoint);
      const noContract = makeRandomAddress();
      const expectedKey = toAscii("config");
      let contractAddress: string | undefined;

      beforeAll(async () => {
        if (enigmadEnabled()) {
          const pen = await Secp256k1Pen.fromMnemonic(faucet.mnemonic);
          const uploadResult = await uploadContract(client, pen);
          assert(!uploadResult.code);
          const uploadLogs = parseLogs(uploadResult.logs);
          const codeId = Number.parseInt(findAttribute(uploadLogs, "message", "code_id").value, 10);
          const instantiateResult = await instantiateContract(client, pen, codeId, makeRandomAddress());
          assert(!instantiateResult.code);
          const instantiateLogs = parseLogs(instantiateResult.logs);
          const contractAddressAttr = findAttribute(instantiateLogs, "message", "contract_address");
          contractAddress = contractAddressAttr.value;
        }
      });

      it("can get all state", async () => {
        pendingWithoutEnigmad();

        // get contract state
        const state = await client.getAllContractState(contractAddress!);
        expect(state.length).toEqual(1);
        const data = state[0];
        expect(data.key).toEqual(expectedKey);
        const value = JSON.parse(fromAscii(data.val));
        expect(value.verifier).toBeDefined();
        expect(value.beneficiary).toBeDefined();

        // bad address is empty array
        const noContractState = await client.getAllContractState(noContract);
        expect(noContractState).toEqual([]);
      });

      it("can query by key", async () => {
        pendingWithoutEnigmad();

        // query by one key
        const raw = await client.queryContractRaw(contractAddress!, expectedKey);
        assert(raw, "must get result");
        const model = JSON.parse(fromAscii(raw));
        expect(model.verifier).toBeDefined();
        expect(model.beneficiary).toBeDefined();

        // missing key is null
        const missing = await client.queryContractRaw(contractAddress!, fromHex("cafe0dad"));
        expect(missing).toBeNull();

        // bad address is null
        const noContractModel = await client.queryContractRaw(noContract, expectedKey);
        expect(noContractModel).toBeNull();
      });

      it("can make smart queries", async () => {
        pendingWithoutEnigmad();

        // we can query the verifier properly
        const verifier = await client.queryContractSmart(contractAddress!, { verifier: {} });
        expect(fromAscii(verifier)).toEqual(faucet.address);

        // invalid query syntax throws an error
        await client.queryContractSmart(contractAddress!, { nosuchkey: {} }).then(
          () => fail("shouldn't succeed"),
          error => expect(error).toMatch("Error parsing QueryMsg"),
        );

        // invalid address throws an error
        await client.queryContractSmart(noContract, { verifier: {} }).then(
          () => fail("shouldn't succeed"),
          error => expect(error).toMatch("not found"),
        );
      });
    });
  });
});
