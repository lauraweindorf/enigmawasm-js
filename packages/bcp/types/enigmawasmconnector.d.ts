import { ChainConnector, ChainId } from "@iov/bcp";
import { EnigmaWasmConnection, TokenConfiguration } from "./enigmawasmconnection";
/**
 * A helper to connect to a cosmos-based chain at a given url
 */
export declare function createEnigmaWasmConnector(
  url: string,
  addressPrefix: string,
  tokenConfig: TokenConfiguration,
  expectedChainId?: ChainId,
): ChainConnector<EnigmaWasmConnection>;
