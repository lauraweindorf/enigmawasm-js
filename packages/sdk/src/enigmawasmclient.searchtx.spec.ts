/* eslint-disable @typescript-eslint/camelcase */
import { assert, sleep } from "@iov/utils";

import { EnigmaWasmClient } from "./enigmawasmclient";
import { Secp256k1Pen } from "./pen";
import { RestClient } from "./restclient";
import { SigningEnigmaWasmClient } from "./signingenigmawasmclient";
import {
  deployedErc20,
  faucet,
  fromOneElementArray,
  makeRandomAddress,
  pendingWithoutEnigmad,
  enigmad,
  enigmadEnabled,
} from "./testutils.spec";
import { Coin, CosmosSdkTx, isMsgExecuteContract, isMsgInstantiateContract, isMsgSend } from "./types";

describe("EnigmaWasmClient.searchTx", () => {
  let postedSend:
    | {
        readonly sender: string;
        readonly recipient: string;
        readonly hash: string;
        readonly height: number;
        readonly tx: CosmosSdkTx;
      }
    | undefined;
  let postedExecute:
    | {
        readonly sender: string;
        readonly contract: string;
        readonly hash: string;
        readonly height: number;
        readonly tx: CosmosSdkTx;
      }
    | undefined;

  beforeAll(async () => {
    if (wasmdEnabled()) {
      const pen = await Secp256k1Pen.fromMnemonic(faucet.mnemonic);
      const client = new SigningEnigmaWasmClient(enigmad.endpoint, faucet.address, signBytes =>
        pen.sign(signBytes),
      );

      {
        const recipient = makeRandomAddress();
        const transferAmount: Coin = {
          denom: "uscrt",
          amount: "1234567",
        };
        const result = await client.sendTokens(recipient, [transferAmount]);
        await sleep(50); // wait until tx is indexed
        const txDetails = await new RestClient(enigmad.endpoint).txsById(result.transactionHash);
        postedSend = {
          sender: faucet.address,
          recipient: recipient,
          hash: result.transactionHash,
          height: Number.parseInt(txDetails.height, 10),
          tx: txDetails.tx,
        };
      }

      {
        const hashInstance = deployedErc20.instances[0];
        const msg = {
          approve: {
            spender: makeRandomAddress(),
            amount: "12",
          },
        };
        const result = await client.execute(hashInstance, msg);
        await sleep(50); // wait until tx is indexed
        const txDetails = await new RestClient(enigmad.endpoint).txsById(result.transactionHash);
        postedExecute = {
          sender: faucet.address,
          contract: hashInstance,
          hash: result.transactionHash,
          height: Number.parseInt(txDetails.height, 10),
          tx: txDetails.tx,
        };
      }
    }
  });

  describe("with SearchByIdQuery", () => {
    it("can search by ID", async () => {
      pendingWithoutEnigmad();
      assert(postedSend, "value must be set in beforeAll()");
      const client = new EnigmaWasmClient(enigmad.endpoint);
      const result = await client.searchTx({ id: postedSend.hash });
      expect(result.length).toEqual(1);
      expect(result[0]).toEqual(
        jasmine.objectContaining({
          height: postedSend.height,
          hash: postedSend.hash,
          tx: postedSend.tx,
        }),
      );
    });

    it("can search by ID (non existent)", async () => {
      pendingWithoutEnigmad();
      const client = new EnigmaWasmClient(enigmad.endpoint);
      const nonExistentId = "0000000000000000000000000000000000000000000000000000000000000000";
      const result = await client.searchTx({ id: nonExistentId });
      expect(result.length).toEqual(0);
    });

    it("can search by ID and filter by minHeight", async () => {
      pendingWithoutEnigmad();
      assert(postedSend);
      const client = new EnigmaWasmClient(enigmad.endpoint);
      const query = { id: postedSend.hash };

      {
        const result = await client.searchTx(query, { minHeight: 0 });
        expect(result.length).toEqual(1);
      }

      {
        const result = await client.searchTx(query, { minHeight: postedSend.height - 1 });
        expect(result.length).toEqual(1);
      }

      {
        const result = await client.searchTx(query, { minHeight: postedSend.height });
        expect(result.length).toEqual(1);
      }

      {
        const result = await client.searchTx(query, { minHeight: postedSend.height + 1 });
        expect(result.length).toEqual(0);
      }
    });
  });

  describe("with SearchByHeightQuery", () => {
    it("can search by height", async () => {
      pendingWithoutEnigmad();
      assert(postedSend, "value must be set in beforeAll()");
      const client = new EnigmaWasmClient(enigmad.endpoint);
      const result = await client.searchTx({ height: postedSend.height });
      expect(result.length).toEqual(1);
      expect(result[0]).toEqual(
        jasmine.objectContaining({
          height: postedSend.height,
          hash: postedSend.hash,
          tx: postedSend.tx,
        }),
      );
    });
  });

  describe("with SearchBySentFromOrToQuery", () => {
    it("can search by sender", async () => {
      pendingWithoutEnigmad();
      assert(postedSend, "value must be set in beforeAll()");
      const client = new EnigmaWasmClient(enigmad.endpoint);
      const results = await client.searchTx({ sentFromOrTo: postedSend.sender });
      expect(results.length).toBeGreaterThanOrEqual(1);

      // Check basic structure of all results
      for (const result of results) {
        const msg = fromOneElementArray(result.tx.value.msg);
        assert(isMsgSend(msg), `${result.hash} (height ${result.height}) is not a bank send transaction`);
        expect(
          msg.value.to_address === postedSend.sender || msg.value.from_address == postedSend.sender,
        ).toEqual(true);
      }

      // Check details of most recent result
      expect(results[results.length - 1]).toEqual(
        jasmine.objectContaining({
          height: postedSend.height,
          hash: postedSend.hash,
          tx: postedSend.tx,
        }),
      );
    });

    it("can search by recipient", async () => {
      pendingWithoutEnigmad();
      assert(postedSend, "value must be set in beforeAll()");
      const client = new EnigmaWasmClient(enigmad.endpoint);
      const results = await client.searchTx({ sentFromOrTo: postedSend.recipient });
      expect(results.length).toBeGreaterThanOrEqual(1);

      // Check basic structure of all results
      for (const result of results) {
        const msg = fromOneElementArray(result.tx.value.msg);
        assert(isMsgSend(msg), `${result.hash} (height ${result.height}) is not a bank send transaction`);
        expect(
          msg.value.to_address === postedSend.recipient || msg.value.from_address == postedSend.recipient,
        ).toEqual(true);
      }

      // Check details of most recent result
      expect(results[results.length - 1]).toEqual(
        jasmine.objectContaining({
          height: postedSend.height,
          hash: postedSend.hash,
          tx: postedSend.tx,
        }),
      );
    });

    it("can search by recipient and filter by minHeight", async () => {
      pendingWithoutEnigmad();
      assert(postedSend);
      const client = new EnigmaWasmClient(enigmad.endpoint);
      const query = { sentFromOrTo: postedSend.recipient };

      {
        const result = await client.searchTx(query, { minHeight: 0 });
        expect(result.length).toEqual(1);
      }

      {
        const result = await client.searchTx(query, { minHeight: postedSend.height - 1 });
        expect(result.length).toEqual(1);
      }

      {
        const result = await client.searchTx(query, { minHeight: postedSend.height });
        expect(result.length).toEqual(1);
      }

      {
        const result = await client.searchTx(query, { minHeight: postedSend.height + 1 });
        expect(result.length).toEqual(0);
      }
    });

    it("can search by recipient and filter by maxHeight", async () => {
      pendingWithoutEnigmad();
      assert(postedSend);
      const client = new EnigmaWasmClient(enigmad.endpoint);
      const query = { sentFromOrTo: postedSend.recipient };

      {
        const result = await client.searchTx(query, { maxHeight: 9999999999999 });
        expect(result.length).toEqual(1);
      }

      {
        const result = await client.searchTx(query, { maxHeight: postedSend.height + 1 });
        expect(result.length).toEqual(1);
      }

      {
        const result = await client.searchTx(query, { maxHeight: postedSend.height });
        expect(result.length).toEqual(1);
      }

      {
        const result = await client.searchTx(query, { maxHeight: postedSend.height - 1 });
        expect(result.length).toEqual(0);
      }
    });
  });

  describe("with SearchByTagsQuery", () => {
    it("can search by transfer.recipient", async () => {
      pendingWithoutEnigmad();
      assert(postedSend, "value must be set in beforeAll()");
      const client = new EnigmaWasmClient(.endpoint);
      const results = await client.searchTx({
        tags: [{ key: "transfer.recipient", value: postedSend.recipient }],
      });
      expect(results.length).toBeGreaterThanOrEqual(1);

      // Check basic structure of all results
      for (const result of results) {
        const msg = fromOneElementArray(result.tx.value.msg);
        assert(isMsgSend(msg), `${result.hash} (height ${result.height}) is not a bank send transaction`);
        expect(msg.value.to_address).toEqual(postedSend.recipient);
      }

      // Check details of most recent result
      expect(results[results.length - 1]).toEqual(
        jasmine.objectContaining({
          height: postedSend.height,
          hash: postedSend.hash,
          tx: postedSend.tx,
        }),
      );
    });

    it("can search by message.contract_address", async () => {
      pendingWithoutEnigmad();
      assert(postedExecute, "value must be set in beforeAll()");
      const client = new EnigmaWasmClient(enigmad.endpoint);
      const results = await client.searchTx({
        tags: [{ key: "message.contract_address", value: postedExecute.contract }],
      });
      expect(results.length).toBeGreaterThanOrEqual(1);

      // Check basic structure of all results
      for (const result of results) {
        const msg = fromOneElementArray(result.tx.value.msg);
        assert(
          isMsgExecuteContract(msg) || isMsgInstantiateContract(msg),
          `${result.hash} (at ${result.height}) not an execute or instantiate msg`,
        );
      }

      // Check that the first result is the instantiation
      const first = fromOneElementArray(results[0].tx.value.msg);
      assert(isMsgInstantiateContract(first), "First contract search result must be an instantiation");
      expect(first).toEqual({
        type: "compute/instantiate",
        value: {
          sender: faucet.address,
          code_id: deployedErc20.codeId.toString(),
          label: "HASH",
          init_msg: jasmine.objectContaining({ symbol: "HASH" }),
          init_funds: [],
        },
      });

      // Check details of most recent result
      expect(results[results.length - 1]).toEqual(
        jasmine.objectContaining({
          height: postedExecute.height,
          hash: postedExecute.hash,
          tx: postedExecute.tx,
        }),
      );
    });

    it("can search by message.contract_address + message.action", async () => {
      pendingWithoutEnigmad();
      assert(postedExecute, "value must be set in beforeAll()");
      const client = new EnigmaWasmClient(enigmad.endpoint);
      const results = await client.searchTx({
        tags: [
          { key: "message.contract_address", value: postedExecute.contract },
          { key: "message.action", value: "execute" },
        ],
      });
      expect(results.length).toBeGreaterThanOrEqual(1);

      // Check basic structure of all results
      for (const result of results) {
        const msg = fromOneElementArray(result.tx.value.msg);
        assert(isMsgExecuteContract(msg), `${result.hash} (at ${result.height}) not an execute msg`);
        expect(msg.value.contract).toEqual(postedExecute.contract);
      }

      // Check details of most recent result
      expect(results[results.length - 1]).toEqual(
        jasmine.objectContaining({
          height: postedExecute.height,
          hash: postedExecute.hash,
          tx: postedExecute.tx,
        }),
      );
    });
  });
});
