#!/usr/bin/env node
import yargs from "yargs";
import "./utils/csv";
import {
  ADDRESS_INDEX,
  DEFAULT_ADDRESS_COUNT,
  DEFAULT_PATH_COUNT,
  DEFAULT_PATH_PREFIX,
  DEFAULT_START,
  PATH_INDEX,
  Scanner
} from "./scanner";
import { Logger } from "./utils/logger";

const VERSION = "0.8.0";

const main = async () => {
  let scanner: Scanner;

  try {
    await yargs(process.argv.slice(2))
      .parserConfiguration({ "parse-numbers": false })
      .scriptName("ledger-scanner")
      .wrap(120)
      .demandCommand()
      .help()
      .version(VERSION)
      .options({
        "provider-url": {
          description: "Web3 provider's URL",
          type: "string",
          default: "http://localhost:8545"
        }
      })
      .middleware(({ providerUrl }) => {
        Logger.info();

        scanner = new Scanner({ providerUrl });
      })
      .command(
        "scan",
        "Scan all addresses",
        {
          path: {
            // eslint-disable-next-line max-len
            description: `Derivation path template. The path template should specify the address index (the "${ADDRESS_INDEX}" component) and the path index (the "${PATH_INDEX}" component). For example ${DEFAULT_PATH_PREFIX} for standard paths`,
            type: "string",
            alias: "p",
            default: DEFAULT_PATH_PREFIX
          },
          "address-count": {
            description: `Number of addresses to derive and check (the "${ADDRESS_INDEX}" component)`,
            type: "number",
            default: DEFAULT_ADDRESS_COUNT
          },
          "address-start": {
            description: "Starting address index",
            type: "number",
            default: DEFAULT_START
          },
          "path-count": {
            description: `Number of paths to derive and check (the "${PATH_INDEX}" component)`,
            type: "number",
            default: DEFAULT_PATH_COUNT
          },
          "path-start": {
            description: "Starting path index",
            type: "number",
            default: DEFAULT_START
          },
          "hide-empty-addresses": {
            description: "Hide empty addresses",
            alias: "h",
            type: "boolean",
            default: false
          },
          csv: {
            description: "The CSV reports output directory (optional)",
            type: "string",
            alias: "r",
            requiresArg: true
          }
        },
        async ({ path, addressStart, addressCount, pathCount, pathStart, hideEmptyAddresses, csv }) => {
          await scanner.scan({
            path,
            addressCount,
            addressStart,
            pathCount,
            pathStart,
            hideEmptyAddresses,
            csvOutputDir: csv
          });
        }
      )
      .parse();

    process.exit(0);
  } catch (e) {
    if (e instanceof Error) {
      Logger.fatal(e.stack);
    } else {
      Logger.fatal(e);
    }

    process.exit(1);
  }
};

main();
