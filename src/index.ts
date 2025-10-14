#!/usr/bin/env node
import yargs from "yargs";
import "./utils/csv";
import {
  DEFAULT_M_COUNT,
  DEFAULT_M_START,
  DEFAULT_N_COUNT,
  DEFAULT_N_START,
  DEFAULT_O_COUNT,
  DEFAULT_O_START,
  DEFAULT_PATH_PREFIX,
  M_INDEX,
  N_INDEX,
  O_INDEX,
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
            description: `Derivation path template. If "${M_INDEX}" or "${N_INDEX}" components are present, the corresponding m- and n- parameters can be specified. Otherwise they are ignored. For example ${DEFAULT_PATH_PREFIX} for standard paths`,
            type: "string",
            alias: "p",
            default: DEFAULT_PATH_PREFIX
          },
          "m-count": {
            description: `Number of "${M_INDEX}" indexes to derive and check`,
            type: "number",
            default: DEFAULT_M_COUNT
          },
          "m-start": {
            description: `Starting "${M_INDEX}" index`,
            type: "number",
            default: DEFAULT_M_START
          },
          "n-count": {
            description: `Number of "${N_INDEX}" indexes to derive and check`,
            type: "number",
            default: DEFAULT_N_COUNT
          },
          "n-start": {
            description: `Starting "${N_INDEX}" index`,
            type: "number",
            default: DEFAULT_N_START
          },
          "o-count": {
            description: `Number of "${O_INDEX}" indexes to derive and check`,
            type: "number",
            default: DEFAULT_O_COUNT
          },
          "o-start": {
            description: `Starting "${O_INDEX}" index`,
            type: "number",
            default: DEFAULT_O_START
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
            description: "The CSV output file path (optional)",
            type: "string",
            alias: "r"
          }
        },
        async ({ path, mCount, mStart, nCount, nStart, oCount, oStart, hideSmallAddresses, skipBalance, csv }) => {
          await scanner.scan({
            path,
            mCount,
            mStart,
            nCount,
            nStart,
            oCount,
            oStart,
            hideSmallAddresses,
            skipBalance,
            csvOutputPath: csv
          });
        }
      )
      .command(
        "export-pubkeys",
        "Export all public keys and chain codes ",
        {
          path: {
            // eslint-disable-next-line max-len
            description: `Derivation path template. If "${M_INDEX}" or "${N_INDEX}" components are present, the corresponding m- and n- parameters can be specified. Otherwise they are ignored. For example ${DEFAULT_PATH_PREFIX} for standard paths`,
            type: "string",
            alias: "p",
            default: DEFAULT_PATH_PREFIX
          },
          "m-count": {
            description: `Number of "${M_INDEX}" indexes to derive and check`,
            type: "number",
            default: DEFAULT_M_COUNT
          },
          "m-start": {
            description: `Starting "${M_INDEX}" index`,
            type: "number",
            default: DEFAULT_M_START
          },
          "n-count": {
            description: `Number of "${N_INDEX}" indexes to derive and check`,
            type: "number",
            default: DEFAULT_N_COUNT
          },
          "n-start": {
            description: `Starting "${N_INDEX}" index`,
            type: "number",
            default: DEFAULT_N_START
          },
          output: {
            description: "The CSV output path (optional)",
            type: "string",
            alias: "o"
          }
        },
        async ({ path, mCount, mStart, nCount, nStart, output }) => {
          await scanner.exportPubkeys({
            path,
            mCount,
            mStart,
            nCount,
            nStart,
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
            description: `Derivation path template. If "${M_INDEX}" or "${N_INDEX}" components are present, the corresponding m- and n- parameters can be specified. Otherwise they are ignored. For example ${DEFAULT_PATH_PREFIX} for standard paths`,
            type: "string",
            alias: "p",
            default: DEFAULT_PATH_PREFIX
          },
          "m-count": {
            description: `Number of "${M_INDEX}" indexes to derive and check`,
            type: "number",
            default: DEFAULT_M_COUNT
          },
          "m-start": {
            description: `Starting "${M_INDEX}" index`,
            type: "number",
            default: DEFAULT_M_START
          },
          "n-count": {
            description: `Number of "${N_INDEX}" indexes to derive and check`,
            type: "number",
            default: DEFAULT_N_COUNT
          },
          "n-start": {
            description: `Starting "${N_INDEX}" index`,
            type: "number",
            default: DEFAULT_N_START
          },
          "o-count": {
            description: `Number of "${O_INDEX}" indexes to derive and check`,
            type: "number",
            default: DEFAULT_O_COUNT
          },
          "o-start": {
            description: `Starting "${O_INDEX}" index`,
            type: "number",
            default: DEFAULT_O_START
          },
          output: {
            description: "The CSV output path (optional)",
            type: "string",
            alias: "o"
          }
        },
        async ({ path, oStart, oCount, mCount, mStart, nCount, nStart, output }) => {
          await scanner.exportAddresses({
            path,
            mCount,
            mStart,
            nCount,
            nStart,
            oCount,
            oStart,
            outputPath: output
          });
        }
      )
      .command(
        "scan-pubkeys",
        "Scan all addresses via the provided public keys and chain codes file",
        {
          "o-count": {
            description: `Number of "${O_INDEX}" indexes to derive and check`,
            type: "number",
            default: DEFAULT_O_COUNT
          },
          "o-start": {
            description: `Starting "${O_INDEX}" index`,
            type: "number",
            default: DEFAULT_O_START
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

              if (arg === "true" || arg === "1") {
                return true;
              }

              return parseFloat(arg);
            }
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
            description: "The CSV output file path (optional)",
            type: "string",
            alias: "r"
          }
        },
        async ({ oCount, oStart, hideSmallAddresses, skipBalance, input, csv }) => {
          await scanner.scanPubkeys({
            oCount,
            oStart,
            hideSmallAddresses,
            skipBalance,
            inputPath: input,
            csvOutputPath: csv
          });
        }
      )
      .command(
        "scan-addresses",
        "Scan all addresses from the provided addresses CSV file",
        {
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

              if (arg === "true" || arg === "1") {
                return true;
              }

              return parseFloat(arg);
            }
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
            description: "The CSV output file path (optional)",
            type: "string",
            alias: "r"
          }
        },
        async ({ hideSmallAddresses, skipBalance, input, csv }) => {
          await scanner.scanAddresses({
            hideSmallAddresses,
            skipBalance,
            inputPath: input,
            csvOutputPath: csv
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
