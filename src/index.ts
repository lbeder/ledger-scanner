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

const VERSION = "0.13.0";

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
        rpc: {
          description: "Ethereum RPC URL",
          type: "string",
          default: "http://localhost:8545"
        }
      })
      .middleware(({ rpc }) => {
        Logger.info();

        scanner = new Scanner({ rpc });
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
          "hide-small-addresses": {
            description:
              // eslint-disable-next-line max-len
              "Hide addresses with balance less than or equal to the specified amount (in ETH). If no amount is specified, hides empty addresses. Using -h without parameters is equivalent to -h true.",
            alias: "h",
            type: "string",
            default: "false",
            coerce: (arg) => {
              if (arg === undefined) {
                return true;
              }

              if (arg === "false" || arg === "0") {
                return false;
              }

              const num = parseFloat(arg);
              if (!isNaN(num)) {
                return num;
              }

              return arg;
            }
          },
          "skip-balance": {
            description: "Skip ETH balance check",
            alias: "s",
            type: "boolean",
            default: false
          },
          csv: {
            description: "The CSV reports output directory (optional)",
            type: "string",
            alias: "r"
          }
        },
        async ({ path, addressStart, addressCount, pathCount, pathStart, hideSmallAddresses, skipBalance, csv }) => {
          await scanner.scan({
            path,
            addressCount,
            addressStart,
            pathCount,
            pathStart,
            hideSmallAddresses,
            skipBalance,
            csvOutputDir: csv
          });
        }
      )
      .command(
        "export-pubkeys",
        "Export all public keys and chain codes ",
        {
          path: {
            // eslint-disable-next-line max-len
            description: `Derivation path template. The path template should specify the address index (the "${ADDRESS_INDEX}" component) and the path index (the "${PATH_INDEX}" component). For example ${DEFAULT_PATH_PREFIX} for standard paths`,
            type: "string",
            alias: "p",
            default: DEFAULT_PATH_PREFIX
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
          output: {
            description: "The CSV output path (optional)",
            type: "string",
            alias: "o"
          }
        },
        async ({ path, pathCount, pathStart, output }) => {
          await scanner.exportPubkeys({
            path,
            pathCount,
            pathStart,
            outputPath: output
          });
        }
      )
      .command(
        "export-addresses",
        "Export all addresses",
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
          output: {
            description: "The CSV output path (optional)",
            type: "string",
            alias: "o"
          }
        },
        async ({ path, addressStart, addressCount, pathCount, pathStart, output }) => {
          await scanner.exportAddresses({
            path,
            addressCount,
            addressStart,
            pathCount,
            pathStart,
            outputPath: output
          });
        }
      )
      .command(
        "scan-pubkeys",
        "Scan all addresses via the provided public keys and chain codes file",
        {
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
          "hide-small-addresses": {
            description: "Hide empty addresses",
            alias: "h",
            type: "boolean",
            default: false
          },
          "skip-balance": {
            description: "Skip ETH balance check",
            alias: "s",
            type: "boolean",
            default: false
          },
          input: {
            description: "The CSV input path",
            type: "string",
            alias: "i",
            required: true
          },
          csv: {
            description: "The CSV reports output directory (optional)",
            type: "string",
            alias: "r"
          }
        },
        async ({ addressStart, addressCount, hideSmallAddresses, skipBalance, input, csv }) => {
          await scanner.scanPubkeys({
            addressCount,
            addressStart,
            hideSmallAddresses,
            skipBalance,
            inputPath: input,
            csvOutputDir: csv
          });
        }
      )
      .command(
        "scan-addresses",
        "Scan all addresses from the provided addresses CSV file",
        {
          "hide-small-addresses": {
            description: "Hide empty addresses",
            alias: "h",
            type: "boolean",
            default: false
          },
          "skip-balance": {
            description: "Skip ETH balance check",
            alias: "s",
            type: "boolean",
            default: false
          },
          input: {
            description: "The CSV input path",
            type: "string",
            alias: "i",
            required: true
          },
          csv: {
            description: "The CSV reports output directory (optional)",
            type: "string",
            alias: "r"
          }
        },
        async ({ hideSmallAddresses, skipBalance, input, csv }) => {
          await scanner.scanAddresses({
            hideSmallAddresses,
            skipBalance,
            inputPath: input,
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
