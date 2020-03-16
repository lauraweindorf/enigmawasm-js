/* eslint-disable @typescript-eslint/camelcase */
import { Sha256 } from "@iov/crypto";
import { Bech32, Encoding } from "@iov/encoding";
import { assert, sleep } from "@iov/utils";
import { ReadonlyDate } from "readonly-date";

import { Code, EnigmaWasmClient, PrivateEnigmaWasmClient } from "./enigmawasmclient";
import { makeSignBytes } from "./encoding";
import { findAttribute } from "./logs";
import { Secp256k1Pen } from "./pen";
import { SigningEnigmaWasmClient } from "./signingenigmawasmclient";
import enigmachain from "./testdata/enigmachain.json";
import {
  deployedErc20,
  faucet,
  getHackatom,
  makeRandomAddress,
  pendingWithoutWasmd,
  tendermintIdMatcher,
  enigmad,
  enigmadEnabled,
} from "./testutils.spec";
import { MsgSend, StdFee } from "./types";

const { fromAscii, fromHex, fromUtf8, toAscii, toBase64 } = Encoding;

const unused = {
  address: "enigma1cjsxept9rkggzxztslae9ndgpdyt2408lk850u",
};

const guest = {
  address: "enigma17d0jcz59jf68g52vq38tuuncmwwjk42u6mcxej",
};

interface HackatomInstance {
  readonly initMsg: {
    readonly verifier: string;
    readonly beneficiary: string;
  };
  readonly address: string;
}

describe("EnigmaWasmClient", () => {
  describe("makeReadOnly", () => {
    it("can be constructed", () => {
      const client = new EnigmaWasmClient(enigmad.endpoint);
      expect(client).toBeTruthy();
    });
  });

  describe("getChainId", () => {
    it("works", async () => {
      pendingWithoutEnigmd();
      const client = new EnigmaWasmClient(enigmad.endpoint);
      expect(await client.getChainId()).toEqual(enigmad.expectedChainId);
    });

    it("caches chain ID", async () => {
      pendingWithoutEnigmad();
      const client = new EnigmaWasmClient(enigmad.endpoint);
      const openedClient = (client as unknown) as PrivateEnigmaWasmClient;
      const getCodeSpy = spyOn(openedClient.restClient, "nodeInfo").and.callThrough();

      expect(await client.getChainId()).toEqual(enigmad.expectedChainId); // from network
      expect(await client.getChainId()).toEqual(enigmad.expectedChainId); // from cache

      expect(getCodeSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("getHeight", () => {
    it("gets height via last block", async () => {
      pendingWithoutEnigmad();
      const client = new EnigmaWasmClient(enigmad.endpoint);
      const openedClient = (client as unknown) as PrivateEnigmaWasmClient;
      const blockLatestSpy = spyOn(openedClient.restClient, "blocksLatest").and.callThrough();

      const height1 = await client.getHeight();
      expect(height1).toBeGreaterThan(0);
      await sleep(1_000);
      const height2 = await client.getHeight();
      expect(height2).toEqual(height1 + 1);

      expect(blockLatestSpy).toHaveBeenCalledTimes(2);
    });

    it("gets height via authAccount once an address is known", async () => {
      pendingWithoutEnigmad();
      const client = new EnigmaWasmClient(enigmad.endpoint);

      const openedClient = (client as unknown) as PrivateEnigmaWasmClient;
      const blockLatestSpy = spyOn(openedClient.restClient, "blocksLatest").and.callThrough();
      const authAccountsSpy = spyOn(openedClient.restClient, "authAccounts").and.callThrough();

      const height1 = await client.getHeight();
      expect(height1).toBeGreaterThan(0);

      await client.getCodes(); // warm up the client

      const height2 = await client.getHeight();
      expect(height2).toBeGreaterThan(0);
      await sleep(1_000);
      const height3 = await client.getHeight();
      expect(height3).toEqual(height2 + 1);

      expect(blockLatestSpy).toHaveBeenCalledTimes(1);
      expect(authAccountsSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe("getNonce", () => {
    it("works", async () => {
      pendingWithoutEnigmad();
      const client = new EnigmaWasmClient(enigmad.endpoint);
      expect(await client.getNonce(unused.address)).toEqual({
        accountNumber: 5,
        sequence: 0,
      });
    });

    it("throws for missing accounts", async () => {
      pendingWithoutEnigmad();
      const client = new EnigmaWasmClient(enigmad.endpoint);
      const missing = makeRandomAddress();
      await client.getNonce(missing).then(
        () => fail("this must not succeed"),
        error => expect(error).toMatch(/account does not exist on chain/i),
      );
    });
  });

  describe("getAccount", () => {
    it("works", async () => {
      pendingWithoutEnigmad();
      const client = new EnigmaWasmClient(enigmad.endpoint);
      expect(await client.getAccount(unused.address)).toEqual({
        address: unused.address,
        accountNumber: 5,
        sequence: 0,
        pubkey: undefined,
        balance: [
          { denom: "ucosm", amount: "1000000000" },
          { denom: "ustake", amount: "1000000000" },
        ],
      });
    });

    it("returns undefined for missing accounts", async () => {
      pendingWithoutEnigmad();
      const client = new EnigmaWasmClient(enigmad.endpoint);
      const missing = makeRandomAddress();
      expect(await client.getAccount(missing)).toBeUndefined();
    });
  });

  describe("getBlock", () => {
    it("works for latest block", async () => {
      pendingWithoutEnigmad();
      const client = new EnigmaWasmClient(enigmad.endpoint);
      const response = await client.getBlock();

      // id
      expect(response.id).toMatch(tendermintIdMatcher);

      // header
      expect(response.header.height).toBeGreaterThanOrEqual(1);
      expect(response.header.chainId).toEqual(await client.getChainId());
      expect(new ReadonlyDate(response.header.time).getTime()).toBeLessThan(ReadonlyDate.now());
      expect(new ReadonlyDate(response.header.time).getTime()).toBeGreaterThanOrEqual(
        ReadonlyDate.now() - 5_000,
      );

      // txs
      expect(Array.isArray(response.txs)).toEqual(true);
    });

    it("works for block by height", async () => {
      pendingWithoutEnigmad();
      const client = new EnigmaWasmClient(enigmad.endpoint);
      const height = (await client.getBlock()).header.height;
      const response = await client.getBlock(height - 1);

      // id
      expect(response.id).toMatch(tendermintIdMatcher);

      // header
      expect(response.header.height).toEqual(height - 1);
      expect(response.header.chainId).toEqual(await client.getChainId());
      expect(new ReadonlyDate(response.header.time).getTime()).toBeLessThan(ReadonlyDate.now());
      expect(new ReadonlyDate(response.header.time).getTime()).toBeGreaterThanOrEqual(
        ReadonlyDate.now() - 5_000,
      );

      // txs
      expect(Array.isArray(response.txs)).toEqual(true);
    });
  });

  describe("getIdentifier", () => {
    it("works", async () => {
      pendingWithoutEnigmad();
      const client = new EnigmaWasmClient(enigmad.endpoint);
      expect(await client.getIdentifier(enigmablockchain.tx)).toEqual(enigmachain.id);
    });
  });

  describe("postTx", () => {
    it("works", async () => {
      pendingWithoutEnigmad();
      const pen = await Secp256k1Pen.fromMnemonic(faucet.mnemonic);
      const client = new EnigmaWasmClient(enigmad.endpoint);

      const memo = "My first contract on chain";
      const sendMsg: MsgSend = {
        type: "cosmos-sdk/MsgSend",
        value: {
          from_address: faucet.address,
          to_address: makeRandomAddress(),
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

      const chainId = await client.getChainId();
      const { accountNumber, sequence } = await client.getNonce(faucet.address);
      const signBytes = makeSignBytes([sendMsg], fee, chainId, memo, accountNumber, sequence);
      const signature = await pen.sign(signBytes);
      const signedTx = {
        msg: [sendMsg],
        fee: fee,
        memo: memo,
        signatures: [signature],
      };
      const { logs, transactionHash } = await client.postTx(signedTx);
      const amountAttr = findAttribute(logs, "transfer", "amount");
      expect(amountAttr.value).toEqual("1234567uscrt");
      expect(transactionHash).toMatch(/^[0-9A-F]{64}$/);
    });
  });

  describe("getCodes", () => {
    it("works", async () => {
      pendingWithoutEnigmad();
      const client = new EnigmaWasmClient(enigmad.endpoint);
      const result = await client.getCodes();
      expect(result.length).toBeGreaterThanOrEqual(1);
      const [first] = result;
      expect(first).toEqual({
        id: deployedErc20.codeId,
        source: deployedErc20.source,
        builder: deployedErc20.builder,
        checksum: deployedErc20.checksum,
        creator: faucet.address,
      });
    });
  });

  describe("getCodeDetails", () => {
    it("works", async () => {
      pendingWithoutEnigmad();
      const client = new EnigmaWasmClient(enigmad.endpoint);
      const result = await client.getCodeDetails(1);

      const expectedInfo: Code = {
        id: deployedErc20.codeId,
        source: deployedErc20.source,
        builder: deployedErc20.builder,
        checksum: deployedErc20.checksum,
        creator: faucet.address,
      };

      // check info
      expect(result).toEqual(jasmine.objectContaining(expectedInfo));
      // check data
      expect(new Sha256(result.data).digest()).toEqual(fromHex(expectedInfo.checksum));
    });

    it("caches downloads", async () => {
      pendingWithoutEnigmad();
      const client = new EnigmaWasmClient(enigmad.endpoint);
      const openedClient = (client as unknown) as PrivateEnigmaWasmClient;
      const getCodeSpy = spyOn(openedClient.restClient, "getCode").and.callThrough();

      const result1 = await client.getCodeDetails(deployedErc20.codeId); // from network
      const result2 = await client.getCodeDetails(deployedErc20.codeId); // from cache
      expect(result2).toEqual(result1);

      expect(getCodeSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("getContracts", () => {
    it("works", async () => {
      pendingWithoutEnigmad();
      const client = new EnigmaWasmClient(enigmad.endpoint);
      const result = await client.getContracts(1);
      expect(result.length).toBeGreaterThanOrEqual(3);
      const [hash, isa, jade] = result;
      expect(hash).toEqual({
        address: "enigma18vd8fpwxzck93qlwghaj6arh4p7c5n89uzcee5",
        codeId: 1,
        creator: faucet.address,
        label: "HASH",
      });
      expect(isa).toEqual({
        address: "enigma1hqrdl6wstt8qzshwc6mrumpjk9338k0lr4dqxd",
        codeId: 1,
        creator: faucet.address,
        label: "ISA",
      });
      expect(jade).toEqual({
        address: "enigma18r5szma8hm93pvx6lwpjwyxruw27e0k5uw835c",
        codeId: 1,
        creator: faucet.address,
        label: "JADE",
      });
    });
  });

  describe("getContract", () => {
    it("works for HASH instance", async () => {
      pendingWithoutEnigmad();
      const client = new EnigmaWasmClient(enigmad.endpoint);
      const hash = await client.getContract("enigma18vd8fpwxzck93qlwghaj6arh4p7c5n89uzcee5");
      expect(hash).toEqual({
        address: "enigma18vd8fpwxzck93qlwghaj6arh4p7c5n89uzcee5",
        codeId: 1,
        creator: faucet.address,
        label: "HASH",
        initMsg: {
          decimals: 5,
          name: "Hash token",
          symbol: "HASH",
          initial_balances: [
            {
              address: faucet.address,
              amount: "11",
            },
            {
              address: unused.address,
              amount: "12812345",
            },
            {
              address: guest.address,
              amount: "22004000000",
            },
          ],
        },
      });
    });
  });

  describe("queryContractRaw", () => {
    const configKey = toAscii("config");
    const otherKey = toAscii("this_does_not_exist");
    let contract: HackatomInstance | undefined;

    beforeAll(async () => {
      if (wasmdEnabled()) {
        pendingWithoutEnigmad();
        const pen = await Secp256k1Pen.fromMnemonic(faucet.mnemonic);
        const client = new SigningEnigmaWasmClient(enigmad.endpoint, faucet.address, signBytes =>
          pen.sign(signBytes),
        );
        const { codeId } = await client.upload(getHackatom());
        const initMsg = { verifier: makeRandomAddress(), beneficiary: makeRandomAddress() };
        const { contractAddress } = await client.instantiate(codeId, initMsg, "random hackatom");
        contract = { initMsg: initMsg, address: contractAddress };
      }
    });

    it("can query existing key", async () => {
      pendingWithoutEnigmad();
      assert(contract);

      const client = new EnigmaWasmClient(enigmad.endpoint);
      const raw = await client.queryContractRaw(contract.address, configKey);
      assert(raw, "must get result");
      expect(JSON.parse(fromUtf8(raw))).toEqual({
        verifier: toBase64(Bech32.decode(contract.initMsg.verifier).data),
        beneficiary: toBase64(Bech32.decode(contract.initMsg.beneficiary).data),
        funder: toBase64(Bech32.decode(faucet.address).data),
      });
    });

    it("can query non-existent key", async () => {
      pendingWithoutEnigmad();
      assert(contract);

      const client = new EnigmaWasmClient(enigmad.endpoint);
      const raw = await client.queryContractRaw(contract.address, otherKey);
      expect(raw).toBeNull();
    });

    it("errors for non-existent contract", async () => {
      pendingWithoutEnigmad();
      assert(contract);

      const nonExistentAddress = makeRandomAddress();
      const client = new EnigmaWasmClient(enigmad.endpoint);
      await client.queryContractRaw(nonExistentAddress, configKey).then(
        () => fail("must not succeed"),
        error => expect(error).toMatch(`No contract found at address "${nonExistentAddress}"`),
      );
    });
  });

  describe("queryContractSmart", () => {
    let contract: HackatomInstance | undefined;

    beforeAll(async () => {
      if (wasmdEnabled()) {
        pendingWithoutEnigmad();
        const pen = await Secp256k1Pen.fromMnemonic(faucet.mnemonic);
        const client = new SigningEnigmaWasmClient(enigmad.endpoint, faucet.address, signBytes =>
          pen.sign(signBytes),
        );
        const { codeId } = await client.upload(getHackatom());
        const initMsg = { verifier: makeRandomAddress(), beneficiary: makeRandomAddress() };
        const { contractAddress } = await client.instantiate(codeId, initMsg, "a different hackatom");
        contract = { initMsg: initMsg, address: contractAddress };
      }
    });

    it("works", async () => {
      pendingWithoutEnigmad();
      assert(contract);

      const client = new EnigmaWasmClient(enigmad.endpoint);
      const verifier = await client.queryContractSmart(contract.address, { verifier: {} });
      expect(fromAscii(verifier)).toEqual(contract.initMsg.verifier);
    });

    it("errors for malformed query message", async () => {
      pendingWithoutEnigmad();
      assert(contract);

      const client = new EnigmaWasmClient(enigmad.endpoint);
      await client.queryContractSmart(contract.address, { broken: {} }).then(
        () => fail("must not succeed"),
        error => expect(error).toMatch(/Error parsing QueryMsg/i),
      );
    });

    it("errors for non-existent contract", async () => {
      pendingWithoutEnigmad();

      const nonExistentAddress = makeRandomAddress();
      const client = new EnigmaWasmClient(enigmad.endpoint);
      await client.queryContractSmart(nonExistentAddress, { verifier: {} }).then(
        () => fail("must not succeed"),
        error => expect(error).toMatch(`No contract found at address "${nonExistentAddress}"`),
      );
    });
  });
});
