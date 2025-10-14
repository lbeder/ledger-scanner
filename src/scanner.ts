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

export const M_INDEX = "M";
export const N_INDEX = "N";
export const O_INDEX = "O";
export const DEFAULT_O_COUNT = 500;
export const DEFAULT_M_COUNT = 1;
export const DEFAULT_M_START = 0;
export const DEFAULT_N_COUNT = 1;
export const DEFAULT_N_START = 0;
export const DEFAULT_PATH_PREFIX = `m/44'/60'/${M_INDEX}'/${N_INDEX}'/${O_INDEX}`;
export const DEFAULT_O_START = 0;

interface ScannerOptions {
  rpc: string;
}

type Address = string;
interface LedgerAddress {
  index: number;
  path: string;
  address: Address;
  balance?: Decimal;
}

type Asset = string;
type Amounts = Record<Asset, Decimal>;
type AddressAmounts = Record<Address, Amounts>;
type LedgerAddresses = Record<Address, LedgerAddress>;

interface ScanOptions {
  path: string;
  mCount: number;
  mStart: number;
  nCount: number;
  nStart: number;
  oCount: number;
  oStart: number;
  hideSmallAddresses: boolean | number;
  skipBalance: boolean;
  csvOutputPath?: string;
}

interface ExportPubKeysOptions {
  path: string;
  mCount: number;
  mStart: number;
  nCount: number;
  nStart: number;
  outputPath?: string;
}

interface ExportAddressesOptions {
  path: string;
  mCount: number;
  mStart: number;
  nCount: number;
  nStart: number;
  oCount: number;
  oStart: number;
  outputPath?: string;
}

interface ScanPubkeysOptions {
  oCount: number;
  oStart: number;
  hideSmallAddresses: boolean | number;
  skipBalance: boolean;
  inputPath: string;
  csvOutputPath?: string;
}

interface ScanAddressesOptions {
  hideSmallAddresses: boolean | number;
  skipBalance: boolean;
  inputPath: string;
  csvOutputPath?: string;
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
  oCount: number;
  oStart: number;
  hideSmallAddresses: boolean | number;
  skipBalance: boolean;
  csvOutputPath?: string;
}

export class Scanner {
  private provider: JsonRpcProvider;
  private balance: Balance;

  private static readonly BALANCES_BATCH = 100;

  constructor({ rpc }: ScannerOptions) {
    this.provider = new JsonRpcProvider(rpc);

    this.balance = new Balance(this.provider);
  }

  public scan({
    path,
    mCount,
    mStart,
    nCount,
    nStart,
    oCount,
    oStart,
    hideSmallAddresses,
    skipBalance,
    csvOutputPath
  }: ScanOptions) {
    if (oCount === 0) {
      throw new Error(`Invalid ${O_INDEX} count`);
    }

    if (mCount === 0) {
      throw new Error(`Invalid ${M_INDEX} count`);
    }

    if (!Scanner.verifyPath(path, O_INDEX)) {
      throw new Error(`Missing ${O_INDEX} index component`);
    }

    const hasMIndex = Scanner.verifyPath(path, M_INDEX);
    const hasNIndex = Scanner.verifyPath(path, N_INDEX);

    if (hasMIndex && mCount === 0) {
      throw new Error(`Invalid ${M_INDEX} count`);
    }
    if (hasNIndex && nCount === 0) {
      throw new Error(`Invalid ${N_INDEX} count`);
    }

    Logger.info(`Scanning all addresses starting from path ${path}...`);
    Logger.info();

    const oIndexes = oCount === 1 ? `${oStart}` : `${oStart}...${oStart + oCount - 1}`;
    const mIndexes = hasMIndex ? (mCount === 1 ? `${mStart}` : `${mStart}...${mStart + mCount - 1}`) : null;
    const nIndexes = hasNIndex ? (nCount === 1 ? `${nStart}` : `${nStart}...${nStart + nCount - 1}`) : null;

    if (hasMIndex) {
      Logger.notice(`  ${M_INDEX} Indexes: ${mIndexes} (total of ${mCount})`);
    }
    if (hasNIndex) {
      Logger.notice(`  ${N_INDEX} Indexes: ${nIndexes} (total of ${nCount})`);
    }
    Logger.notice(`  ${O_INDEX} Indexes: ${oIndexes} (total of ${oCount})`);
    Logger.info();

    const pathStrings = Scanner.generatePaths(path, hasMIndex, hasNIndex, mStart, mCount, nStart, nCount);
    const paths: PathData = {};
    for (const pathString of pathStrings) {
      paths[pathString] = {};
    }

    return this.internalScan({ paths, oStart, oCount, hideSmallAddresses, skipBalance, csvOutputPath });
  }

  public async exportPubkeys({ path, mCount, mStart, nCount, nStart, outputPath }: ExportPubKeysOptions) {
    if (!Scanner.verifyPath(path, O_INDEX)) {
      throw new Error(`Missing ${O_INDEX} index component`);
    }

    const hasMIndex = Scanner.verifyPath(path, M_INDEX);
    const hasNIndex = Scanner.verifyPath(path, N_INDEX);

    if (hasMIndex && mCount === 0) {
      throw new Error(`Invalid ${M_INDEX} count`);
    }
    if (hasNIndex && nCount === 0) {
      throw new Error(`Invalid ${N_INDEX} count`);
    }

    Logger.info(`Exporting all public keys and chain codes starting from path ${path}...`);
    Logger.info();

    const mIndexes = hasMIndex ? (mCount === 1 ? `${mStart}` : `${mStart}...${mStart + mCount - 1}`) : null;
    const nIndexes = hasNIndex ? (nCount === 1 ? `${nStart}` : `${nStart}...${nStart + nCount - 1}`) : null;

    if (hasMIndex) {
      Logger.notice(`  ${M_INDEX} Indexes: ${mIndexes} (total of ${mCount})`);
    }
    if (hasNIndex) {
      Logger.notice(`  ${N_INDEX} Indexes: ${nIndexes} (total of ${nCount})`);
    }
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

    const totalPaths = hasMIndex && hasNIndex ? mCount * nCount : hasMIndex ? mCount : hasNIndex ? nCount : 1;
    const progressBar = multiBar.create(totalPaths, 0);

    const data = await Scanner.generateDerivationPaths(
      appETH,
      path,
      hasMIndex,
      hasNIndex,
      mStart,
      mCount,
      nStart,
      nCount
    );

    progressBar.update(totalPaths, { label: "Finished" });

    multiBar.stop();

    Logger.info();

    Scanner.showPublicKeys(data);

    if (outputPath) {
      Scanner.exportPublicKeys(outputPath, data);
    }
  }

  public async exportAddresses({
    path,
    mCount,
    mStart,
    nCount,
    nStart,
    oCount,
    oStart,
    outputPath
  }: ExportAddressesOptions) {
    if (oCount === 0) {
      throw new Error(`Invalid ${O_INDEX} count`);
    }

    if (!Scanner.verifyPath(path, O_INDEX)) {
      throw new Error(`Missing ${O_INDEX} index component`);
    }

    const hasMIndex = Scanner.verifyPath(path, M_INDEX);
    const hasNIndex = Scanner.verifyPath(path, N_INDEX);

    if (hasMIndex && mCount === 0) {
      throw new Error(`Invalid ${M_INDEX} count`);
    }
    if (hasNIndex && nCount === 0) {
      throw new Error(`Invalid ${N_INDEX} count`);
    }

    Logger.info(`Exporting all addresses starting from path ${path}...`);
    Logger.info();

    const oIndexes = oCount === 1 ? `${oStart}` : `${oStart}...${oStart + oCount - 1}`;
    const mIndexes = hasMIndex ? (mCount === 1 ? `${mStart}` : `${mStart}...${mStart + mCount - 1}`) : null;
    const nIndexes = hasNIndex ? (nCount === 1 ? `${nStart}` : `${nStart}...${nStart + nCount - 1}`) : null;

    Logger.notice(`  ${O_INDEX} Indexes: ${oIndexes} (total of ${oCount})`);
    if (hasMIndex) {
      Logger.notice(`  ${M_INDEX} Indexes: ${mIndexes} (total of ${mCount})`);
    }
    if (hasNIndex) {
      Logger.notice(`  ${N_INDEX} Indexes: ${nIndexes} (total of ${nCount})`);
    }
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

    const totalPaths =
      hasMIndex && hasNIndex
        ? mCount * nCount * oCount
        : hasMIndex
          ? mCount * oCount
          : hasNIndex
            ? nCount * oCount
            : oCount;
    const progressBar = multiBar.create(totalPaths, 0);

    const ledgerAddresses = await Scanner.deriveAddressesFromPaths(
      appETH,
      path,
      hasMIndex,
      hasNIndex,
      mStart,
      mCount,
      nStart,
      nCount,
      oStart,
      oCount,
      progressBar
    );

    progressBar.update(totalPaths, { label: "Finished" });

    multiBar.stop();

    Logger.info();

    Scanner.showAddresses(ledgerAddresses, {}, false);

    if (outputPath) {
      Scanner.exportAddresses(outputPath, ledgerAddresses, true);
    }
  }

  public async scanPubkeys({
    oCount,
    oStart,
    hideSmallAddresses,
    skipBalance,
    inputPath,
    csvOutputPath
  }: ScanPubkeysOptions) {
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

      if (!Scanner.verifyPath(path, O_INDEX)) {
        throw new Error(`Missing ${O_INDEX} index component`);
      }

      paths[path] = { publicKey, chainCode };
    }

    this.internalScan({ paths, oStart, oCount, hideSmallAddresses, skipBalance, csvOutputPath });
  }

  public async scanAddresses({ hideSmallAddresses, skipBalance, inputPath, csvOutputPath }: ScanAddressesOptions) {
    Logger.info(`Scanning all addresses from addresses file ${inputPath}...`);
    Logger.info();

    const fileStream = fs.createReadStream(inputPath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let isFirstLine = true;

    const ledgerAddresses: LedgerAddresses = {};

    for await (const line of rl) {
      if (isFirstLine) {
        isFirstLine = false;
        continue;
      }

      const [index, address, path] = line.split(",");

      if (!address || !path) {
        continue;
      }

      ledgerAddresses[address] = {
        index: parseInt(index, 10),
        address,
        path
      };
    }

    // Now scan the addresses for balances
    const amounts: AddressAmounts = {};

    if (!skipBalance) {
      const multiBar = new CliProgress.MultiBar(
        {
          format: "{label} | {bar} {percentage}% | ETA: {eta}s | {value}/{total}",
          autopadding: true
        },
        CliProgress.Presets.shades_classic
      );

      const oCount = Object.keys(ledgerAddresses).length;
      const progressBar = multiBar.create(oCount, 0);

      const balancePromises: Promise<void>[] = [];

      for (const [address, ledgerAddress] of Object.entries(ledgerAddresses)) {
        const promise = this.balance.getBalance(address).then((ethBalance) => {
          progressBar.increment(1, { label: `${ledgerAddress.path} | ${address}` });

          const threshold = typeof hideSmallAddresses === "number" ? hideSmallAddresses : 0;
          if (ethBalance.lte(threshold) && hideSmallAddresses) {
            return;
          }

          set(amounts, [address, ETH], ethBalance);
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

      progressBar.update(oCount, { label: "Finished" });
      multiBar.stop();
    }

    Logger.info();

    Scanner.showAddresses(ledgerAddresses, amounts, !skipBalance);

    if (csvOutputPath) {
      Scanner.exportAddressesToCSV(csvOutputPath, ledgerAddresses, amounts, skipBalance);
    }
  }

  private async internalScan({
    paths,
    oStart,
    oCount,
    hideSmallAddresses,
    skipBalance,
    csvOutputPath
  }: InternalScanOptions) {
    let transport;
    try {
      transport = await TransportNodeHid.create();
    } catch (error) {
      if (error instanceof Error && error.message.includes("Could not locate the bindings file")) {
        throw new Error(
          "Failed to initialize Ledger transport. This usually happens on Linux systems when native bindings are missing.\n" +
            "Please try the following solutions:\n" +
            "1. Install build dependencies: sudo apt-get install build-essential libudev-dev\n" +
            "2. Rebuild native modules: pnpm rebuild-native\n" +
            "3. If using pnpm, try: pnpm install --force\n" +
            "4. Alternative: npm install --force\n\n" +
            "Original error: " +
            error.message
        );
      }
      throw error;
    }
    const appETH = new AppETH(transport);

    const ledgerAddresses: LedgerAddresses = {};

    const multiBar = new CliProgress.MultiBar(
      {
        format: "{label} | {bar} {percentage}% | ETA: {eta}s | {value}/{total}",
        autopadding: true
      },
      CliProgress.Presets.shades_classic
    );

    const mCount = Object.keys(paths).length;
    const progressBar = multiBar.create(oCount * mCount, 0);

    const amounts: AddressAmounts = {};

    for (const [path, pubkeyData] of Object.entries(paths)) {
      const balancePromises: Promise<void>[] = [];

      let publicKey: string;
      let chainCode: string | undefined;

      if (isEmpty(pubkeyData)) {
        ({ publicKey, chainCode } = await appETH.getAddress(path.replace(new RegExp(O_INDEX, "g"), ""), false, true));

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

      for (let addressIndex = oStart; addressIndex < oStart + oCount; ++addressIndex) {
        addresses[addressIndex] = Scanner.derive(hdk, addressIndex);
      }

      for (const [addressIndex, address] of Object.entries(addresses)) {
        const addressDerivationPath = path.replace(new RegExp(O_INDEX, "g"), addressIndex);

        if (skipBalance) {
          ledgerAddresses[address] = { index: Number(addressIndex) + 1, address, path: addressDerivationPath };

          progressBar.increment(1, { label: `${addressDerivationPath} | ${address}` });

          continue;
        }

        const promise = this.balance.getBalance(address).then((ethBalance) => {
          progressBar.increment(1, { label: `${addressDerivationPath} | ${address}` });

          const threshold = typeof hideSmallAddresses === "number" ? hideSmallAddresses : 0;
          if (ethBalance.lte(threshold) && hideSmallAddresses) {
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

    progressBar.update(oCount * mCount, { label: "Finished" });

    multiBar.stop();

    Logger.info();

    Scanner.showAddresses(ledgerAddresses, amounts, !skipBalance);

    if (csvOutputPath) {
      Scanner.exportAddressesToCSV(csvOutputPath, ledgerAddresses, amounts, skipBalance);
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
          const amount = addressAmounts?.[symbol] ?? new Decimal(0);

          balances.push(amount.toCSVAmount());
        }
      }

      addressesTable.push([index.toString(), address, ...balances, path]);
    }

    Logger.table(addressesTable);
  }

  private static exportAddresses(outputPath: string, ledgerAddresses: LedgerAddresses, skipBalance: boolean = true) {
    const outputDir = path.dirname(outputPath);
    fs.mkdirSync(outputDir, { recursive: true });

    if (fs.existsSync(outputPath)) {
      throw new Error(`Output file already exists: ${outputPath}`);
    }

    const headers = skipBalance ? ["Index", "Address", "Path"] : ["Index", "Address", "Balance (ETH)", "Path"];

    fs.appendFileSync(outputPath, `${headers.join(",")}\n`);

    if (isEmpty(ledgerAddresses)) {
      return;
    }

    for (const ledgerAddress of Object.values(ledgerAddresses)) {
      const { index, path, address, balance } = ledgerAddress;
      const balanceStr = balance ? balance.toString() : "";
      const row = skipBalance ? [index, address, path] : [index, address, balanceStr, path];

      fs.appendFileSync(outputPath, `${row.join(",")}\n`);
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

  private static async getAddressData(
    appETH: AppETH,
    derivationPath: string
  ): Promise<{ publicKey: string; chainCode: string }> {
    const { publicKey, chainCode } = await appETH.getAddress(
      derivationPath.replace(new RegExp(O_INDEX, "g"), ""),
      false,
      true
    );

    if (!chainCode) {
      throw new Error("Invalid chain code");
    }

    return { publicKey, chainCode };
  }

  private static createHDKey(publicKey: string, chainCode: string): HDKey {
    const hdk = new HDKey();
    hdk.publicKey = Buffer.from(publicKey, "hex");
    hdk.chainCode = Buffer.from(chainCode, "hex");
    return hdk;
  }

  private static transferBalancesToAddresses(
    ledgerAddresses: LedgerAddresses,
    amounts: AddressAmounts,
    skipBalance: boolean
  ): void {
    if (!skipBalance) {
      for (const [address, addressAmounts] of Object.entries(amounts)) {
        if (ledgerAddresses[address] && addressAmounts[ETH]) {
          ledgerAddresses[address].balance = addressAmounts[ETH];
        }
      }
    }
  }

  private static exportAddressesToCSV(
    csvOutputPath: string,
    ledgerAddresses: LedgerAddresses,
    amounts: AddressAmounts,
    skipBalance: boolean
  ): void {
    Scanner.transferBalancesToAddresses(ledgerAddresses, amounts, skipBalance);
    Scanner.exportAddresses(csvOutputPath, ledgerAddresses, skipBalance);
  }

  private static generatePaths(
    path: string,
    hasMIndex: boolean,
    hasNIndex: boolean,
    mStart: number,
    mCount: number,
    nStart: number,
    nCount: number
  ): string[] {
    const paths: string[] = [];

    if (hasMIndex && hasNIndex) {
      for (let mIndex = mStart; mIndex < mStart + mCount; ++mIndex) {
        for (let nIndex = nStart; nIndex < nStart + nCount; ++nIndex) {
          const mPath = path.replace(new RegExp(M_INDEX, "g"), mIndex.toString());
          const nPath = mPath.replace(new RegExp(N_INDEX, "g"), nIndex.toString());
          paths.push(nPath);
        }
      }
    } else if (hasMIndex) {
      for (let mIndex = mStart; mIndex < mStart + mCount; ++mIndex) {
        paths.push(path.replace(new RegExp(M_INDEX, "g"), mIndex.toString()));
      }
    } else if (hasNIndex) {
      for (let nIndex = nStart; nIndex < nStart + nCount; ++nIndex) {
        paths.push(path.replace(new RegExp(N_INDEX, "g"), nIndex.toString()));
      }
    } else {
      paths.push(path);
    }

    return paths;
  }

  private static async generateDerivationPaths(
    appETH: AppETH,
    path: string,
    hasMIndex: boolean,
    hasNIndex: boolean,
    mStart: number,
    mCount: number,
    nStart: number,
    nCount: number
  ): Promise<Record<string, { publicKey: string; chainCode: string }>> {
    const data: Record<string, { publicKey: string; chainCode: string }> = {};

    if (hasMIndex && hasNIndex) {
      for (let mIndex = mStart; mIndex < mStart + mCount; ++mIndex) {
        for (let nIndex = nStart; nIndex < nStart + nCount; ++nIndex) {
          const mPath = path.replace(new RegExp(M_INDEX, "g"), mIndex.toString());
          const derivationPath = mPath.replace(new RegExp(N_INDEX, "g"), nIndex.toString());
          const { publicKey, chainCode } = await Scanner.getAddressData(appETH, derivationPath);
          data[derivationPath] = { publicKey, chainCode };
        }
      }
    } else if (hasMIndex) {
      for (let mIndex = mStart; mIndex < mStart + mCount; ++mIndex) {
        const derivationPath = path.replace(new RegExp(M_INDEX, "g"), mIndex.toString());
        const { publicKey, chainCode } = await Scanner.getAddressData(appETH, derivationPath);
        data[derivationPath] = { publicKey, chainCode };
      }
    } else if (hasNIndex) {
      for (let nIndex = nStart; nIndex < nStart + nCount; ++nIndex) {
        const derivationPath = path.replace(new RegExp(N_INDEX, "g"), nIndex.toString());
        const { publicKey, chainCode } = await Scanner.getAddressData(appETH, derivationPath);
        data[derivationPath] = { publicKey, chainCode };
      }
    } else {
      const { publicKey, chainCode } = await Scanner.getAddressData(appETH, path);
      data[path] = { publicKey, chainCode };
    }

    return data;
  }

  private static async deriveAddressesFromPaths(
    appETH: AppETH,
    path: string,
    hasMIndex: boolean,
    hasNIndex: boolean,
    mStart: number,
    mCount: number,
    nStart: number,
    nCount: number,
    oStart: number,
    oCount: number,
    progressBar: CliProgress.SingleBar
  ): Promise<LedgerAddresses> {
    const ledgerAddresses: LedgerAddresses = {};

    const derivationData = await Scanner.generateDerivationPaths(
      appETH,
      path,
      hasMIndex,
      hasNIndex,
      mStart,
      mCount,
      nStart,
      nCount
    );

    for (const [derivationPath, { publicKey, chainCode }] of Object.entries(derivationData)) {
      const hdk = Scanner.createHDKey(publicKey, chainCode);

      for (let addressIndex = oStart; addressIndex < oStart + oCount; ++addressIndex) {
        const address = Scanner.derive(hdk, addressIndex);
        const addressDerivationPath = derivationPath.replace(new RegExp(O_INDEX, "g"), addressIndex.toString());

        ledgerAddresses[address] = {
          index: addressIndex + 1,
          address,
          path: addressDerivationPath
        };

        progressBar.increment(1, { label: `${addressDerivationPath} | ${address}` });
      }
    }

    return ledgerAddresses;
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
