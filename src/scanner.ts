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
  hideSmallAddresses: boolean | number;
  skipBalance: boolean;
  csvOutputPath?: string;
}

export class Scanner {
  private provider: JsonRpcProvider;
  private balance: Balance;
  private appETH: AppETH | null = null;
  private path: string = "";
  private mCount: number = 0;
  private mStart: number = 0;
  private nCount: number = 0;
  private nStart: number = 0;
  private oCount: number = 0;
  private oStart: number = 0;
  private hasMIndex: boolean = false;
  private hasNIndex: boolean = false;

  private readonly BALANCES_BATCH = 100;

  constructor({ rpc }: ScannerOptions) {
    this.provider = new JsonRpcProvider(rpc);

    this.balance = new Balance(this.provider);
  }

  private async initializeAppETH(): Promise<void> {
    if (this.appETH) {
      return;
    }

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
    this.appETH = new AppETH(transport);
  }

  private initializePathParams(
    path: string,
    mCount: number,
    mStart: number,
    nCount: number,
    nStart: number,
    oCount: number,
    oStart: number
  ) {
    this.path = path;
    this.mCount = mCount;
    this.mStart = mStart;
    this.nCount = nCount;
    this.nStart = nStart;
    this.oCount = oCount;
    this.oStart = oStart;
    this.hasMIndex = this.verifyPath(path, M_INDEX);
    this.hasNIndex = this.verifyPath(path, N_INDEX);
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
    this.initializePathParams(path, mCount, mStart, nCount, nStart, oCount, oStart);

    if (this.oCount === 0) {
      throw new Error(`Invalid ${O_INDEX} count`);
    }

    if (!this.verifyPath(this.path, O_INDEX)) {
      throw new Error(`Missing ${O_INDEX} index component`);
    }

    if (this.hasMIndex && this.mCount === 0) {
      throw new Error(`Invalid ${M_INDEX} count`);
    }
    if (this.hasNIndex && this.nCount === 0) {
      throw new Error(`Invalid ${N_INDEX} count`);
    }

    Logger.info(`Scanning all addresses starting from path ${this.path}...`);
    Logger.info();

    const oIndexes = this.oCount === 1 ? `${this.oStart}` : `${this.oStart}...${this.oStart + this.oCount - 1}`;
    const mIndexes = this.hasMIndex
      ? this.mCount === 1
        ? `${this.mStart}`
        : `${this.mStart}...${this.mStart + this.mCount - 1}`
      : null;
    const nIndexes = this.hasNIndex
      ? this.nCount === 1
        ? `${this.nStart}`
        : `${this.nStart}...${this.nStart + this.nCount - 1}`
      : null;

    if (this.hasMIndex) {
      Logger.notice(`  ${M_INDEX} Indexes: ${mIndexes} (total of ${this.mCount})`);
    }
    if (this.hasNIndex) {
      Logger.notice(`  ${N_INDEX} Indexes: ${nIndexes} (total of ${this.nCount})`);
    }
    Logger.notice(`  ${O_INDEX} Indexes: ${oIndexes} (total of ${this.oCount})`);
    Logger.info();

    const pathStrings = this.generatePaths();
    const paths: PathData = {};
    for (const pathString of pathStrings) {
      paths[pathString] = {};
    }

    return this.internalScan({ paths, hideSmallAddresses, skipBalance, csvOutputPath });
  }

  public async exportPubkeys({ path, mCount, mStart, nCount, nStart, outputPath }: ExportPubKeysOptions) {
    this.initializePathParams(path, mCount, mStart, nCount, nStart, 0, 0);

    if (!this.verifyPath(this.path, O_INDEX)) {
      throw new Error(`Missing ${O_INDEX} index component`);
    }

    if (this.hasMIndex && this.mCount === 0) {
      throw new Error(`Invalid ${M_INDEX} count`);
    }
    if (this.hasNIndex && this.nCount === 0) {
      throw new Error(`Invalid ${N_INDEX} count`);
    }

    Logger.info(`Exporting all public keys and chain codes starting from path ${this.path}...`);
    Logger.info();

    const mIndexes = this.hasMIndex
      ? this.mCount === 1
        ? `${this.mStart}`
        : `${this.mStart}...${this.mStart + this.mCount - 1}`
      : null;
    const nIndexes = this.hasNIndex
      ? this.nCount === 1
        ? `${this.nStart}`
        : `${this.nStart}...${this.nStart + this.nCount - 1}`
      : null;

    if (this.hasMIndex) {
      Logger.notice(`  ${M_INDEX} Indexes: ${mIndexes} (total of ${this.mCount})`);
    }
    if (this.hasNIndex) {
      Logger.notice(`  ${N_INDEX} Indexes: ${nIndexes} (total of ${this.nCount})`);
    }
    Logger.info();

    await this.initializeAppETH();

    const totalPaths =
      this.hasMIndex && this.hasNIndex
        ? this.mCount * this.nCount
        : this.hasMIndex
          ? this.mCount
          : this.hasNIndex
            ? this.nCount
            : 1;
    const progressBar = new CliProgress.SingleBar(
      {
        format: "{label} | {bar} {percentage}% | ETA: {eta}s | {value}/{total}",
        autopadding: true
      },
      CliProgress.Presets.shades_classic
    );
    progressBar.start(totalPaths, 0);

    const data = await this.generateDerivationPaths(progressBar);

    progressBar.stop();

    Logger.info();

    this.showPublicKeys(data);

    if (outputPath) {
      this.exportPublicKeys(outputPath, data);
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
    this.initializePathParams(path, mCount, mStart, nCount, nStart, oCount, oStart);

    if (this.oCount === 0) {
      throw new Error(`Invalid ${O_INDEX} count`);
    }

    if (!this.verifyPath(this.path, O_INDEX)) {
      throw new Error(`Missing ${O_INDEX} index component`);
    }

    if (this.hasMIndex && this.mCount === 0) {
      throw new Error(`Invalid ${M_INDEX} count`);
    }
    if (this.hasNIndex && this.nCount === 0) {
      throw new Error(`Invalid ${N_INDEX} count`);
    }

    Logger.info(`Exporting all addresses starting from path ${this.path}...`);
    Logger.info();

    const oIndexes = this.oCount === 1 ? `${this.oStart}` : `${this.oStart}...${this.oStart + this.oCount - 1}`;
    const mIndexes = this.hasMIndex
      ? this.mCount === 1
        ? `${this.mStart}`
        : `${this.mStart}...${this.mStart + this.mCount - 1}`
      : null;
    const nIndexes = this.hasNIndex
      ? this.nCount === 1
        ? `${this.nStart}`
        : `${this.nStart}...${this.nStart + this.nCount - 1}`
      : null;

    Logger.notice(`  ${O_INDEX} Indexes: ${oIndexes} (total of ${this.oCount})`);
    if (this.hasMIndex) {
      Logger.notice(`  ${M_INDEX} Indexes: ${mIndexes} (total of ${this.mCount})`);
    }
    if (this.hasNIndex) {
      Logger.notice(`  ${N_INDEX} Indexes: ${nIndexes} (total of ${this.nCount})`);
    }
    Logger.info();

    await this.initializeAppETH();

    const derivationPathCount =
      this.hasMIndex && this.hasNIndex
        ? this.mCount * this.nCount
        : this.hasMIndex
          ? this.mCount
          : this.hasNIndex
            ? this.nCount
            : 1;
    const totalAddresses = derivationPathCount * this.oCount;
    const progressBar = new CliProgress.SingleBar(
      {
        format: "{label} | {bar} {percentage}% | ETA: {eta}s | {value}/{total}",
        autopadding: true
      },
      CliProgress.Presets.shades_classic
    );
    progressBar.start(totalAddresses, 0);

    const ledgerAddresses = await this.deriveAddressesFromPaths(progressBar);

    progressBar.stop();

    Logger.info();

    this.showAddresses(ledgerAddresses, {}, false);

    if (outputPath) {
      this.exportAddressesToFile(outputPath, ledgerAddresses, true);
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
    this.initializePathParams("", 0, 0, 0, 0, oCount, oStart);
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

      if (!this.verifyPath(path, O_INDEX)) {
        throw new Error(`Missing ${O_INDEX} index component`);
      }

      paths[path] = { publicKey, chainCode };
    }

    this.internalScan({ paths, hideSmallAddresses, skipBalance, csvOutputPath });
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
      const oCount = Object.keys(ledgerAddresses).length;
      const progressBar = new CliProgress.SingleBar(
        {
          format: "{label} | {bar} {percentage}% | ETA: {eta}s | {value}/{total}",
          autopadding: true
        },
        CliProgress.Presets.shades_classic
      );
      progressBar.start(oCount, 0);

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

        if (balancePromises.length >= this.BALANCES_BATCH) {
          await Promise.all(balancePromises);
          balancePromises.length = 0;
        }
      }

      // Await any remaining promises
      if (balancePromises.length > 0) {
        await Promise.all(balancePromises);
      }

      progressBar.stop();
    }

    Logger.info();

    this.showAddresses(ledgerAddresses, amounts, !skipBalance);

    if (csvOutputPath) {
      this.exportAddressesToCSV(csvOutputPath, ledgerAddresses, amounts, skipBalance);
    }
  }

  private async internalScan({ paths, hideSmallAddresses, skipBalance, csvOutputPath }: InternalScanOptions) {
    await this.initializeAppETH();

    const ledgerAddresses: LedgerAddresses = {};

    const pathCount = Object.keys(paths).length;
    const progressBar = new CliProgress.SingleBar(
      {
        format: "{label} | {bar} {percentage}% | ETA: {eta}s | {value}/{total}",
        autopadding: true
      },
      CliProgress.Presets.shades_classic
    );
    progressBar.start(this.oCount * pathCount, 0);

    const amounts: AddressAmounts = {};

    for (const [path, pubkeyData] of Object.entries(paths)) {
      const balancePromises: Promise<void>[] = [];

      let publicKey: string;
      let chainCode: string | undefined;

      if (isEmpty(pubkeyData)) {
        ({ publicKey, chainCode } = await this.appETH!.getAddress(
          path.replace(new RegExp(O_INDEX, "g"), ""),
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

      for (let addressIndex = this.oStart; addressIndex < this.oStart + this.oCount; ++addressIndex) {
        addresses[addressIndex] = this.derive(hdk, addressIndex);
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

        if (balancePromises.length >= this.BALANCES_BATCH) {
          await Promise.all(balancePromises);

          balancePromises.length = 0;
        }
      }

      // Await any remaining promises
      if (balancePromises.length > 0) {
        await Promise.all(balancePromises);
      }
    }

    progressBar.stop();

    Logger.info();

    this.showAddresses(ledgerAddresses, amounts, !skipBalance);

    if (csvOutputPath) {
      this.exportAddressesToCSV(csvOutputPath, ledgerAddresses, amounts, skipBalance);
    }
  }

  private showAddresses(ledgerAddresses: LedgerAddresses, amounts: AddressAmounts, showBalance: boolean) {
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

  private exportAddressesToFile(outputPath: string, ledgerAddresses: LedgerAddresses, skipBalance: boolean = true) {
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

  private showPublicKeys(data: Record<string, PubkeyData>) {
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

  private exportPublicKeys(outputPath: string, data: Record<string, PubkeyData>) {
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

  private verifyPath(path: string, component: string) {
    const regex = new RegExp(`/${component}[/']?|/${component}['"]?$`);

    return regex.test(path);
  }

  private async getAddressData(derivationPath: string): Promise<{ publicKey: string; chainCode: string }> {
    const { publicKey, chainCode } = await this.appETH!.getAddress(
      derivationPath.replace(new RegExp(O_INDEX, "g"), ""),
      false,
      true
    );

    if (!chainCode) {
      throw new Error("Invalid chain code");
    }

    return { publicKey, chainCode };
  }

  private createHDKey(publicKey: string, chainCode: string): HDKey {
    const hdk = new HDKey();
    hdk.publicKey = Buffer.from(publicKey, "hex");
    hdk.chainCode = Buffer.from(chainCode, "hex");
    return hdk;
  }

  private transferBalancesToAddresses(
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

  private exportAddressesToCSV(
    csvOutputPath: string,
    ledgerAddresses: LedgerAddresses,
    amounts: AddressAmounts,
    skipBalance: boolean
  ): void {
    this.transferBalancesToAddresses(ledgerAddresses, amounts, skipBalance);
    this.exportAddressesToFile(csvOutputPath, ledgerAddresses, skipBalance);
  }

  private generatePaths(): string[] {
    const paths: string[] = [];

    if (this.hasMIndex && this.hasNIndex) {
      for (let mIndex = this.mStart; mIndex < this.mStart + this.mCount; ++mIndex) {
        for (let nIndex = this.nStart; nIndex < this.nStart + this.nCount; ++nIndex) {
          const mPath = this.path.replace(new RegExp(M_INDEX, "g"), mIndex.toString());
          const nPath = mPath.replace(new RegExp(N_INDEX, "g"), nIndex.toString());
          paths.push(nPath);
        }
      }
    } else if (this.hasMIndex) {
      for (let mIndex = this.mStart; mIndex < this.mStart + this.mCount; ++mIndex) {
        paths.push(this.path.replace(new RegExp(M_INDEX, "g"), mIndex.toString()));
      }
    } else if (this.hasNIndex) {
      for (let nIndex = this.nStart; nIndex < this.nStart + this.nCount; ++nIndex) {
        paths.push(this.path.replace(new RegExp(N_INDEX, "g"), nIndex.toString()));
      }
    } else {
      paths.push(this.path);
    }

    return paths;
  }

  private async generateDerivationPaths(
    progressBar?: CliProgress.SingleBar
  ): Promise<Record<string, { publicKey: string; chainCode: string }>> {
    const data: Record<string, { publicKey: string; chainCode: string }> = {};

    if (this.hasMIndex && this.hasNIndex) {
      for (let mIndex = this.mStart; mIndex < this.mStart + this.mCount; ++mIndex) {
        for (let nIndex = this.nStart; nIndex < this.nStart + this.nCount; ++nIndex) {
          const mPath = this.path.replace(new RegExp(M_INDEX, "g"), mIndex.toString());
          const derivationPath = mPath.replace(new RegExp(N_INDEX, "g"), nIndex.toString());
          const { publicKey, chainCode } = await this.getAddressData(derivationPath);

          data[derivationPath] = { publicKey, chainCode };

          progressBar?.increment(1, { label: `Generating ${derivationPath}` });
        }
      }
    } else if (this.hasMIndex) {
      for (let mIndex = this.mStart; mIndex < this.mStart + this.mCount; ++mIndex) {
        const derivationPath = this.path.replace(new RegExp(M_INDEX, "g"), mIndex.toString());
        const { publicKey, chainCode } = await this.getAddressData(derivationPath);

        data[derivationPath] = { publicKey, chainCode };

        progressBar?.increment(1, { label: `Generating ${derivationPath}` });
      }
    } else if (this.hasNIndex) {
      for (let nIndex = this.nStart; nIndex < this.nStart + this.nCount; ++nIndex) {
        const derivationPath = this.path.replace(new RegExp(N_INDEX, "g"), nIndex.toString());
        const { publicKey, chainCode } = await this.getAddressData(derivationPath);

        data[derivationPath] = { publicKey, chainCode };

        progressBar?.increment(1, { label: `Generating ${derivationPath}` });
      }
    } else {
      const { publicKey, chainCode } = await this.getAddressData(this.path);

      data[this.path] = { publicKey, chainCode };

      progressBar?.increment(1, { label: `Generating ${this.path}` });
    }

    return data;
  }

  private async deriveAddressesFromPaths(progressBar: CliProgress.SingleBar): Promise<LedgerAddresses> {
    const ledgerAddresses: LedgerAddresses = {};

    const derivationData = await this.generateDerivationPaths(progressBar);

    for (const [derivationPath, { publicKey, chainCode }] of Object.entries(derivationData)) {
      const hdk = this.createHDKey(publicKey, chainCode);

      for (let addressIndex = this.oStart; addressIndex < this.oStart + this.oCount; ++addressIndex) {
        const address = this.derive(hdk, addressIndex);
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

  private derive(hdk: HDKey, index: number) {
    const derivedKey = hdk.derive(`m/${index}`);
    if (!derivedKey.publicKey) {
      throw new Error("Invalid derived key");
    }

    const address = computeAddress(`0x${derivedKey.publicKey.toString("hex")}`);

    return getAddress(hexlify(address));
  }
}
