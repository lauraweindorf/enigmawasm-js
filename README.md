# EnigmaWasm JS

(forked from the CosmWasm JS repo)

This is a JavaScript/TypeScript client-side binding to [enigmad](https://github.com/enigmampc/EnigmaBlockchain), a sample blockchain for the [Enigma Blockchain CosmWasm](https://github.com/EnigmaBlockchain/cosmwasm) smart contracting platform.

## Development

Requires Node 10+. For best results, use yarn. The basic commands are:

```sh
# compile the code
yarn build
# run unit tests
yarn test

# format and lint the code
yarn format && yarn lint
```

### Integration tests

To run the entire test suite, you need to run a local blockchain to test against. This should work on any Linux/OSX system with docker installed.

```sh
./scripts/enigmad/start.sh
./scripts/enigmad/init.sh
ENIGMAD_ENABLED=1 yarn test
./scripts/enigmad/stop.sh
```
