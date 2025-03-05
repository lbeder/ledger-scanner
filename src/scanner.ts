import fs from "fs";
import path from "path";
import * as readline from "readline";
import AppETH from "@ledgerhq/hw-app-eth";
import TransportNodeHid from "@ledgerhq/hw-transport-node-hid";
import chalk from "chalk";
import CliProgress from "cli-progress";
import Table from "cli-table";
import Decimal from "decimal.js";
import { computeAddress, getAddress, hexlify, JsonRpcProvider } from "ethers";
import HDKey from "hdkey";
import { isEmpty, set } from "lodash";
import { Balance } from "./modules";
import { ETH } from "./utils/constants";
import { Logger } from "./utils/logger";

export const ADDRESS_INDEX = "N";
export const PATH_INDEX = "M";
export const DEFAULT_ADDRESS_COUNT = 500;
export const DEFAULT_PATH_COUNT = 1;
export const DEFAULT_PATH_PREFIX = `m/44'/60'/${PATH_INDEX}'/${ADDRESS_INDEX}`;
export const DEFAULT_START = 0;

interface ScannerOptions {
  providerUrl: string;
}

type Address = string;
interface LedgerAddress {
  index: number;
  path: string;
  address: Address;
}

type Asset = string;
type Amounts = Record<Asset, Decimal>;
type AddressAmounts = Record<Address, Amounts>;
type LedgerAddresses = Record<Address, LedgerAddress>;

interface ScanOptions {
  path: string;
  addressCount: number;
  addressStart: number;
  pathCount: number;
  pathStart: number;
  hideEmptyAddresses: boolean;
  skipBalance: boolean;
  csvOutputDir?: string;
}

interface ExportPubKeysOptions {
  path: string;
  pathCount: number;
  pathStart: number;
  outputPath?: string;
}

interface ScanPubkeysOptions {
  addressCount: number;
  addressStart: number;
  hideEmptyAddresses: boolean;
  skipBalance: boolean;
  inputPath: string;
  csvOutputDir?: string;
}

type PubkeyData = {
  publicKey: string;
  chainCode: string;
};

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type PathData = Record<string, PubkeyData | {}>;

interface InternalScanOptions {
  paths: PathData;
  pubkeyData?: PubkeyData[];
  addressCount: number;
  addressStart: number;
  hideEmptyAddresses: boolean;
  skipBalance: boolean;
  csvOutputDir?: string;
}

export class Scanner {
  private provider: JsonRpcProvider;
  private balance: Balance;

  private static readonly BALANCES_BATCH = 100;
  private static readonly CSV_ADDRESSES_REPORT = "addresses.csv";

  constructor({ providerUrl }: ScannerOptions) {
    this.provider = new JsonRpcProvider(providerUrl);

    this.balance = new Balance(this.provider);
  }

  public scan({
    path,
    addressStart,
    addressCount,
    pathCount,
    pathStart,
    hideEmptyAddresses,
    skipBalance,
    csvOutputDir
  }: ScanOptions) {
    if (addressCount === 0) {
      throw new Error("Invalid address count");
    }

    if (pathCount === 0) {
      throw new Error("Invalid path count");
    }

    if (!Scanner.verifyPath(path, ADDRESS_INDEX)) {
      throw new Error("Missing address index component");
    }

    if (!Scanner.verifyPath(path, PATH_INDEX)) {
      throw new Error("Missing path index component");
    }

    Logger.info(`Scanning all addresses starting from path ${path}...`);
    Logger.info();

    const addressIndexes =
      addressCount === 1 ? `${addressStart}` : `${addressStart}...${addressStart + addressCount - 1}`;
    const pathIndexes = pathCount === 1 ? `${pathStart}` : `${pathStart}...${pathStart + pathCount - 1}`;

    Logger.notice(`  Address Indexes: ${addressIndexes} (total of ${addressCount})`);
    Logger.notice(`  Path Indexes: ${pathIndexes} (total of ${pathCount})`);
    Logger.info();

    const paths: PathData = {};

    for (let pathIndex = pathStart; pathIndex < pathStart + pathCount; ++pathIndex) {
      paths[path.replace(new RegExp(PATH_INDEX, "g"), pathIndex.toString())] = {};
    }

    return this.internalScan({ paths, addressStart, addressCount, hideEmptyAddresses, skipBalance, csvOutputDir });
  }

  public async exportPubkeys({ path, pathCount, pathStart, outputPath }: ExportPubKeysOptions) {
    if (pathCount === 0) {
      throw new Error("Invalid path count");
    }

    if (!Scanner.verifyPath(path, ADDRESS_INDEX)) {
      throw new Error("Missing address index component");
    }

    if (!Scanner.verifyPath(path, PATH_INDEX)) {
      throw new Error("Missing path index component");
    }

    Logger.info(`Exporting all public keys and chain codes starting from path ${path}...`);
    Logger.info();

    const pathIndexes = pathCount === 1 ? `${pathStart}` : `${pathStart}...${pathStart + pathCount - 1}`;

    Logger.notice(`  Path Indexes: ${pathIndexes} (total of ${pathCount})`);
    Logger.info();

    const transport = await TransportNodeHid.create();
    const appETH = new AppETH(transport);

    const multiBar = new CliProgress.MultiBar(
      {
        format: "{label} | {bar} {percentage}% | ETA: {eta}s | {value}/{total}",
        autopadding: true
      },
      CliProgress.Presets.shades_classic
    );

    const progressBar = multiBar.create(pathCount, 0);

    const data: Record<string, PubkeyData> = {};

    for (let pathIndex = pathStart; pathIndex < pathStart + pathCount; ++pathIndex) {
      const derivationPath = path.replace(new RegExp(PATH_INDEX, "g"), pathIndex.toString());

      const { publicKey, chainCode } = await appETH.getAddress(
        derivationPath.replace(new RegExp(ADDRESS_INDEX, "g"), ""),
        false,
        true
      );
      if (!chainCode) {
        throw new Error("Invalid chain code");
      }

      data[derivationPath] = { publicKey, chainCode };
    }

    progressBar.update(pathCount, { label: "Finished" });

    multiBar.stop();

    Logger.info();

    Scanner.showPublicKeys(data);

    if (outputPath) {
      Scanner.exportPublicKeys(outputPath, data);
    }
  }

  public async scanPubkeys({
    addressStart,
    addressCount,
    hideEmptyAddresses,
    skipBalance,
    inputPath,
    csvOutputDir
  }: ScanPubkeysOptions) {
    if (addressCount === 0) {
      throw new Error("Invalid address count");
    }

    Logger.info(`Scanning all addresses from public keys and chain codes file ${inputPath}...`);
    Logger.info();

    const fileStream = fs.createReadStream(inputPath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let isFirstLine = true;

    const paths: Record<string, PubkeyData> = {};

    for await (const line of rl) {
      if (isFirstLine) {
        isFirstLine = false;

        continue;
      }

      const [publicKey, chainCode, path] = line.split(",");

      if (!Scanner.verifyPath(path, ADDRESS_INDEX)) {
        throw new Error("Missing address index component");
      }

      paths[path] = { publicKey, chainCode };
    }

    this.internalScan({ paths, addressStart, addressCount, hideEmptyAddresses, skipBalance, csvOutputDir });
  }

  private async internalScan({
    paths,
    addressStart,
    addressCount,
    hideEmptyAddresses,
    skipBalance,
    csvOutputDir
  }: InternalScanOptions) {
    const transport = await TransportNodeHid.create();
    const appETH = new AppETH(transport);

    const ledgerAddresses: LedgerAddresses = {};

    const multiBar = new CliProgress.MultiBar(
      {
        format: "{label} | {bar} {percentage}% | ETA: {eta}s | {value}/{total}",
        autopadding: true
      },
      CliProgress.Presets.shades_classic
    );

    const pathCount = Object.keys(paths).length;
    const progressBar = multiBar.create(addressCount * pathCount, 0);

    const amounts: AddressAmounts = {};

    for (const [path, pubkeyData] of Object.entries(paths)) {
      const balancePromises: Promise<void>[] = [];

      let publicKey: string;
      let chainCode: string | undefined;

      if (isEmpty(pubkeyData)) {
        ({ publicKey, chainCode } = await appETH.getAddress(
          path.replace(new RegExp(ADDRESS_INDEX, "g"), ""),
          false,
          true
        ));

        if (!chainCode) {
          throw new Error("Invalid chain code");
        }
      } else {
        ({ publicKey, chainCode } = pubkeyData as any as PubkeyData);
      }

      const addresses: Record<number, string> = {};

      const hdk = new HDKey();
      hdk.publicKey = Buffer.from(publicKey, "hex");
      hdk.chainCode = Buffer.from(chainCode, "hex");

      for (let addressIndex = addressStart; addressIndex < addressStart + addressCount; ++addressIndex) {
        addresses[addressIndex] = Scanner.derive(hdk, addressIndex);
      }

      for (const [addressIndex, address] of Object.entries(addresses)) {
        const addressDerivationPath = path.replace(new RegExp(ADDRESS_INDEX, "g"), addressIndex);

        if (skipBalance) {
          ledgerAddresses[address] = { index: Number(addressIndex) + 1, address, path: addressDerivationPath };

          progressBar.increment(1, { label: `${addressDerivationPath} | ${address}` });

          continue;
        }

        const promise = this.balance.getBalance(address).then((ethBalance) => {
          progressBar.increment(1, { label: `${addressDerivationPath} | ${address}` });

          if (ethBalance.isZero() && hideEmptyAddresses) {
            return;
          }

          set(amounts, [address, ETH], ethBalance);

          ledgerAddresses[address] = { index: Number(addressIndex) + 1, address, path: addressDerivationPath };
        });

        balancePromises.push(promise);

        if (balancePromises.length >= Scanner.BALANCES_BATCH) {
          await Promise.all(balancePromises);

          balancePromises.length = 0;
        }
      }

      // Await any remaining promises
      if (balancePromises.length > 0) {
        await Promise.all(balancePromises);
      }
    }

    progressBar.update(addressCount * pathCount, { label: "Finished" });

    multiBar.stop();

    Logger.info();

    Scanner.showAddresses(ledgerAddresses, amounts, !skipBalance);

    if (csvOutputDir) {
      Scanner.exportAddresses(csvOutputDir, ledgerAddresses);
    }
  }

  private static showAddresses(ledgerAddresses: LedgerAddresses, amounts: AddressAmounts, showBalance: boolean) {
    if (isEmpty(Object.keys(ledgerAddresses))) {
      Logger.info("No addresses to show");

      return;
    }

    Logger.title("Addresses");

    const tokens = showBalance ? [ETH] : [];
    const tokenHead = showBalance ? tokens.map((symbol) => chalk.cyanBright(symbol)) : [];
    const addressesTable = new Table({
      head: [chalk.cyanBright("Index"), chalk.cyanBright("Address"), ...tokenHead, chalk.cyanBright("Path")],
      colAligns: ["middle", "middle", ...Array(tokenHead.length).fill("middle"), "middle"]
    });

    for (const ledgerAddress of Object.values(ledgerAddresses)) {
      const { index, path, address } = ledgerAddress;
      const addressAmounts = amounts[address];
      const balances: string[] = [];

      if (showBalance) {
        for (const symbol of tokens) {
          const amount = addressAmounts[symbol] ?? new Decimal(0);

          balances.push(amount.toCSVAmount());
        }
      }

      addressesTable.push([index.toString(), address, ...balances, path]);
    }

    Logger.table(addressesTable);
  }

  private static exportAddresses(outputDir: string, ledgerAddresses: LedgerAddresses) {
    fs.mkdirSync(outputDir, { recursive: true });

    const outputPath = path.join(outputDir, Scanner.CSV_ADDRESSES_REPORT);
    if (fs.existsSync(outputPath)) {
      fs.rmSync(outputPath);
    }

    const headers = ["Index", "Address", "Path"];

    fs.appendFileSync(outputPath, `${headers.join(",")}\n`);

    if (isEmpty(ledgerAddresses)) {
      return;
    }

    for (const ledgerAddress of Object.values(ledgerAddresses)) {
      const { index, path, address } = ledgerAddress;

      fs.appendFileSync(outputPath, `${[index, address, path].join(",")}\n`);
    }

    Logger.info(`Exported address data to: ${outputPath}`);
  }

  private static showPublicKeys(data: Record<string, PubkeyData>) {
    if (isEmpty(Object.keys(data))) {
      Logger.info("No public keys to show");

      return;
    }

    Logger.title("Public Keys");

    const dataTable = new Table({
      head: [chalk.cyanBright("Public Key"), chalk.cyanBright("Chain Code"), chalk.cyanBright("Path")],
      colAligns: ["middle", "middle", "middle"]
    });

    for (const [path, { publicKey, chainCode }] of Object.entries(data)) {
      dataTable.push([publicKey, chainCode, path]);
    }

    Logger.table(dataTable);
  }

  private static exportPublicKeys(outputPath: string, data: Record<string, PubkeyData>) {
    if (fs.existsSync(outputPath)) {
      fs.rmSync(outputPath);
    }

    const headers = ["Public Key", "Chain Code", "Data"];

    fs.appendFileSync(outputPath, `${headers.join(",")}\n`);

    if (isEmpty(data)) {
      return;
    }

    for (const [path, { publicKey, chainCode }] of Object.entries(data)) {
      fs.appendFileSync(outputPath, `${[publicKey, chainCode, path].join(",")}\n`);
    }

    Logger.info(`Exported address data to: ${outputPath}`);
  }

  private static verifyPath(path: string, component: string) {
    const regex = new RegExp(`/${component}[/']?|/${component}['"]?$`);

    return regex.test(path);
  }

  private static derive(hdk: HDKey, index: number) {
    const derivedKey = hdk.derive(`m/${index}`);
    if (!derivedKey.publicKey) {
      throw new Error("Invalid derived key");
    }

    const address = computeAddress(`0x${derivedKey.publicKey.toString("hex")}`);

    return getAddress(hexlify(address));
  }
}
