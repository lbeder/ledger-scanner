#!/usr/bin/env node
import yargs from "yargs";
import "./utils/csv";
import { DEFAULT_COUNT, DEFAULT_PATH_PREFIX, DEFAULT_START, Scanner } from "./scanner";
import { Logger } from "./utils/logger";

const VERSION = "0.4.0";

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
            description: `Derivation path. For example ${DEFAULT_PATH_PREFIX} for ${DEFAULT_PATH_PREFIX}\\X paths`,
            type: "string",
            alias: "p",
            default: DEFAULT_PATH_PREFIX
          },
          count: {
            description: "Number of addresses to derive and check",
            type: "number",
            alias: "c",
            default: DEFAULT_COUNT
          },
          start: {
            description: "Starting index",
            type: "number",
            alias: "s",
            default: DEFAULT_START
          },
          "show-empty-addresses": {
            description: "Show empty addresses",
            alias: "e",
            type: "boolean",
            default: false
          }
        },
        async ({ path, start, count, showEmptyAddresses }) => {
          await scanner.scan({ path, start, count, showEmptyAddresses });
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
