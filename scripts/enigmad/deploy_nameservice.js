#!/usr/bin/env node

/* eslint-disable @typescript-eslint/camelcase */
const { SigningEnigmaWasmClient, Secp256k1Pen } = require("@laura/enigmawasm/sdk");
const fs = require("fs");

const httpUrl = "http://localhost:1317";
const faucet = {
  mnemonic:
    "economy stock theory fatal elder harbor betray wasp final emotion task crumble siren bottom lizard educate guess current outdoor pair theory focus wife stone",
  address: "enigma1pkptre7fdkl6gfrzlesjjvhxhlc3r4gmmk8rs6",
};

const codeMeta = {
  source: "https://crates.io/api/v1/crates/cw-nameservice/0.2.0/download",
  builder: "confio/cosmwasm-opt:0.7.0",
};

const free = {
  label: "Free",
  initMsg: {},
};

const luxury = {
  label: "Luxury",
  initMsg: {
    purchase_price: {
      denom: "uscrt",
      amount: "2000000",
    },
    transfer_price: {
      denom: "uscrt",
      amount: "1000000",
    },
  },
};

async function main() {
  const pen = await Secp256k1Pen.fromMnemonic(faucet.mnemonic);
  const client = new SigningEnigmaWasmClient(httpUrl, faucet.address, signBytes => pen.sign(signBytes));

  const wasm = fs.readFileSync(__dirname + "/contracts/cw-nameservice.wasm");
  const uploadReceipt = await client.upload(wasm, codeMeta, "Upload Name Service code");
  console.info(`Upload succeeded. Receipt: ${JSON.stringify(uploadReceipt)}`);

  for (const { label, initMsg } of [free, luxury]) {
    const memo = `Create an nameservice instance "${label}"`;
    const { contractAddress } = await client.instantiate(uploadReceipt.codeId, initMsg, label, memo);
    console.info(`Contract "${label}" instantiated at ${contractAddress}`);
  }
}

main().then(
  () => {
    console.info("Done deploying nameservice instances.");
    process.exit(0);
  },
  error => {
    console.error(error);
    process.exit(1);
  },
);
