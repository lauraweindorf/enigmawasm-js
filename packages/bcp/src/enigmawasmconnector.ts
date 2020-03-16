import { ChainConnector, ChainId } from "@iov/bcp";

import { EnigmaWasmCodec } from "./enigmawasmcodec";
import { EnigmaWasmConnection, TokenConfiguration } from "./enigmawasmconnection";

/**
 * A helper to connect to a cosmos-based chain at a given url
 */
export function createEnigmaWasmConnector(
  url: string,
  addressPrefix: string,
  tokenConfig: TokenConfiguration,
  expectedChainId?: ChainId,
): ChainConnector<EnigmaWasmConnection> {
  const codec = new EnigmaWasmCodec(addressPrefix, tokenConfig.bankTokens, tokenConfig.erc20Tokens);
  return {
    establishConnection: async () => EnigmaWasmConnection.establish(url, addressPrefix, tokenConfig),
    codec: codec,
    expectedChainId: expectedChainId,
  };
}
